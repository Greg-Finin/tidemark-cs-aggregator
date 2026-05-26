import { listIssuesForCustomer } from "@/lib/jira";
import { formatDate } from "@/lib/format";

export async function LatestJiraIssue({
  customerName,
}: {
  customerName: string;
}) {
  const { issues } = await listIssuesForCustomer(customerName, {
    limit: 1,
    openOnly: false,
  });
  if (issues.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted">
        No Jira issues tagged for this customer.
      </p>
    );
  }
  const i = issues[0];
  return (
    <div className="mt-3 rounded-md border border-border bg-subtle/60 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">
        Latest
      </div>
      <div className="mt-0.5 text-sm font-medium text-navy">
        <span className="text-muted">{i.identifier}</span> · {i.title}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {i.state} · {formatDate(i.created_at)}
        {i.assignee ? ` · ${i.assignee}` : ""}
      </div>
    </div>
  );
}
