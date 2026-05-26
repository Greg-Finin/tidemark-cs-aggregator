import "server-only";
import { getAccount } from "./fixtures";
import type { AccountRow } from "./types";

/**
 * Pre-computes a structured "signals" object for an account that's compact
 * enough to be the *entire* input to the Suggest-Next-Step LLM call. Every
 * threshold has already been applied here, so the model's job is synthesis
 * rather than math — keeps the prompt small (caches well) and the output
 * deterministic.
 */
export interface AccountSignals {
  account: {
    name: string;
    csm: string | null;
    industry: string | null;
    plan_tier: string | null;
    primary_arr: number | null;
    days_until_renewal: number | null;
    renewal_bucket: "imminent" | "approaching" | "mid_term" | "far" | "unknown";
  };
  health: {
    overall: string | null;
    weakest_subscore: { name: string; value: number } | null;
  };
  usage: {
    utilization_pct: number | null;
    utilization_level: "low" | "medium" | "high" | "unknown";
    workspaces_mom_pct: number | null;
    workspaces_trend: "growing" | "flat" | "shrinking" | "unknown";
    integrations_wow_change: number | null;
    active_users: number | null;
    actions_mom_pct: number | null;
    flags: string[];
  };
  jira: {
    open: number | null;
    total: number | null;
    last_30d: number | null;
    last_90d: number | null;
    velocity: "spike" | "steady" | "quiet" | "unknown";
    engagement_read:
      | "highly_engaged"
      | "moderately_engaged"
      | "low_signal"
      | "unknown";
    latest_issue: {
      title: string;
      status: string | null;
      age_days: number | null;
    } | null;
  };
  has_strong_signal: boolean;
}

function renewalBucket(
  days: number | null,
): AccountSignals["account"]["renewal_bucket"] {
  if (days == null) return "unknown";
  if (days < 60) return "imminent";
  if (days < 120) return "approaching";
  if (days < 270) return "mid_term";
  return "far";
}

function utilizationLevel(
  pct: number | null,
): AccountSignals["usage"]["utilization_level"] {
  if (pct == null) return "unknown";
  if (pct < 40) return "low";
  if (pct < 75) return "medium";
  return "high";
}

function workspacesTrend(
  mom: number | null,
): AccountSignals["usage"]["workspaces_trend"] {
  if (mom == null) return "unknown";
  if (mom > 10) return "growing";
  if (mom < -10) return "shrinking";
  return "flat";
}

function pickWeakest(a: AccountRow): { name: string; value: number } | null {
  const subs: Array<[string, number | null]> = [
    ["customer_value", a.customer_value],
    ["engagement", a.engagement],
    ["growth_propensity", a.growth_propensity],
    ["relationships", a.relationships],
  ];
  let best: { name: string; value: number } | null = null;
  for (const [name, value] of subs) {
    if (value == null) continue;
    if (best == null || value < best.value) best = { name, value };
  }
  return best;
}

function jiraVelocity(
  last30: number | null,
  last90: number | null,
): AccountSignals["jira"]["velocity"] {
  if (last30 == null || last90 == null) return "unknown";
  if (last90 === 0) return "quiet";
  const prior60 = last90 - last30;
  const priorMonthly = prior60 / 2;
  if (last30 >= 3 && last30 > priorMonthly) return "spike";
  return "steady";
}

function jiraEngagement(
  open: number | null,
  total: number | null,
): AccountSignals["jira"]["engagement_read"] {
  if (open == null && total == null) return "unknown";
  const o = open ?? 0;
  const t = total ?? 0;
  if (o >= 10 || t >= 30) return "highly_engaged";
  if (o >= 3 || t >= 8) return "moderately_engaged";
  return "low_signal";
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function deriveSignals(a: AccountRow): AccountSignals {
  const flags: string[] = [];
  if (a.utilization_pct != null && a.utilization_pct < 40) {
    flags.push(`utilization low (${Math.round(a.utilization_pct)}%)`);
  } else if (a.utilization_pct != null && a.utilization_pct > 90) {
    flags.push(`utilization at ceiling (${Math.round(a.utilization_pct)}%)`);
  }
  if (
    a.active_workspaces_mom_pct != null &&
    Math.abs(a.active_workspaces_mom_pct) >= 10
  ) {
    const sign = a.active_workspaces_mom_pct > 0 ? "+" : "";
    flags.push(
      `active workspaces ${sign}${Math.round(a.active_workspaces_mom_pct)}% MoM`,
    );
  }
  if (
    a.active_integrations_wow_change != null &&
    Math.abs(a.active_integrations_wow_change) >= 1
  ) {
    const sign = a.active_integrations_wow_change > 0 ? "+" : "";
    flags.push(
      `active integrations ${sign}${a.active_integrations_wow_change} WoW`,
    );
  }
  if (
    a.monthly_actions_mom_pct != null &&
    Math.abs(a.monthly_actions_mom_pct) >= 20
  ) {
    const sign = a.monthly_actions_mom_pct > 0 ? "+" : "";
    flags.push(
      `monthly actions ${sign}${Math.round(a.monthly_actions_mom_pct)}% MoM`,
    );
  }

  const velocity = jiraVelocity(
    a.jira_issues_last_30d,
    a.jira_issues_last_90d,
  );
  const renewal_bucket = renewalBucket(a.days_until_renewal);

  const has_strong_signal =
    flags.length > 0 ||
    velocity === "spike" ||
    renewal_bucket === "imminent" ||
    (renewal_bucket === "approaching" &&
      (a.account_health === "Red" || a.account_health === "Yellow"));

  return {
    account: {
      name: a.hubspot_company_name,
      csm: a.csm_owner,
      industry: a.industry,
      plan_tier: a.plan_tier,
      primary_arr: a.primary_arr,
      days_until_renewal: a.days_until_renewal,
      renewal_bucket,
    },
    health: {
      overall: a.account_health,
      weakest_subscore: pickWeakest(a),
    },
    usage: {
      utilization_pct: a.utilization_pct,
      utilization_level: utilizationLevel(a.utilization_pct),
      workspaces_mom_pct: a.active_workspaces_mom_pct,
      workspaces_trend: workspacesTrend(a.active_workspaces_mom_pct),
      integrations_wow_change: a.active_integrations_wow_change,
      active_users: a.active_users,
      actions_mom_pct: a.monthly_actions_mom_pct,
      flags,
    },
    jira: {
      open: a.jira_open_issues,
      total: a.jira_total_issues,
      last_30d: a.jira_issues_last_30d,
      last_90d: a.jira_issues_last_90d,
      velocity,
      engagement_read: jiraEngagement(
        a.jira_open_issues,
        a.jira_total_issues,
      ),
      latest_issue: a.jira_latest_issue_title
        ? {
            title: a.jira_latest_issue_title,
            status: a.jira_latest_issue_status,
            age_days: daysSince(a.jira_latest_issue_created_at),
          }
        : null,
    },
    has_strong_signal,
  };
}

export async function buildAccountSignals(
  id: string,
): Promise<AccountSignals | null> {
  const account = await getAccount(id);
  if (!account) return null;
  return deriveSignals(account);
}
