import Link from "next/link";
import { CheckSquare, Contact, CalendarDays, Clock, Coins, FileText, Home, Landmark, Mail, Receipt, ReceiptText, Users } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

const nav = [
  { href: "/", label: "Today", icon: Home },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/projects", label: "Projects", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/invoices", label: "Money in", icon: Receipt },
  { href: "/costs", label: "Money out", icon: Coins },
  { href: "/tax", label: "Tax", icon: Landmark },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <nav
        aria-label="Main"
        className="hidden w-52 shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-surface-sunken px-3 py-5 md:flex"
      >
        <Link href="/" className="mb-5 px-2 font-display text-xl leading-none text-ink">
          Freelance OS
        </Link>

        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Icon aria-hidden size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}

        <div className="mt-auto flex flex-col gap-2 px-2">
          {/* A plain <a>, not next/link — this downloads a file, it doesn't
              navigate to an app route, so it's outside typedRoutes' scope by
              design. §8: "always available" is why this lives in persistent
              nav rather than on one settings page that doesn't exist yet. */}
          <a
            href="/api/export"
            className="text-xs text-ink-faint transition-colors hover:text-ink"
          >
            Export your data
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
