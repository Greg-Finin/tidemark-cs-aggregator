import { NextResponse } from "next/server";
import { getAccount, getAccountTrend } from "@/lib/fixtures";
import { listIssuesForCustomer } from "@/lib/jira";
import { listTicketsForCompany } from "@/lib/zendesk";
import type { AccountRow, TrendMetric } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TURNS = 6;

// ─────────────────────────────────────────────────────────────────────────
// Anthropic message-shape types — narrow enough for what we send/receive.
// ─────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
type AnthropicBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}
interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Tool catalog given to Claude.
//
// The snapshot already has current counts and rollups; tools are for the
// things the snapshot can't carry (ticket *titles*, individual issue links,
// time series). The system prompt tells the model to lean on the snapshot
// first and only reach for tools when the snapshot can't answer.
// ─────────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_support_tickets",
    description:
      "List Zendesk support tickets for the current company. Returns up to `limit` tickets, newest first, with id/number/title/state/created_at/updated_at/link.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max tickets to return (1-50). Default 10.",
        },
      },
    },
  },
  {
    name: "list_jira_issues_for_customer",
    description:
      "Authoritative list of Tidemark engineering issues (Jira) tagged for this customer. Use whenever the user asks what engineering issues/bugs/work this customer cares about. Newest-updated first; open-only by default.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description:
            "Customer name as it appears in the Jira label (e.g. 'Northwind Logistics'). If omitted, the current account's name is used.",
        },
        open_only: {
          type: "boolean",
          description: "Default true. Set false to include completed/canceled.",
        },
        limit: {
          type: "number",
          description: "Max issues to return (1-100). Default 25.",
        },
      },
    },
  },
  {
    name: "get_account_trends",
    description:
      "12-month (or up to 36) time series for this account on one of: 'mttr' (avg hours to resolve), 'incidents' (incidents opened/month), 'integrations' (active integrations), 'actions' (monthly actions), 'users' (monthly active users). Use for any trend/QBR-chart question.",
    input_schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["mttr", "incidents", "integrations", "actions", "users"],
        },
        months: { type: "number", description: "1-36, default 12" },
      },
      required: ["metric"],
    },
  },
] as const;

function systemPrompt(account: AccountRow): string {
  return [
    "You are the Tidemark Customer Success assistant for one CSM looking at one account. Answer the question that was asked — nothing more.",
    "",
    "Style:",
    "- No emoji. No H1/H2 headers. No pull-quotes. No generic narrative or framing-for-the-CSM scripts unless explicitly requested.",
    "- Default length: under 150 words. Lead with a one-sentence direct answer, then a short bullet list with the supporting numbers. Expand only if the user asks for more depth.",
    "- Cite numbers from the snapshot verbatim. If a field is null, say 'not available' — never guess or estimate.",
    "",
    "Snapshot vs tools — the snapshot below already contains current counts and rollups. Do NOT call a tool to retrieve something the snapshot already has.",
    "- Use the snapshot for: ARR, term dates, days_until_renewal, health scores, licensed/used units/utilization, active users, workflows_deployed (+ WoW), active_integrations (+ WoW), incidents_opened/closed, mttr_hours, MoM deltas, jira_* counts, jira_latest_issue_*, deployment/cloud, plan tier, industry.",
    "- Call get_account_trends ONLY when the user explicitly asks for a time series, trend over time, or month-by-month chart.",
    "- Call list_support_tickets ONLY when the user asks about specific support tickets, ticket titles, or recent ticket activity. Snapshot has no ticket list.",
    "- Call list_jira_issues_for_customer ONLY when the user asks which engineering issues the customer cares about (titles/links). Snapshot has counts and the latest title — that's enough for most questions.",
    "- Most questions need zero tool calls. If you can answer from the snapshot, just answer.",
    "",
    "Focus areas to surface when relevant: utilization_pct (used vs licensed), MoM/WoW deltas, days_until_renewal, account_health subscores, open Jira issue count. These are the levers a CSM acts on.",
    "",
    "Current account snapshot (JSON):",
    "```json",
    JSON.stringify(account, null, 2),
    "```",
  ].join("\n");
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
};

async function runTool(
  name: string,
  input: Record<string, unknown>,
  account: AccountRow,
): Promise<{ content: string; is_error?: boolean }> {
  const accountName = account.hubspot_company_name;
  try {
    if (name === "list_support_tickets") {
      const limit = clamp(input.limit, 1, 50, 10);
      const tickets = await listTicketsForCompany(accountName, limit);
      return { content: JSON.stringify({ tickets }) };
    }
    if (name === "list_jira_issues_for_customer") {
      const customerName =
        typeof input.customer_name === "string" && input.customer_name.trim()
          ? input.customer_name
          : accountName;
      const limit = clamp(input.limit, 1, 100, 25);
      const openOnly = input.open_only !== false;
      const result = await listIssuesForCustomer(customerName, {
        limit,
        openOnly,
      });
      return { content: JSON.stringify(result) };
    }
    if (name === "get_account_trends") {
      const metric = input.metric as TrendMetric;
      const months = clamp(input.months, 1, 36, 12);
      const series = await getAccountTrend(
        account.tidemark_company_id,
        metric,
        months,
      );
      return { content: JSON.stringify({ metric, months, series }) };
    }
  } catch (e) {
    return {
      content: JSON.stringify({ error: (e as Error).message }),
      is_error: true,
    };
  }
  return {
    content: JSON.stringify({ error: `unknown tool ${name}` }),
    is_error: true,
  };
}

async function callAnthropic(
  apiKey: string,
  system: AnthropicSystemBlock[],
  messages: AnthropicMessage[],
): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      JSON.stringify({
        msg: "anthropic.error",
        status: res.status,
        body: text,
      }),
    );
    throw new Error(`anthropic_upstream_${res.status}`);
  }
  return (await res.json()) as AnthropicResponse;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not set. Add it to .env and restart the dev server to enable chat.",
      },
      { status: 503 },
    );
  }

  let body: { companyId?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = body.companyId?.trim();
  const incoming = body.messages ?? [];
  if (!companyId || incoming.length === 0) {
    return NextResponse.json(
      { error: "companyId and messages are required" },
      { status: 400 },
    );
  }

  const account = await getAccount(companyId);
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  const system: AnthropicSystemBlock[] = [
    {
      type: "text",
      text: systemPrompt(account),
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: AnthropicMessage[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await callAnthropic(apiKey, system, messages);
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason !== "tool_use") {
        const text = resp.content
          .filter((b): b is AnthropicTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ reply: text });
      }

      const toolUses = resp.content.filter(
        (b): b is AnthropicToolUseBlock => b.type === "tool_use",
      );
      const results: AnthropicToolResultBlock[] = [];
      for (const tu of toolUses) {
        const r = await runTool(tu.name, tu.input, account);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.content,
          ...(r.is_error ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }
    return NextResponse.json(
      { error: "tool-use loop exceeded max turns" },
      { status: 500 },
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        msg: "chat.error",
        err: e instanceof Error ? e.message : String(e),
      }),
    );
    return NextResponse.json(
      { error: "upstream call failed; check server logs" },
      { status: 502 },
    );
  }
}
