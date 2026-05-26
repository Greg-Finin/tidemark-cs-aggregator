#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { InfraStack } from "../lib/infra-stack";

const app = new cdk.App();

// Pin the stack to a specific AWS account + region. CDK needs an explicit
// env to do AZ lookups for the VPC. Replace the account ID with your own
// before deploying — the value below is a placeholder so the file
// type-checks and reads correctly.
new InfraStack(app, "TidemarkCsAggregatorStack", {
  env: {
    account: "123456789012",
    region: "us-west-2",
  },
  description:
    "tidemark-cs-aggregator: CS dashboard (Next.js + Tailscale on ECS Fargate)",
});
