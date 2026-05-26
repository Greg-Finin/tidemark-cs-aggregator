import { Sparkline } from "@/components/sparkline";
import { getAccountTrend } from "@/lib/fixtures";
import { formatNumber } from "@/lib/format";
import type { TrendMetric } from "@/lib/types";

// "sum" — per-month flow counts (actions taken, incidents opened); the 12-mo
//   total is what the panel header advertises ("Last 12 months").
// "latest" — snapshots and averages (active integrations, MTTR); summing
//   makes no sense, so we show the most recent month with a sub-label
//   to disambiguate.
type Aggregation = "sum" | "latest";

interface SeriesSpec {
  metric: TrendMetric;
  label: string;
  digits?: number;
  aggregation: Aggregation;
  compact?: boolean;
}

const SERIES: SeriesSpec[] = [
  {
    metric: "actions",
    label: "Monthly actions",
    aggregation: "sum",
    compact: true,
  },
  {
    metric: "incidents",
    label: "Incidents opened",
    aggregation: "sum",
  },
  {
    metric: "integrations",
    label: "Active integrations",
    aggregation: "latest",
  },
  {
    metric: "mttr",
    label: "MTTR (hrs)",
    digits: 1,
    aggregation: "latest",
  },
];

async function loadOne(
  companyId: string,
  spec: SeriesSpec,
): Promise<{ values: number[]; headline: number | null }> {
  const points = await getAccountTrend(companyId, spec.metric, 12);
  const values = points.map((p) => p.value);
  const headline =
    values.length === 0
      ? null
      : spec.aggregation === "sum"
        ? values.reduce((a, b) => a + b, 0)
        : values[values.length - 1];
  return { values, headline };
}

export async function TrendsPanel({ companyId }: { companyId: string }) {
  const results = await Promise.all(SERIES.map((s) => loadOne(companyId, s)));

  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-navy">Last 12 months</h2>
        <span className="text-xs text-muted">monthly</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {SERIES.map((s, i) => {
          const r = results[i];
          const aggLabel =
            s.aggregation === "sum" ? "12mo total" : "latest month";
          return (
            <div
              key={s.metric}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs text-muted">{s.label}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
                  {s.digits
                    ? r.headline == null
                      ? "—"
                      : r.headline.toFixed(s.digits)
                    : formatNumber(r.headline, { compact: s.compact })}
                </div>
                <div className="text-[10px] text-muted/70">{aggLabel}</div>
              </div>
              <Sparkline data={r.values} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
