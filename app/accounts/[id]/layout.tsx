import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatSidebar } from "@/components/chat-sidebar";
import { HealthBadge } from "@/components/health-badge";
import { getAccount } from "@/lib/fixtures";
import { formatDate } from "@/lib/format";
import {
  NextStepButton,
  NextStepProvider,
  NextStepResult,
} from "./next-step-button";

export const dynamic = "force-dynamic";

export default async function AccountDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const name = account.hubspot_company_name;

  return (
    <NextStepProvider>
      <div className="space-y-6">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-text">
            ← Accounts
          </Link>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">
              {name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{account.csm_owner ?? "no CSM"}</span>
              <span>·</span>
              <span>{account.industry ?? "—"}</span>
              <span>·</span>
              <span>{account.plan_tier ?? "—"}</span>
              <span>·</span>
              <span>{account.deployment_type ?? "—"}</span>
              {account.cloud_environment && (
                <>
                  <span>·</span>
                  <span>{account.cloud_environment}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NextStepButton companyId={id} />
            <HealthBadge health={account.account_health} />
            <div className="text-right text-sm">
              <div className="text-muted">
                Renews {formatDate(account.term_end)}
              </div>
              <div className="font-medium text-navy">
                {account.days_until_renewal == null
                  ? "—"
                  : account.days_until_renewal < 0
                    ? `${Math.abs(account.days_until_renewal)}d overdue`
                    : `in ${account.days_until_renewal}d`}
              </div>
            </div>
          </div>
        </header>

        <NextStepResult />

        {children}

        <ChatSidebar companyId={id} companyName={name} />
      </div>
    </NextStepProvider>
  );
}
