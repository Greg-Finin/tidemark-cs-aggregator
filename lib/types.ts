/**
 * Canonical account row — one row per current Tidemark customer.
 *
 * In a deployed integration this is the materialized output of a nightly
 * customer-health model that joins CRM ownership, contract data, usage
 * aggregates, support activity, and engineering issue rollups. In the demo it
 * comes from `data/accounts.json` via `lib/fixtures.ts` — same shape, no
 * warehouse dependency.
 */
export interface AccountRow {
  // ── Identity ─────────────────────────────────────────────────────────────
  tidemark_company_id: string;
  tidemark_company_uuid: string;
  hubspot_company_id: number;
  hubspot_company_name: string;

  // ── Ownership ────────────────────────────────────────────────────────────
  /** Resolved CSM display name (HubSpot owner ID → name via lib/csm.ts). */
  csm_owner: string | null;

  // ── Customer profile ─────────────────────────────────────────────────────
  industry: string | null;
  plan_tier: "Starter" | "Growth" | "Enterprise" | null;
  deployment_type: "saas" | "on-prem" | "hybrid" | null;
  cloud_environment: "aws" | "gcp" | "azure" | "multi" | null;

  // ── Contract ─────────────────────────────────────────────────────────────
  term_begin: string | null;
  term_end: string | null;
  days_until_renewal: number | null;
  primary_arr: number | null;

  // ── Health (HubSpot scores) ──────────────────────────────────────────────
  account_health: "Green" | "Yellow" | "Red" | null;
  customer_value: number | null;
  engagement: number | null;
  growth_propensity: number | null;
  relationships: number | null;
  health_score_last_updated: string | null;

  // ── Licensing / utilization ──────────────────────────────────────────────
  used_units: number | null;
  licensed_units: number | null;
  utilization_pct: number | null;
  active_users: number | null;

  // ── Workspaces (the per-customer billable resource) ──────────────────────
  active_workspaces: number | null;
  avg_active_workspaces: number | null;
  last_month_active_workspaces: number | null;
  prev_month_active_workspaces: number | null;
  active_workspaces_mom_pct: number | null;

  // ── Workflows / actions (the primary usage metric) ───────────────────────
  workflows_deployed: number | null;
  workflows_deployed_wow_change: number | null;
  active_integrations: number | null;
  active_integrations_wow_change: number | null;
  avg_monthly_actions: number | null;
  last_month_actions: number | null;
  prev_month_actions: number | null;
  monthly_actions_mom_pct: number | null;

  // ── Reliability / incidents ──────────────────────────────────────────────
  incidents_opened: number | null;
  incidents_closed: number | null;
  mttr_hours: number | null;

  // ── Reporting window (the impact-report dates) ───────────────────────────
  report_start: string | null;
  report_end: string | null;
  months_of_data: number | null;

  // ── Jira engineering issues tagged for this customer ────────────────────
  jira_total_issues: number | null;
  jira_open_issues: number | null;
  jira_completed_issues: number | null;
  jira_canceled_issues: number | null;
  jira_issues_last_30d: number | null;
  jira_issues_last_90d: number | null;
  jira_avg_days_to_close: number | null;
  jira_latest_issue_title: string | null;
  jira_latest_issue_created_at: string | null;
  jira_latest_issue_status: string | null;
  jira_latest_issue_assignee: string | null;
}

/** One point in a 12-month time series for a single metric. */
export interface TrendPoint {
  month: string; // YYYY-MM-01
  value: number;
}

export type TrendMetric =
  | "mttr"
  | "incidents"
  | "integrations"
  | "actions"
  | "users";

/** Zendesk support ticket — the subset the UI cares about. */
export interface ZendeskTicket {
  id: string;
  number: number | null;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  requester_email: string | null;
  link: string | null;
}

/** Jira engineering issue tagged for a specific customer. */
export interface JiraIssue {
  id: string;
  identifier: string;
  title: string;
  state: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  url: string;
}
