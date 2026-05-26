import { listTicketsForCompany } from "@/lib/zendesk";
import { TicketsList } from "./tickets-list";

export async function TicketsPanel({ companyName }: { companyName: string }) {
  let tickets;
  try {
    tickets = await listTicketsForCompany(companyName);
  } catch (err) {
    return (
      <div className="text-sm text-rose-700">
        Failed to load Zendesk tickets:{" "}
        {err instanceof Error ? err.message : "unknown error"}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-sm text-muted">
        No tickets found for {companyName}.
      </div>
    );
  }

  return <TicketsList tickets={tickets} />;
}
