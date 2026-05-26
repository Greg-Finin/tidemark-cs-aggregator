"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Delta } from "@/components/delta";
import { HealthBadge } from "@/components/health-badge";
import { allCsmNames } from "@/lib/csm";
import {
  formatArr,
  formatDays,
  formatNumber,
  formatPct,
} from "@/lib/format";
import { CSM_COOKIE } from "@/lib/preferences";
import type { AccountRow } from "@/lib/types";

type SortKey =
  | "name"
  | "csm"
  | "arr"
  | "renewal"
  | "util"
  | "actionsMoM"
  | "openIssues";

interface Props {
  accounts: AccountRow[];
  initialCsm: string;
}

const SORTABLE_HEADERS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "name", label: "Account" },
  { key: "csm", label: "CSM" },
  { key: "arr", label: "ARR", align: "right" },
  { key: "renewal", label: "Renewal", align: "right" },
  { key: "util", label: "Utilization", align: "right" },
  { key: "actionsMoM", label: "Actions MoM", align: "right" },
  { key: "openIssues", label: "Open issues", align: "right" },
];

function setCookie(name: string, value: string, maxAgeDays = 90) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${
    maxAgeDays * 86_400
  }; SameSite=Lax`;
}

export function AccountsTable({ accounts, initialCsm }: Props) {
  const [search, setSearch] = useState("");
  const [csm, setCsm] = useState(initialCsm);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "arr",
    dir: "desc",
  });

  // Persist the CSM filter — each user lands on their own book next visit.
  useEffect(() => {
    setCookie(CSM_COOKIE, csm);
  }, [csm]);

  const csmOptions = useMemo(() => ["all", ...allCsmNames()], []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (csm !== "all" && a.csm_owner !== csm) return false;
      if (!q) return true;
      return (
        a.hubspot_company_name.toLowerCase().includes(q) ||
        (a.industry ?? "").toLowerCase().includes(q)
      );
    });
  }, [accounts, search, csm]);

  const sorted = useMemo(() => {
    const cmp = (a: AccountRow, b: AccountRow): number => {
      switch (sort.key) {
        case "name":
          return a.hubspot_company_name.localeCompare(b.hubspot_company_name);
        case "csm":
          return (a.csm_owner ?? "").localeCompare(b.csm_owner ?? "");
        case "arr":
          return (a.primary_arr ?? 0) - (b.primary_arr ?? 0);
        case "renewal":
          return (
            (a.days_until_renewal ?? Number.POSITIVE_INFINITY) -
            (b.days_until_renewal ?? Number.POSITIVE_INFINITY)
          );
        case "util":
          return (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0);
        case "actionsMoM":
          return (
            (a.monthly_actions_mom_pct ?? 0) -
            (b.monthly_actions_mom_pct ?? 0)
          );
        case "openIssues":
          return (a.jira_open_issues ?? 0) - (b.jira_open_issues ?? 0);
      }
    };
    const out = [...filtered].sort(cmp);
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts or industries…"
          className="w-64 rounded-md border border-border bg-panel px-3 py-1.5 text-sm shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={csm}
          onChange={(e) => setCsm(e.target.value)}
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {csmOptions.map((o) => (
            <option key={o} value={o}>
              {o === "all" ? "All CSMs" : o}
            </option>
          ))}
        </select>
        <p className="ml-auto text-xs text-muted">
          {sorted.length} of {accounts.length} accounts
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-sm">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-subtle text-left text-xs font-medium uppercase tracking-wide text-muted">
            <tr>
              {SORTABLE_HEADERS.map(({ key, label, align }) => (
                <th
                  key={key}
                  className={`cursor-pointer select-none px-4 py-2.5 hover:text-navy ${
                    align === "right" ? "text-right" : ""
                  }`}
                  onClick={() =>
                    setSort((prev) =>
                      prev.key === key
                        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                        : { key, dir: "desc" },
                    )
                  }
                >
                  {label}
                  {sort.key === key && (
                    <span className="ml-1 text-muted">
                      {sort.dir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
              <th className="px-4 py-2.5">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((a) => (
              <tr
                key={a.tidemark_company_id}
                className="transition-colors hover:bg-subtle/60"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/accounts/${a.tidemark_company_id}`}
                    className="font-medium text-navy hover:text-accent"
                  >
                    {a.hubspot_company_name}
                  </Link>
                  <div className="text-xs text-muted">
                    {a.industry} · {a.plan_tier}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {a.csm_owner ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatArr(a.primary_arr)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-muted tabular-nums">
                  {formatDays(a.days_until_renewal)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPct(a.utilization_pct, 0)}
                  <span className="ml-1 text-xs text-muted">
                    ({formatNumber(a.used_units)}/
                    {formatNumber(a.licensed_units)})
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Delta value={a.monthly_actions_mom_pct} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(a.jira_open_issues)}
                </td>
                <td className="px-4 py-2.5">
                  <HealthBadge health={a.account_health} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-muted"
                >
                  No accounts match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
