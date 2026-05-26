import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ZendeskTicket } from "./types";

/**
 * Zendesk ticket lookup.
 *
 * In a deployed integration this hits Zendesk's `/api/v2/search.json` endpoint
 * scoped by `organization` and normalizes the response into `ZendeskTicket`.
 * In the demo it reads from `data/tickets.json` keyed by company name. The
 * exported signature is identical so the call sites in `/api/chat` and
 * `tickets-panel.tsx` are unchanged between the two.
 */

const TICKETS_PATH = path.join(process.cwd(), "data", "tickets.json");

interface CachedTickets {
  at: number;
  byCompany: Record<string, ZendeskTicket[]>;
}

let cache: CachedTickets | null = null;

async function load(): Promise<Record<string, ZendeskTicket[]>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.byCompany;
  const raw = await fs.readFile(TICKETS_PATH, "utf8").catch(() => "{}");
  const byCompany = JSON.parse(raw) as Record<string, ZendeskTicket[]>;
  cache = { at: Date.now(), byCompany };
  return byCompany;
}

/** Tickets for a single customer, newest-first, sliced to `limit`. */
export async function listTicketsForCompany(
  companyName: string,
  limit: number = 25,
): Promise<ZendeskTicket[]> {
  const byCompany = await load();
  const exact = byCompany[companyName];
  if (exact) {
    return [...exact]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, limit);
  }
  // Looser fallback — Zendesk's search is substring-aware, so partial
  // organization names still match. Mirror that behavior here.
  const needle = companyName.toLowerCase();
  for (const [k, v] of Object.entries(byCompany)) {
    if (k.toLowerCase().includes(needle) || needle.includes(k.toLowerCase())) {
      return [...v]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, limit);
    }
  }
  return [];
}
