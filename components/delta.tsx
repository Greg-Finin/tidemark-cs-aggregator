/**
 * MoM / WoW delta indicator. Positive = green, negative = rose, zero = muted.
 * Renders as a small chip suitable for inline use in a table cell.
 */
export function Delta({
  value,
  unit = "%",
  digits = 1,
  inverted = false,
}: {
  value: number | null | undefined;
  /** Suffix shown after the number — usually "%" or "" for absolute counts. */
  unit?: string;
  digits?: number;
  /** When true, negative is good (e.g. MTTR drop). Flips the color logic. */
  inverted?: boolean;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-xs text-muted">—</span>;
  }
  const good = inverted ? value < 0 : value > 0;
  const bad = inverted ? value > 0 : value < 0;
  const cls = good
    ? "text-emerald-700"
    : bad
      ? "text-rose-700"
      : "text-muted";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`text-xs font-medium tabular-nums ${cls}`}>
      {sign}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}
