/** Display formatters shared across pages. */

export function formatNumber(
  n: number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  }
  return n.toLocaleString();
}

export function formatArr(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export function formatPct(
  n: number | null | undefined,
  digits = 1,
): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatDays(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 0) return `${Math.abs(n)}d ago`;
  return `${n}d`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

/** Resolve a health enum to a label + tone for the badge component. */
export function healthLabel(
  health: string | null,
): { label: string; tone: "green" | "yellow" | "red" | "neutral" } {
  switch (health) {
    case "Green":
      return { label: "Green", tone: "green" };
    case "Yellow":
      return { label: "Yellow", tone: "yellow" };
    case "Red":
      return { label: "Red", tone: "red" };
    default:
      return { label: "—", tone: "neutral" };
  }
}
