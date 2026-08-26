import { Card, SkeletonRows } from "@/components/ui/primitives";
import { PageBody } from "@/components/ui/page";

export default function Loading() {
  return (
    <>
      <header className="px-6 pb-6 pt-8">
        <div className="h-7 w-32 animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken" />
      </header>
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="flex flex-col gap-3 px-4 py-4">
              <div className="h-2.5 w-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken" />
              <div className="h-9 w-28 animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken" />
            </Card>
          ))}
        </div>
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      </PageBody>
      <span className="sr-only" role="status">
        Loading
      </span>
    </>
  );
}
