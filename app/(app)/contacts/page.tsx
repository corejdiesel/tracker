import { Card, EmptyState, Field, inputClass } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createContact } from "@/lib/db/actions";
import { listClients, listContacts } from "@/lib/db/queries";

export const metadata = { title: "Contacts · Freelance OS" };

export default async function ContactsPage() {
  const [contacts, clients] = await Promise.all([listContacts(), listClients()]);

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="The email addresses thread- and meeting-matching will key on later"
      />

      <PageBody>
        <CreatePanel action={createContact} label="Add a contact" title="New contact">
          <Field label="Name">
            <input className={inputClass} name="name" required />
          </Field>
          <Field label="Client" hint="Optional.">
            <select className={selectClass} name="client_id" defaultValue="">
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Email">
            <input className={inputClass} name="email" type="email" />
          </Field>
          <Field label="Role">
            <input className={inputClass} name="role" placeholder="Creative director" />
          </Field>
        </CreatePanel>

        <Card>
          {contacts.length === 0 ? (
            <EmptyState
              title="No contacts yet"
              description="A contact's email domain is what later phases use to match meetings and mail threads to a client automatically."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{contact.name}</p>
                    <p className="text-xs text-ink-faint">
                      {[contact.role, contact.clients?.name, contact.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
