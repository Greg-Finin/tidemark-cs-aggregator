import { NextResponse } from "next/server";
import { buildAccountSignals, type AccountSignals } from "@/lib/account-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL =
  process.env.ANTHROPIC_SUGGEST_MODEL ?? "claude-haiku-4-5-20251001";

/**
 * Synthesis-only prompt — the signals object already has every threshold
 * applied, so the model never does math. Keeps the answer short and the
 * cost predictable.
 */
const SYSTEM_PROMPT = [
  "You suggest the next step a Tidemark CSM should take with a specific customer account.",
  "",
  "You receive a pre-computed signal summary. Your job is synthesis, not calculation — every threshold has already been applied.",
  "",
  "Output exactly this structure, nothing else:",
  "",
  "**Next step:** <one imperative sentence — what the CSM should do>",
  "",
  "**Read:** <one or two sentences interpreting what the signals suggest about the customer's current state. Cite the specific signals you used.>",
  "",
  "Rules:",
  "- Lead with the action, not the analysis.",
  "- If `has_strong_signal` is false, output:",
  "  **Next step:** No urgent signal — routine check-in if overdue.",
  "  **Read:** <one line summarizing the steady state>",
  "- Never invent signals not in the input.",
  "- Never recommend specific product features by name.",
  "- A 'spike' in Linear velocity does not automatically mean frustration — read it alongside health and usage. Highly engaged customers open issues; that can be a good sign.",
  "- Renewal proximity amplifies everything. 'imminent' (<60d) + any negative signal should be treated as time-sensitive.",
  "- Under 100 words total.",
].join("\n");

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicResponse {
  content: AnthropicTextBlock[];
  stop_reason: string;
}

async function callAnthropic(
  apiKey: string,
  signals: AccountSignals,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Signal summary for this account:\n```json\n" +
                JSON.stringify(signals, null, 2) +
                "\n```",
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      JSON.stringify({
        msg: "suggest.anthropic_error",
        status: res.status,
        body: text,
      }),
    );
    throw new Error(`anthropic_upstream_${res.status}`);
  }
  const json = (await res.json()) as AnthropicResponse;
  return json.content
    .filter((b): b is AnthropicTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set." },
      { status: 503 },
    );
  }

  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = body.companyId?.trim();
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 },
    );
  }

  const signals = await buildAccountSignals(companyId);
  if (!signals) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  try {
    const suggestion = await callAnthropic(apiKey, signals);
    return NextResponse.json({ suggestion, signals });
  } catch (e) {
    console.error(
      JSON.stringify({
        msg: "suggest.error",
        err: e instanceof Error ? e.message : String(e),
      }),
    );
    return NextResponse.json(
      { error: "upstream call failed; check server logs" },
      { status: 502 },
    );
  }
}
