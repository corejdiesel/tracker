export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-6 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl leading-none text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5 px-6 pb-16">{children}</div>;
}
