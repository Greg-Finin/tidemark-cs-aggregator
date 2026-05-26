import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Deployment stack for the CS Aggregator web app.
 *
 *   VPC (private subnets, single NAT) →
 *     ECS Fargate service (Next.js + Tailscale sidecar inside one container) →
 *       outbound to Snowflake / Jira / Zendesk / HubSpot / Anthropic
 *
 * No public ingress. The only path into the running task is through the
 * tailnet — Tailscale terminates ingress on a `*.ts.net` hostname, and the
 * Snowflake network policy allowlists the NAT Gateway's Elastic IP.
 *
 * Cost: ~$45/mo running 24/7 (dominated by the NAT Gateway at ~$33/mo).
 */
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─────────────────────────────────────────────────────────────────
    // VPC: the private network everything runs inside.
    //
    // 10.0.0.0/16 is the address space — 65k IPs to carve up.
    //
    // maxAzs: 2 — spans two Availability Zones (us-west-2a, us-west-2b).
    //   AWS recommends multi-AZ for any durable workload. Cheap to
    //   keep this here even with a single Fargate task; lets us add RDS
    //   later (RDS requires a 2-AZ subnet group).
    //
    // natGateways: 1 — one NAT Gateway shared by both private subnets,
    //   not one per AZ. NATs run ~$0.045/hr (~$33/mo each), so this halves
    //   the cost at the price of one AZ's outbound traffic dying if that
    //   NAT fails. Acceptable for our use case; bump to 2 if we ever care
    //   about that level of HA.
    //
    // subnetConfiguration: two tiers across the AZs:
    //   - 'public': hold the NAT Gateway. Has a route to the Internet
    //     Gateway. Nothing of ours runs here.
    //   - 'private' (PRIVATE_WITH_EGRESS): where the Fargate task will
    //     live. No public IPs, no inbound from the internet. Outbound
    //     goes through the NAT.
    // ─────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: "cs-aggregator",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ─────────────────────────────────────────────────────────────────
    // ECR repository: private Docker registry where our app image lives.
    //
    // imageScanOnPush: AWS scans the image for known CVEs on every push.
    //   Free, no reason not to.
    //
    // Lifecycle: keep the 10 most recent images, delete older ones to
    //   avoid paying for storage of stale builds ($0.10/GB-mo). Each
    //   image is ~200-400 MB.
    //
    // RemovalPolicy.RETAIN: when `cdk destroy` tears down the stack,
    //   the ECR repo (and any pushed images) survives. Prevents
    //   accidental "delete the deploy + delete every image we'd need to
    //   redeploy." Set to DESTROY here only if you want a true clean
    //   teardown.
    // ─────────────────────────────────────────────────────────────────
    const repository = new ecr.Repository(this, "Repo", {
      repositoryName: "cs-aggregator-web",
      imageScanOnPush: true,
      lifecycleRules: [
        { maxImageCount: 10, description: "Keep last 10 images" },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─────────────────────────────────────────────────────────────────
    // CloudWatch log group: where all container stdout/stderr lands.
    //
    // retention: 30 days. AWS default is "Never expire" which is a
    //   silent cost trap. Logs are ~$0.03/GB-mo retained; 30 days is
    //   enough for incident response without indefinite growth.
    //
    // RemovalPolicy.DESTROY: log group is torn down with the stack.
    //   No reason to retain orphan logs; we get fresh ones on redeploy.
    // ─────────────────────────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/cs-aggregator-web",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ─────────────────────────────────────────────────────────────────
    // Secrets Manager: where all runtime credentials live.
    //
    // We use ONE secret with a JSON body keyed by env-var name, rather
    // than one secret per credential. Tradeoff:
    //   - Cost: $0.40/secret/mo. One secret = $0.40 instead of $5+/mo
    //     for ~12 individual secrets. The savings are real at our scale.
    //   - Rotation: all keys rotate together. We don't rotate often,
    //     so this is fine; revisit if any one key needs its own cadence.
    //
    // generateSecretString here creates a placeholder JSON body on first
    // deploy so the secret exists. We'll overwrite the placeholder with
    // real values via `aws secretsmanager put-secret-value` (or the
    // console). The JSON shape we'll fill in later:
    //
    //   {
    //     "SNOWFLAKE_ACCOUNT": "...",
    //     "SNOWFLAKE_USER": "...",
    //     "SNOWFLAKE_ROLE": "...",
    //     "SNOWFLAKE_WAREHOUSE": "...",
    //     "SNOWFLAKE_DATABASE": "...",
    //     "SNOWFLAKE_SCHEMA": "...",
    //     "SNOWFLAKE_PRIVATE_KEY": "...",
    //     "SNOWFLAKE_PRIVATE_KEY_PASSPHRASE": "...",
    //     "ZENDESK_API_KEY": "...",
    //     "JIRA_API_KEY": "...",
    //     "HUBSPOT_API_KEY": "...",
    //     "ANTHROPIC_API_KEY": "...",
    //     "TS_OAUTH_CLIENT_SECRET": "tskey-client-..."
    //   }
    //
    // The task definition (next block) references individual keys from
    // this JSON and injects them as env vars at task start.
    // ─────────────────────────────────────────────────────────────────
    const runtimeSecret = new secrets.Secret(this, "RuntimeSecret", {
      secretName: "cs-aggregator/runtime",
      description:
        "All runtime credentials for cs-aggregator-web (Snowflake, Zendesk, Jira, HubSpot, Anthropic, Tailscale)",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ placeholder: "overwrite-me" }),
        generateStringKey: "unused",
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // IAM Task Execution Role: used by ECS itself (not by the container
    // code) to do startup work — pull the image from ECR, read secrets,
    // write logs to CloudWatch.
    //
    // AmazonECSTaskExecutionRolePolicy is an AWS-managed policy that
    // covers the standard cases. We tack on a single inline statement
    // to allow reading our specific secret.
    // ─────────────────────────────────────────────────────────────────
    const executionRole = new iam.Role(this, "TaskExecutionRole", {
      roleName: "cs-aggregator-web-task-execution",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });
    runtimeSecret.grantRead(executionRole);

    // ─────────────────────────────────────────────────────────────────
    // IAM Task Role: the identity the container *process* assumes when
    // it makes AWS API calls. Our app talks to Snowflake/Zendesk/Jira/
    // HubSpot/Anthropic — none of which are AWS — so this role doesn't
    // need permissions for anything. Still required: AWS rejects a task
    // definition without one.
    // ─────────────────────────────────────────────────────────────────
    const taskRole = new iam.Role(this, "TaskRole", {
      roleName: "cs-aggregator-web-task",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description:
        "Runtime role for cs-aggregator-web. No AWS API calls expected; left intentionally empty.",
    });

    // ─────────────────────────────────────────────────────────────────
    // ECS cluster: a logical grouping for tasks/services. Free —
    // there's no compute attached at the cluster level when using
    // Fargate; the cluster is just a namespace.
    //
    // containerInsights: enables CloudWatch Container Insights, which
    // gives us free per-task CPU/memory/network metrics. Tiny cost,
    // useful for debugging.
    // ─────────────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: "cs-aggregator",
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ─────────────────────────────────────────────────────────────────
    // Task definition: the recipe for the running container.
    //
    // cpu/memoryLimitMiB: 0.5 vCPU and 1 GB. Fargate has a fixed set of
    //   allowed combinations; this is one of the smallest. Plenty for
    //   Next.js + Tailscale at our user count. Easy to bump later.
    //
    // We use a single-container model (not separate app + tailscale
    //   sidecar) because the Dockerfile bundles tailscaled alongside the
    //   app and runs both via entrypoint.sh. Less moving parts. We can
    //   split later if the sidecar pattern starts paying for itself.
    //
    // runtimePlatform: amd64. Our image is built with --platform
    //   linux/amd64; tell Fargate to match.
    // ─────────────────────────────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      family: "cs-aggregator-web",
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Helper: pull a key out of the JSON-shaped runtime secret as an
    // ECS Secret reference. ECS resolves these at task start and
    // injects them as env vars.
    const fromRuntime = (key: string) =>
      ecs.Secret.fromSecretsManager(runtimeSecret, key);

    taskDef.addContainer("app", {
      containerName: "cs-aggregator-web",
      image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      essential: true,
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: "app",
      }),
      // Non-secret env vars (these can sit in the task definition in
      // plaintext; they're not sensitive).
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        TS_HOSTNAME: "tidemark-cs-aggregator",
      },
      // Secret env vars. ECS pulls each value from the runtime JSON
      // secret at task start and sets it as the named env var. The
      // executionRole was already granted read on the secret above.
      secrets: {
        SNOWFLAKE_ACCOUNT: fromRuntime("SNOWFLAKE_ACCOUNT"),
        SNOWFLAKE_USER: fromRuntime("SNOWFLAKE_USER"),
        SNOWFLAKE_ROLE: fromRuntime("SNOWFLAKE_ROLE"),
        SNOWFLAKE_WAREHOUSE: fromRuntime("SNOWFLAKE_WAREHOUSE"),
        SNOWFLAKE_DATABASE: fromRuntime("SNOWFLAKE_DATABASE"),
        SNOWFLAKE_SCHEMA: fromRuntime("SNOWFLAKE_SCHEMA"),
        SNOWFLAKE_PRIVATE_KEY: fromRuntime("SNOWFLAKE_PRIVATE_KEY"),
        SNOWFLAKE_PRIVATE_KEY_PASSPHRASE: fromRuntime(
          "SNOWFLAKE_PRIVATE_KEY_PASSPHRASE",
        ),
        ZENDESK_API_KEY: fromRuntime("ZENDESK_API_KEY"),
        JIRA_API_KEY: fromRuntime("JIRA_API_KEY"),
        HUBSPOT_API_KEY: fromRuntime("HUBSPOT_API_KEY"),
        ANTHROPIC_API_KEY: fromRuntime("ANTHROPIC_API_KEY"),
        TS_OAUTH_CLIENT_SECRET: fromRuntime("TS_OAUTH_CLIENT_SECRET"),
      },
      // Container-level health check. ECS runs this inside the
      // container; we curl localhost since the app listens on :3000.
      // startPeriod gives our warmup time to finish before health
      // checks start counting.
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/api/health || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(90),
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // Security group for the task.
    //
    // Default outbound is "allow all" — task needs to reach Snowflake,
    // Zendesk, Jira, HubSpot, Anthropic, ECR (image pull), Secrets
    // Manager (secret fetch), CloudWatch (logs), and the Tailscale
    // coordination servers. All of that is outbound traffic via the
    // NAT Gateway.
    //
    // No inbound rules. Tailscale handles ingress over its own
    // encrypted tunnel terminated inside the container.
    // ─────────────────────────────────────────────────────────────────
    const taskSg = new ec2.SecurityGroup(this, "TaskSg", {
      vpc,
      description: "cs-aggregator-web Fargate task",
      allowAllOutbound: true,
    });

    // ─────────────────────────────────────────────────────────────────
    // ECS Service: keeps `desiredCount` tasks running, replaces them
    // on deploy.
    //
    // desiredCount: 0 — the task definition is ready but we don't run
    //   anything until we've populated the runtime secret AND have a
    //   Tailscale auth key. Scale up manually after both:
    //     aws ecs update-service --cluster cs-aggregator \
    //                            --service cs-aggregator-web \
    //                            --desired-count 1
    //
    // vpcSubnets PRIVATE_WITH_EGRESS: tasks land in the private
    //   subnets, outbound goes via NAT (whose Elastic IP is what
    //   Snowflake allowlists).
    //
    // assignPublicIp: false — tasks have no public IP. Belt to the
    //   subnet's suspenders.
    // ─────────────────────────────────────────────────────────────────
    const service = new ecs.FargateService(this, "Service", {
      serviceName: "cs-aggregator-web",
      cluster,
      taskDefinition: taskDef,
      desiredCount: 0,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [taskSg],
      assignPublicIp: false,
      // Minimum/maximum healthy percent during a deploy. The default
      // (100/200) overlaps the old and new task during a rollout, which
      // makes the new task's Tailscale node collide on hostname — it
      // gets re-registered with a `-1` suffix and the URL bookmark
      // moves. Setting 0/100 makes ECS stop the old task before
      // starting the new one: ~30-60s of unavailability per deploy,
      // but a stable hostname every time. Acceptable trade for a
      // team-facing operational tool.
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      // AZ rebalancing requires maxHealthyPercent > 100 (it needs
      // headroom to move tasks between zones). Our single-task config
      // above is incompatible with that, so opt out explicitly.
      availabilityZoneRebalancing: ecs.AvailabilityZoneRebalancing.DISABLED,
      // Circuit breaker: if a new task fails to come up healthy, ECS
      // gives up after ~10 min instead of the default 3 hours.
      // `rollback` means we automatically revert to the last working
      // task definition revision — useful safety net for a botched
      // deploy.
      circuitBreaker: { rollback: true },
    });

    // ─────────────────────────────────────────────────────────────────
    // GitHub Actions deploy role (OIDC).
    //
    // Lets a GitHub Actions workflow assume an AWS role via OIDC — no
    // long-lived access keys. Trust is scoped to pushes on `main` only;
    // PRs and other branches cannot assume it.
    //
    // Replace the `repo:OWNER/REPO` reference with your own repo before
    // deploying.
    //
    // Permissions: just enough to build & push to the cs-aggregator-web
    // ECR repo and force a new deployment of the cs-aggregator-web
    // service.
    // ─────────────────────────────────────────────────────────────────
    const githubOidcProvider = new iam.OpenIdConnectProvider(
      this,
      "GithubOidc",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );
    (githubOidcProvider.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(
      cdk.RemovalPolicy.RETAIN,
    );

    const deployRole = new iam.Role(this, "GithubActionsDeployRole", {
      roleName: "cs-aggregator-web-github-deploy",
      assumedBy: new iam.FederatedPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub":
              "repo:Greg-Finin/tidemark-cs-aggregator:ref:refs/heads/main",
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      description:
        "Assumed by GitHub Actions to push images to ECR and roll the ECS service.",
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // ECR: account-wide GetAuthorizationToken, repo-scoped push/pull.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );
    repository.grantPullPush(deployRole);

    // ECS: force-new-deployment + describe on this service only.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:UpdateService", "ecs:DescribeServices"],
        resources: [service.serviceArn],
      }),
    );

    // CDK deploy: assume the four CDK bootstrap roles. The bootstrap
    // roles already trust this account, so granting AssumeRole on them
    // is sufficient — no need to widen CloudFormation/IAM/EC2 perms on
    // the GitHub role itself.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*-deploy-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-*-file-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-*-image-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-*-lookup-role-${this.account}-${this.region}`,
        ],
      }),
    );

    // Stack outputs — printed after `cdk deploy`, also visible in the
    // CloudFormation console.
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "EcrRepoUri", { value: repository.repositoryUri });
    new cdk.CfnOutput(this, "RuntimeSecretArn", {
      value: runtimeSecret.secretArn,
    });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "ServiceName", { value: service.serviceName });
    new cdk.CfnOutput(this, "TaskDefinitionArn", {
      value: taskDef.taskDefinitionArn,
    });
    new cdk.CfnOutput(this, "GithubDeployRoleArn", {
      value: deployRole.roleArn,
    });
  }
}
