import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Aggregator — Tidemark",
  description: "Customer-success explorer for fictional Tidemark accounts.",
};

export const dynamic = "force-dynamic";

// Tidemark mark — two stacked arcs suggesting a high-water line over a wave.
function TidemarkMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 13 Q 16 7, 28 13" />
      <path d="M4 21 Q 16 15, 28 21" />
      <circle cx="16" cy="25.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-subtle hover:text-navy"
    >
      {children}
    </Link>
  );
}

async function signOut() {
  "use server";
  const c = await cookies();
  c.delete(AUTH_COOKIE);
  redirect("/login");
}

function SignOutForm() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-navy"
      >
        sign out
      </button>
    </form>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Demo auth gate — middleware.ts handles redirecting unauthenticated users
  // to /login. The layout renders the chrome only when a session exists, so
  // the /login page (which doesn't have a session yet) renders without it.
  const cookieStore = await cookies();
  const session = cookieStore.get(AUTH_COOKIE)?.value;

  return (
    <html lang="en">
      <body>
        {session ? (
          <>
            <header className="sticky top-0 z-20 border-b border-border bg-panel/95 backdrop-blur">
              <div className="mx-auto flex max-w-screen-2xl items-center gap-8 px-6 py-3">
                <Link href="/" className="flex items-center gap-2.5">
                  <TidemarkMark className="h-6 w-6 text-accent" />
                  <span className="flex items-baseline gap-2">
                    <span className="text-base font-semibold tracking-tight text-navy">
                      Tidemark
                    </span>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      CS Aggregator
                    </span>
                  </span>
                </Link>
                <nav className="flex gap-1 text-sm">
                  <NavLink href="/">Accounts</NavLink>
                </nav>
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <span className="text-muted">Signed in as</span>
                  <span className="font-medium text-navy">{session}</span>
                  <SignOutForm />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-screen-2xl px-6 py-8">
              {children}
            </main>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
