import { cn } from "@/lib/cn";

/* Card ─────────────────────────────────────────────────────────────────────*/

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-surface",
        "shadow-[var(--shadow-card)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
      <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">{title}</h2>
      {action}
    </header>
  );
}

/* Money ────────────────────────────────────────────────────────────────────*/

/**
 * Every figure states what it is. `basis` renders the net/gross/estimated
 * qualifier next to the number, because §7 of the brief is explicit that a
 * figure must never be ambiguous about which it is.
 */
export function Money({
  children,
  basis,
  tone = "default",
  size = "base",
  className,
}: {
  children: string;
  basis?: "net" | "gross" | "estimated";
  tone?: "default" | "positive" | "danger" | "muted";
  size?: "sm" | "base" | "lg" | "hero";
  className?: string;
}) {
  const tones = {
    default: "text-ink",
    positive: "text-positive",
    danger: "text-danger",
    muted: "text-ink-muted",
  } as const;

  const sizes = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-xl",
    hero: "font-display text-4xl leading-none",
  } as const;

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("tabular", tones[tone], sizes[size])}>{children}</span>
      {basis ? (
        <span className="text-2xs uppercase tracking-[0.08em] text-ink-faint">{basis}</span>
      ) : null}
    </span>
  );
}

/* Badge ────────────────────────────────────────────────────────────────────*/

const badgeTones = {
  neutral: "bg-surface-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5",
        "text-2xs font-medium uppercase tracking-[0.06em]",
        badgeTones[tone]
      )}
    >
      {children}
    </span>
  );
}

/* States ───────────────────────────────────────────────────────────────────*/

/**
 * A real empty state: what this is, why it is empty, and the one action that
 * fixes it. Never a bare "No results".
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-10">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/** Skeleton rows that match the shape of the content, not a spinner. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--border)]" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken" />
          <div className="h-3 w-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken" />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-10">
      <p className="font-display text-xl text-danger">{title}</p>
      {detail ? <p className="max-w-prose text-sm text-ink-muted">{detail}</p> : null}
    </div>
  );
}

/* Form and action primitives ───────────────────────────────────────────────*/

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-accent text-accent-ink hover:bg-accent-hover",
    ghost: "border border-[var(--border-strong)] text-ink hover:bg-surface-sunken",
    danger: "border border-[var(--border-strong)] text-danger hover:bg-danger-soft",
  } as const;

  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[var(--radius-md)] px-3",
        "text-sm font-medium transition-colors disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass = cn(
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-surface",
  "px-2.5 text-base text-ink placeholder:text-ink-faint"
);
