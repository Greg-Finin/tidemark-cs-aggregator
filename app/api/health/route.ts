import { NextResponse } from "next/server";

/**
 * Liveness probe for the container healthcheck. Intentionally does not touch
 * the data layer — a hung warehouse connection shouldn't make us look dead.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
