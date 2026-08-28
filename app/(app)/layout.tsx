import Link from "next/link";
import { CalendarDays, Clock, Coins, FileText, Home, Receipt, Users } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

const nav = [
  { href: "/", label: "Today", icon: Home },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projects", label: "Projects", icon: FileText },
  { href: "/invoices", label: "Money in", icon: Receipt },
  { href: "/costs", label: "Money out", icon: Coins },
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

        <form action={signOut} className="mt-auto px-2">
          <button
            type="submit"
            className="text-xs text-ink-faint transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </nav>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
