import { cookies } from "next/headers";
import { listAccounts } from "@/lib/fixtures";
import { CSM_COOKIE } from "@/lib/preferences";
import { AccountsTable } from "./accounts-table";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
  let error: string | null = null;
  try {
    accounts = await listAccounts();
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }
  const cookieStore = await cookies();
  const initialCsm = cookieStore.get(CSM_COOKIE)?.value ?? "all";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted">
          {accounts.length} current customers
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Failed to load accounts: {error}
        </div>
      ) : (
        <AccountsTable accounts={accounts} initialCsm={initialCsm} />
      )}
    </div>
  );
}
