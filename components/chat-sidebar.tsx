"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What changed in the last 30 days?",
  "Why is this account yellow?",
  "Summarize open Zendesk tickets.",
];

export function ChatSidebar({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-30 flex h-12 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white shadow-lg shadow-accent/30 hover:bg-emerald-700"
      >
        <span>✦</span>
        Ask about {companyName}
      </button>

      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-border bg-panel shadow-xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-border bg-subtle px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-navy">
              Ask about {companyName}
            </div>
            <div className="text-xs text-muted">
              Claude has the live account snapshot and tools for Zendesk and Jira.
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setMessages([]);
                setError(null);
                setInput("");
              }}
              disabled={pending || messages.length === 0}
              className="rounded px-2 py-1 text-[11px] text-muted hover:bg-border/60 hover:text-navy disabled:opacity-40"
              aria-label="Reset conversation"
              title="Clear conversation and start fresh"
            >
              Reset
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted hover:bg-border/60 hover:text-navy"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm"
        >
          {messages.length === 0 && !pending && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Try one of these to get started:
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-md border border-border bg-subtle px-3 py-2 text-left text-sm hover:border-accent/40 hover:bg-panel"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-accent px-3 py-2 text-white"
                  : "mr-8 rounded-lg bg-subtle px-3 py-2 text-navy ring-1 ring-inset ring-border"
              }
            >
              <div
                className={`mb-1 text-[10px] uppercase tracking-wide ${
                  m.role === "user" ? "text-white/70" : "text-muted"
                }`}
              >
                {m.role === "user" ? "You" : "Claude"}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {pending && (
            <div className="mr-8 rounded-lg bg-subtle px-3 py-2 text-muted ring-1 ring-inset ring-border">
              <div className="mb-1 text-[10px] uppercase tracking-wide">
                Claude
              </div>
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm focus-within:border-accent">
            <span className="text-accent">✦</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${companyName}…`}
              disabled={pending}
              className="flex-1 bg-transparent text-navy placeholder:text-muted focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </aside>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-navy/30"
          aria-hidden
        />
      )}
    </>
  );
}
