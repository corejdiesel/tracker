import { Badge, Card, EmptyState, type BadgeTone } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { ResolveThreadForm } from "./ResolveThreadForm";
import { listClients, listProjects, listUnmatchedThreads } from "@/lib/db/queries";
import { formatDate } from "@/lib/dates";
import type { EmailThreadKind } from "@/lib/db/types";

export const metadata = { title: "Mail · Freelance OS" };

const KIND: Record<EmailThreadKind, { label: string; tone: BadgeTone }> = {
  enquiry: { label: "Enquiry", tone: "accent" },
  scope_change: { label: "Scope change", tone: "warning" },
  invoice_reply: { label: "Invoice reply", tone: "positive" },
  payment_confirmation: { label: "Payment", tone: "positive" },
  receipt: { label: "Receipt", tone: "neutral" },
  subscription_charge: { label: "Subscription", tone: "neutral" },
  other: { label: "Other", tone: "neutral" },
};

export default async function MailPage() {
  const [threads, clients, projects] = await Promise.all([
    listUnmatchedThreads(), listClients(), listProjects(),
  ]);

  return (
    <>
      <PageHeader
        title="Mail"
        subtitle={
          threads.length > 0
            ? `${threads.length} thread${threads.length === 1 ? "" : "s"} to match`
            : "Nothing to triage"
        }
      />

      <PageBody>
        <Card>
          {threads.length === 0 ? (
            <EmptyState
              title="Gmail isn't connected yet"
              description="Mail sync (Phase 4) reads your inbox read-only, matches threads to a client by sender, and surfaces receipts, scope changes and invoice replies here for triage — nothing is sent automatically. This page is built and working against the schema; it's empty because there's no live connection to Gmail yet. Invoice chasers on the Money in page don't need this — those work from invoices already in the app."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {threads.map((thread) => (
                <li key={thread.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{thread.subject}</p>
                      <p className="text-xs text-ink-faint">
                        {thread.from_name ? `${thread.from_name} · ` : ""}
                        {thread.from_address} · {formatDate(thread.received_at.slice(0, 10))}
                      </p>
                    </div>
                    <Badge tone={KIND[thread.kind].tone}>{KIND[thread.kind].label}</Badge>
                  </div>
                  {thread.snippet ? (
                    <p className="text-xs text-ink-muted">{thread.snippet}</p>
                  ) : null}
                  <ResolveThreadForm threadId={thread.id} clients={clients} projects={projects} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
