# Architecture

## Intended Deployment Shape

```
   CSM laptop                       AWS VPC (us-west-2)
   (on tailnet) ──tailnet HTTPS──▶  Fargate task (private subnet)
                                    ├── next.js (:3000)
                                    └── tailscaled (userspace, joins tailnet)
                                              │
                                              ▼
                                       NAT Gateway (Elastic IP)
                                              │
                                              ▼
                       Snowflake / Zendesk / Jira / HubSpot / Anthropic
```

One Fargate task, 0.5 vCPU / 1 GB, runs 24/7. No public ingress, no ALB —
the only path in is the Tailscale tunnel terminated inside the container.
Snowflake's network policy allowlists the NAT Gateway's Elastic IP. Total
cost ~$45/mo AWS + metered Anthropic usage (capped on the API key).

The whole stack lives in CDK at [`infra/lib/infra-stack.ts`](./infra/lib/infra-stack.ts).

## Demo shape (this repo)

| Component | Deployed shape | Demo |
| --- | --- | --- |
| Runtime | ECS Fargate task | `npm run dev` locally |
| Ingress | Tailscale `*.ts.net` hostname | `localhost:3000` |
| Auth | Tailscale identity headers | Cookie-based "Log in as Greg" stub |
| Data source | Warehouse-backed account health view + monthly trend aggregate | `data/accounts.json` + `data/trends.json` |
| Zendesk client | Live API | Reads `data/tickets.json` |
| Jira client | Live API | Reads `data/jira-issues.json` |
| Anthropic | Live API | Live API (same) |
| Secrets | AWS Secrets Manager (single JSON secret keyed by env-var name) | Plain `.env` file |
| CI / deploy | GitHub Actions OIDC → ECR → ECS rolling update | n/a |

The **application code is identical between the two paths**. Only the data
layer (`lib/fixtures.ts` vs. a warehouse adapter) and the lib clients
(`lib/jira.ts` / `lib/zendesk.ts` mock vs. live) differ. Every exported
function signature is the same in both, so every downstream component is
unchanged.

## Why these choices

**Tailscale-only ingress, no ALB.** The tool is team-only and never needs
to be reachable from the public internet. Tailscale opens the connection
outbound from inside the task, so there's no inbound NAT, no load balancer to
maintain, and the CSM identity is already pulled from the tailnet — no second
auth system.

**Single JSON-shaped Secrets Manager entry, keyed by env-var name.** ~12
credentials at $0.40/secret/mo would be $5+/mo of pure overhead. One secret
is $0.40 and ECS resolves individual keys out of the JSON at task start. All
keys rotate together, which is fine because we don't rotate often.

**ECS service `desiredCount: 0` on first deploy.** The task definition is
ready, but nothing runs until the runtime secret is populated AND a Tailscale
auth key is in place. Manual scale-up to 1 once both are ready — prevents the
service from immediately crash-looping on missing secrets.

**Deployment circuit breaker with `rollback: true`.** A failed deploy auto-
reverts to the last working task definition in ~10 min instead of the default
3 hours. Saves a manual rollback when something is wrong.

**`minHealthyPercent: 0, maxHealthyPercent: 100`.** Default deploy behavior
runs the new and old task simultaneously, but the new Tailscale node collides
on hostname and registers with a `-1` suffix, moving the bookmarked URL.
Stop-then-start gives ~30-60s of unavailability per deploy but a stable
hostname every time. Acceptable trade for a team-facing operational tool.

**GitHub Actions OIDC deploy role.** No long-lived AWS access keys in CI
secrets. Trust scoped to pushes on `main` of this repo only; PRs and forks
can't assume it.

## Cache shape

Both data sources (accounts + trends) invalidate at a fixed **06:00 UTC daily
boundary** instead of a rolling TTL. The upstream warehouse tables are
refreshed nightly, so caching aligns to the data refresh cadence — every
workday starts on fresh data. Restart the task (or `rm -rf .next` locally) to
bust mid-day.

## LLM design notes

**Chat sidebar (`/api/chat`).** Bounded tool-use loop (MAX_TURNS = 6) with
three tools: `list_support_tickets`, `list_jira_issues_for_customer`,
`get_account_trends`. The system prompt embeds the full account snapshot as
a cache-controlled block, so the model only calls tools for things the
snapshot can't carry (ticket titles, individual issue URLs, time series).
Most questions need zero tool calls.

**"Suggest next step" (`/api/suggest-next-step`).** Different shape:
synthesis-only Haiku call against a pre-computed `AccountSignals` object.
Every threshold (renewal proximity bucket, utilization level, Jira velocity,
weakest sub-score, has_strong_signal) is applied in `lib/account-signals.ts`
before the model sees the input — so the model doesn't do math, just
narrates. Output structure is enforced by an explicit format in the system
prompt.
