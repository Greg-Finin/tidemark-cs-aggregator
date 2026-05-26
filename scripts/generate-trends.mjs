#!/usr/bin/env node
/**
 * Generates `data/trends.json` from `data/accounts.json`.
 *
 * For each account, produces 12 months of synthetic time-series data for five
 * metrics (actions, integrations, incidents, mttr, users), with the latest
 * month seeded to match the current snapshot value and earlier months walked
 * backward using a deterministic per-account RNG. This keeps the sparklines
 * coherent with the rest of the UI without us hand-rolling 900 numbers.
 *
 * Run: `node scripts/generate-trends.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ACCOUNTS = path.join(ROOT, "data", "accounts.json");
const OUT = path.join(ROOT, "data", "trends.json");

const MONTHS = 12;

/** Deterministic LCG seeded by string key — same key, same sequence. */
function makeRng(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  let s = h >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function monthLabel(offsetFromLatest) {
  // Latest = end of "last month" relative to the report window. Use 2026-05-01
  // as the anchor so the demo's "today" stays consistent across visits.
  const anchor = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
  const d = new Date(anchor);
  d.setUTCMonth(d.getUTCMonth() - offsetFromLatest);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a series ending at `latest`, walking backward with random ±noise%.
 *
 * Naively compounding the *current* MoM rate over 12 months produces
 * absurd curves — a customer currently dropping 32% MoM hasn't been doing
 * that all year. Instead: apply the recent MoM rate only to the last two
 * "inflection" steps, then use a much milder long-run rate (±2% clamped)
 * for the earlier months. That matches how these curves actually look in
 * practice — flat-ish history with a recent change.
 */
function backwardSeries(latest, recentMoMPct, noisePct, rng, integer = true) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const longRunMoM = clamp(recentMoMPct / 8, -2, 2);
  const out = [];
  let v = latest;
  const push = () => out.push(
    integer ? Math.max(0, Math.round(v)) : Math.max(0, Number(v.toFixed(2))),
  );
  push();
  for (let i = 1; i < MONTHS; i++) {
    // Last two steps inherit the recent inflection; earlier steps use the
    // damped long-run rate.
    const mom = i <= 2 ? recentMoMPct : longRunMoM;
    const factor = 1 + mom / 100;
    const noise = 1 + (rng() * 2 - 1) * (noisePct / 100);
    v = (v / factor) * noise;
    push();
  }
  // We built newest-first; reverse to oldest-first.
  return out.reverse();
}

function seriesToPoints(values) {
  return values.map((value, i) => ({
    month: monthLabel(MONTHS - 1 - i),
    value,
  }));
}

const accounts = JSON.parse(readFileSync(ACCOUNTS, "utf8"));

const result = {};
for (const a of accounts) {
  const id = a.tidemark_company_id;
  const rng = makeRng(id);

  const actionsMom = a.monthly_actions_mom_pct ?? 0;
  const usersBase = a.active_users ?? 0;
  const incidentsBase = a.incidents_opened ?? 0;

  result[id] = {
    actions: seriesToPoints(
      backwardSeries(a.last_month_actions ?? 100000, actionsMom, 8, rng),
    ),
    integrations: seriesToPoints(
      backwardSeries(
        a.active_integrations ?? 5,
        // Integrations move slowly — assume +1.5%/mo unless we see a wow drop.
        (a.active_integrations_wow_change ?? 0) >= 0 ? 1.5 : -1.0,
        4,
        rng,
      ),
    ),
    incidents: seriesToPoints(
      backwardSeries(incidentsBase / 12 || 1, 2, 35, rng),
    ),
    mttr: seriesToPoints(
      backwardSeries(a.mttr_hours ?? 4, 1, 15, rng, false),
    ),
    users: seriesToPoints(
      backwardSeries(usersBase || 5, actionsMom * 0.4, 6, rng),
    ),
  };
}

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(
  `wrote ${OUT}: ${accounts.length} accounts × 5 metrics × ${MONTHS} months`,
);
