import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/**
 * Bounce any request without a session cookie to /login. The /login page,
 * static assets, and Next internals are exempted via the matcher below.
 */
export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(AUTH_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals, static files, and /login itself.
    "/((?!_next/static|_next/image|favicon\\.ico|login|api/health).*)",
  ],
};
