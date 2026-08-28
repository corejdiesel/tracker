import { Badge, Card, EmptyState, Field, inputClass, type BadgeTone } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { advanceTask, createTask } from "@/lib/db/actions";
import { listAllTasks, listProjects } from "@/lib/db/queries";
import { formatDateShort, relativeDays, todayIso } from "@/lib/dates";
import type { TaskStatus } from "@/lib/db/types";

export const metadata = { title: "Tasks · Freelance OS" };

const STATUS: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "neutral" },
  doing: { label: "Doing", tone: "accent" },
  done: { label: "Done", tone: "positive" },
  dropped: { label: "Dropped", tone: "neutral" },
};

export default async function TasksPage() {
  const today = todayIso();
  const [tasks, projects] = await Promise.all([listAllTasks(), listProjects()]);

  const overdue = tasks.filter((t) => t.status !== "done" && t.due_on !== null && t.due_on < today);
  const rest = tasks.filter((t) => !overdue.includes(t));

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={overdue.length > 0 ? `${overdue.length} overdue` : "Nothing overdue"}
      />

      <PageBody>
        <CreatePanel action={createTask} label="Add a task" title="New task">
          <Field label="Project">
            <select className={selectClass} name="project_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input className={inputClass} name="title" required placeholder="Send the homepage draft" />
          </Field>
          <Field label="Due" hint="Optional.">
            <input className={inputClass} name="due_on" type="date" />
          </Field>
        </CreatePanel>

        <Card>
          {tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="A task belongs to a project and can carry a due date. Click a task's status to move it along — open, doing, done."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {[...overdue, ...rest].map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${task.status === "done" ? "text-ink-faint line-through" : "text-ink"}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {task.projects?.name ?? "Unknown project"}
                      {task.due_on
                        ? ` · due ${relativeDays(task.due_on, today)} (${formatDateShort(task.due_on)})`
                        : ""}
                    </p>
                  </div>

                  <form action={advanceTask.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="cursor-pointer"
                      disabled={task.status === "done"}
                      title={task.status === "done" ? undefined : "Advance status"}
                    >
                      <Badge tone={overdue.includes(task) ? "danger" : STATUS[task.status].tone}>
                        {overdue.includes(task) ? "Overdue" : STATUS[task.status].label}
                      </Badge>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
