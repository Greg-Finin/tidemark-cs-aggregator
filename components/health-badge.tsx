import { healthLabel } from "@/lib/format";

const TONE_CLASSES: Record<string, { pill: string; dot: string }> = {
  green: {
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  yellow: {
    pill: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
  },
  red: {
    pill: "bg-rose-50 text-rose-800 ring-rose-200",
    dot: "bg-rose-500",
  },
  neutral: {
    pill: "bg-subtle text-muted ring-border",
    dot: "bg-muted",
  },
};

export function HealthBadge({ health }: { health: string | null }) {
  const { label, tone } = healthLabel(health);
  const { pill, dot } = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
