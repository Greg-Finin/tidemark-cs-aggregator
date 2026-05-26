"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { ZendeskTicket } from "@/lib/types";

const INITIAL_LIMIT = 5;

const STATE_TONE: Record<string, string> = {
  open: "bg-rose-50 text-rose-700 ring-rose-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-subtle text-muted ring-border",
};

function StatePill({ state }: { state: string }) {
  const tone = STATE_TONE[state] ?? "bg-subtle text-muted ring-border";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {state.replace("_", " ")}
    </span>
  );
}

export function TicketsList({ tickets }: { tickets: ZendeskTicket[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tickets : tickets.slice(0, INITIAL_LIMIT);
  const hidden = tickets.length - visible.length;

  return (
    <>
      <ul className="divide-y divide-border/60">
        {visible.map((t) => (
          <li key={t.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-navy">
                {t.number != null ? `#${t.number} · ` : ""}
                {t.title}
              </span>
              <StatePill state={t.state} />
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {formatDate(t.created_at)}
              {t.requester_email ? ` · ${t.requester_email}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {tickets.length > INITIAL_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}
