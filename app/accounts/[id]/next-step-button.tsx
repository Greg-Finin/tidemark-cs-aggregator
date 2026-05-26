"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface NextStepState {
  loading: boolean;
  suggestion: string | null;
  error: string | null;
  run: (companyId: string) => Promise<void>;
}

const Ctx = createContext<NextStepState | null>(null);

export function NextStepProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(companyId: string) {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/suggest-next-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `request failed (${res.status})`);
      } else {
        setSuggestion(data.suggestion ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Ctx.Provider value={{ loading, suggestion, error, run }}>
      {children}
    </Ctx.Provider>
  );
}

function useNextStep(): NextStepState {
  const v = useContext(Ctx);
  if (!v) throw new Error("NextStepProvider missing");
  return v;
}

export function NextStepButton({ companyId }: { companyId: string }) {
  const { loading, run } = useNextStep();
  return (
    <button
      type="button"
      onClick={() => run(companyId)}
      disabled={loading}
      className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-subtle disabled:opacity-60"
    >
      {loading ? "Thinking…" : "Suggest next step"}
    </button>
  );
}

export function NextStepResult() {
  const { suggestion, error, loading } = useNextStep();
  if (!suggestion && !error && !loading) return null;
  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-sm">
      {error ? (
        <div className="text-sm text-rose-700">{error}</div>
      ) : loading ? (
        <div className="text-sm text-muted">Thinking…</div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {renderInlineBold(suggestion ?? "")}
        </div>
      )}
    </div>
  );
}

function renderInlineBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
