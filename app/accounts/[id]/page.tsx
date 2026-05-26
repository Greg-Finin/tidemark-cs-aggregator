import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Delta } from "@/components/delta";
import { getAccount } from "@/lib/fixtures";
import {
  formatArr,
  formatDate,
  formatNumber,
  formatPct,
} from "@/lib/format";
import { LatestJiraIssue } from "./latest-jira-issue";
import { TicketsPanel } from "./tickets-panel";
import { TrendsPanel } from "./trends-panel";

export const dynamic = "force-dynamic";

export default async function AccountOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const name = account.hubspot_company_name;

  return (
    <div className="space-y-6">
      {/* Top stat row — the numbers a CSM glances at first. */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="ARR"
          value={formatArr(account.primary_arr)}
          sub={account.plan_tier ?? null}
        />
        <Stat
          label="Utilization"
          value={
            account.utilization_pct == null
              ? "—"
              : `${Math.round(account.utilization_pct)}%`
          }
          sub={`${formatNumber(account.used_units)} / ${formatNumber(
            account.licensed_units,
          )} units`}
        />
        <Stat
          label="Active integrations"
          value={formatNumber(account.active_integrations)}
          sub={<Delta value={account.active_integrations_wow_change} unit="" digits={0} />}
        />
        <Stat
          label="Workflows deployed"
          value={formatNumber(account.workflows_deployed)}
          sub={<Delta value={account.workflows_deployed_wow_change} unit="" digits={0} />}
        />
        <Stat
          label="Active users"
          value={formatNumber(account.active_users)}
        />
      </section>

      {/* Health sub-scores + 12-month trend sparklines. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Health sub-scores">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Customer value" value={formatNumber(account.customer_value)} />
            <Row label="Engagement" value={formatNumber(account.engagement)} />
            <Row label="Growth" value={formatNumber(account.growth_propensity)} />
            <Row label="Relationships" value={formatNumber(account.relationships)} />
          </dl>
          <div className="mt-3 text-xs text-muted">
            Updated {formatDate(account.health_score_last_updated)}
          </div>
        </Panel>

        <Suspense
          fallback={
            <Panel title="Last 12 months">
              <div className="text-sm text-muted">Loading trends…</div>
            </Panel>
          }
        >
          <TrendsPanel companyId={account.tidemark_company_id} />
        </Suspense>
      </section>

      {/* Jira + Zendesk — the two engineering/support signals. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Jira · ${account.jira_open_issues ?? 0} open`}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Total" value={formatNumber(account.jira_total_issues)} />
            <Row label="Last 30d" value={formatNumber(account.jira_issues_last_30d)} />
            <Row label="Last 90d" value={formatNumber(account.jira_issues_last_90d)} />
            <Row label="Avg days to close" value={formatNumber(account.jira_avg_days_to_close)} />
          </dl>
          <Suspense fallback={null}>
            <LatestJiraIssue customerName={name} />
          </Suspense>
        </Panel>

        <Panel title="Zendesk tickets">
          <Suspense fallback={<div className="text-sm text-muted">Loading tickets…</div>}>
            <TicketsPanel companyName={name} />
          </Suspense>
        </Panel>
      </section>

      {/* Contract details, low-density but useful for renewal context. */}
      <section>
        <Panel title="Contract">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <Row label="Term begin" value={formatDate(account.term_begin)} />
            <Row label="Term end" value={formatDate(account.term_end)} />
            <Row label="ARR" value={formatArr(account.primary_arr)} />
            <Row label="Plan" value={account.plan_tier ?? "—"} />
          </dl>
        </Panel>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-navy">
        {value}
      </div>
      {sub != null && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-navy">{title}</h2>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums text-navy">{value}</dd>
    </>
  );
}

