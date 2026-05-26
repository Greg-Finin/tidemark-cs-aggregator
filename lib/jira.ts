import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { JiraIssue } from "./types";

/**
 * Jira issue lookup for a single customer.
 *
 * In a deployed integration this hits Jira's `/rest/api/3/search` filtered by
 * a customer label. In the demo it reads from `data/jira-issues.json` keyed by
 * company name. Same exported signature as the live client.
 */

const ISSUES_PATH = path.join(process.cwd(), "data", "jira-issues.json");

interface CachedIssues {
  at: number;
  byCompany: Record<string, JiraIssue[]>;
}

let cache: CachedIssues | null = null;

async function load(): Promise<Record<string, JiraIssue[]>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.byCompany;
  const raw = await fs.readFile(ISSUES_PATH, "utf8").catch(() => "{}");
  const byCompany = JSON.parse(raw) as Record<string, JiraIssue[]>;
  cache = { at: Date.now(), byCompany };
  return byCompany;
}

export interface ListIssuesOptions {
  limit?: number;
  openOnly?: boolean;
}

const OPEN_STATES = new Set([
  "Backlog",
  "Triage",
  "Todo",
  "To Do",
  "In Progress",
  "In Review",
]);

export async function listIssuesForCustomer(
  customerName: string,
  { limit = 25, openOnly = true }: ListIssuesOptions = {},
): Promise<{ issues: JiraIssue[]; matched_label: string }> {
  const byCompany = await load();
  const exact = byCompany[customerName];
  const all = exact
    ? exact
    : (() => {
        const needle = customerName.toLowerCase();
        for (const [k, v] of Object.entries(byCompany)) {
          if (
            k.toLowerCase().includes(needle) ||
            needle.includes(k.toLowerCase())
          ) {
            return v;
          }
        }
        return [];
      })();

  const filtered = openOnly
    ? all.filter((i) => OPEN_STATES.has(i.state))
    : all;

  const issues = [...filtered]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit);

  return {
    issues,
    matched_label: `Customer/${customerName}`,
  };
}
