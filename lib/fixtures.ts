import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { csmName } from "./csm";
import type { AccountRow, TrendMetric, TrendPoint } from "./types";

/**
 * Demo data layer.
 *
 * Mirrors the exported surface of a warehouse-backed account adapter
 * (`listAccounts`, `getAccount`, `getAccountTrend`) so every UI component
 * downstream is identical between the two. The deployed version would query
 * nightly-refreshed customer-health and monthly trend aggregates, then cache
 * the result in-memory until 06:00 UTC. The demo reads from `data/accounts.json`
 * and `data/trends.json`.
 */

const ACCOUNTS_PATH = path.join(process.cwd(), "data", "accounts.json");
const TRENDS_PATH = path.join(process.cwd(), "data", "trends.json");

interface CachedAccounts {
  at: number;
  rows: AccountRow[];
}

interface CachedTrends {
  at: number;
  byId: Record<string, Partial<Record<TrendMetric, TrendPoint[]>>>;
}

let accountsCache: CachedAccounts | null = null;
let trendsCache: CachedTrends | null = null;

// Cache invalidates at 06:00 UTC daily — matching the nightly-refresh
// cadence. Restart the dev server (or `rm -rf .next`) to bust mid-day.
const REFRESH_HOUR_UTC = 6;

function lastRefreshBoundary(): number {
  const now = new Date();
  const b = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), REFRESH_HOUR_UTC),
  );
  if (b.getTime() > now.getTime()) b.setUTCDate(b.getUTCDate() - 1);
  return b.getTime();
}

async function loadAccounts(): Promise<AccountRow[]> {
  if (accountsCache && accountsCache.at >= lastRefreshBoundary()) {
    return accountsCache.rows;
  }
  const raw = await fs.readFile(ACCOUNTS_PATH, "utf8");
  const rows = (JSON.parse(raw) as AccountRow[]).map((r) => ({
    ...r,
    // Resolve the HubSpot-owner-ID-style csm_owner field to a display name,
    // matching what the warehouse adapter would do in `normalize()`.
    csm_owner: csmName(r.csm_owner),
  }));
  accountsCache = { at: Date.now(), rows };
  return rows;
}

async function loadTrends(): Promise<CachedTrends["byId"]> {
  if (trendsCache && trendsCache.at >= lastRefreshBoundary()) {
    return trendsCache.byId;
  }
  const raw = await fs.readFile(TRENDS_PATH, "utf8").catch(() => "{}");
  const byId = JSON.parse(raw) as CachedTrends["byId"];
  trendsCache = { at: Date.now(), byId };
  return byId;
}

export async function listAccounts(): Promise<AccountRow[]> {
  return loadAccounts();
}

export async function getAccount(
  companyId: string,
): Promise<AccountRow | null> {
  const rows = await loadAccounts();
  return (
    rows.find(
      (r) =>
        r.tidemark_company_id === companyId ||
        r.tidemark_company_uuid === companyId,
    ) ?? null
  );
}

export async function getAccountTrend(
  companyId: string,
  metric: TrendMetric,
  months: number = 12,
): Promise<TrendPoint[]> {
  const byId = await loadTrends();
  const series = byId[companyId]?.[metric] ?? [];
  // Newest months last; cap to the requested window.
  return series.slice(-months);
}
