import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, DEFAULT_DEMO_CSM } from "@/lib/auth";

async function signIn() {
  "use server";
  const c = await cookies();
  c.set(AUTH_COOKIE, DEFAULT_DEMO_CSM, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  redirect("/");
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-md rounded-lg border border-border bg-panel p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-navy">
          Tidemark — CS Aggregator
        </h1>
        <p className="mt-1 text-sm text-muted">
          Customer-success tooling for a fictional B2B SaaS company.
        </p>

        <div className="mt-6 rounded-md border border-border bg-subtle p-3 text-xs leading-relaxed text-muted">
          <strong className="font-medium text-navy">Demo notice.</strong> This
          is a portfolio version of a production-grade CS aggregator pattern.
          A deployed version gates access via Tailscale and pulls the CSM
          identity from tailnet identity headers — there&apos;s no real password
          here. Click below to sign in as the demo CSM.
        </div>

        <form action={signIn} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-text"
          >
            Sign in as {DEFAULT_DEMO_CSM}
          </button>
        </form>
      </div>
    </div>
  );
}
