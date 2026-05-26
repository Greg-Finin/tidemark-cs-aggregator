# infra

CDK stack for a deployed `tidemark-cs-aggregator` environment. Included here
as a **reference**: this is the production-grade infra shape. The portfolio
demo runs locally via `npm run dev` and doesn't need any of this.

## What's in the stack

| Resource | Purpose |
| --- | --- |
| VPC (10.0.0.0/16, 2 AZs, 1 NAT) | Private network for the task |
| ECR repository | Where the app's Docker image lives |
| CloudWatch log group | `stdout`/`stderr` from the container |
| Secrets Manager (single JSON secret) | All runtime credentials, keyed by env-var name |
| Fargate task definition (0.5 vCPU / 1 GB) | Next.js + Tailscale in one container |
| ECS service in private subnets | Keeps one task running, no public IP |
| GitHub Actions OIDC + deploy role | Push to ECR + roll the service from CI without long-lived keys |

## Cost

~$45/mo running 24/7. The NAT Gateway is the biggest single line item
(~$33/mo, fixed). Anthropic API usage is metered separately and capped on the
API key.

## Deploy (for reference, not part of the demo)

```bash
npm install
npx cdk bootstrap    # first time only
npx cdk deploy
```

Once the stack is up, populate the runtime secret with real values
(`aws secretsmanager put-secret-value …`) and scale the service to 1 task.

## Source

`lib/infra-stack.ts` is the source of truth. Every block has explanatory
comments — read top to bottom to understand why each piece is shaped the way
it is. The patterns (Tailscale-only ingress, single JSON secret, OIDC deploy
role, deployment circuit breaker) are the parts worth lifting; the specific
resource names and account IDs are placeholders.
