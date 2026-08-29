/**
 * The live running timer, read and controlled directly against Neon —
 * `running_timers` is deliberately NOT one of lib/sync/engine.ts's
 * SYNCED_TABLES (see that file's comment): a timer is single-source-of-truth,
 * transient state, not something with a sensible last-write-wins merge
 * story across devices. So this talks straight to Postgres, same connection
 * pattern as remote-store.ts, rather than going through the local-first
 * sync engine.
 *
 * Mirrors lib/db/actions.ts's startTimer/stopTimer exactly (same SQL, same
 * "discard sessions under a minute" rule) so a timer started on desktop and
 * stopped on web, or vice versa, behaves identically either way.
 */
import { connectAsUser } from "./neon-connection";

export interface RunningTimer {
  projectId: string;
  taskId: string | null;
  startedAt: string; // ISO 8601 with zone
  note: string | null;
  projectName: string;
  clientName: string | null;
}

export interface ActiveProject {
  id: string;
  name: string;
  clientName: string | null;
}

export interface TimerClient {
  getRunningTimer(): Promise<RunningTimer | null>;
  listActiveProjects(): Promise<ActiveProject[]>;
  startTimer(projectId: string, note?: string): Promise<void>;
  /** noteOverride, when passed (even as ""), replaces the note set at
   * start — used by the desktop app's AI session-summary review step. */
  stopTimer(noteOverride?: string): Promise<void>;
  discardTimer(): Promise<void>;
}

/** Minutes a running timer has accumulated, floored — a timer never rounds up. */
function elapsedMinutes(startedAtIso: string, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(startedAtIso).getTime();
  return elapsed <= 0 ? 0 : Math.floor(elapsed / 60_000);
}

export function createTimerClient(dsn: string, userId: string): TimerClient {
  const conn = connectAsUser(dsn, userId);

  return {
    async getRunningTimer() {
      const rows = await conn.query<{
        project_id: string; task_id: string | null; started_at: string; note: string | null;
        project_name: string; client_name: string | null;
      }>(
        `select rt.project_id, rt.task_id, rt.started_at, rt.note,
                p.name as project_name, c.name as client_name
           from public.running_timers rt
           join public.projects p on p.id = rt.project_id
           left join public.clients c on c.id = p.client_id`
      );
      const row = rows[0];
      if (!row) return null;
      return {
        projectId: row.project_id, taskId: row.task_id, startedAt: row.started_at,
        note: row.note, projectName: row.project_name, clientName: row.client_name,
      };
    },

    async listActiveProjects() {
      return conn.query<ActiveProject>(
        `select p.id, p.name, c.name as "clientName"
           from public.projects p
           left join public.clients c on c.id = p.client_id
          where p.deleted_at is null and p.status in ('won', 'active')
          order by p.name`
      );
    },

    async startTimer(projectId, note) {
      await conn.query(
        `insert into public.running_timers (owner_id, project_id, note)
         values ((select public.app_user_id()), $1, $2)`,
        [projectId, note || null]
      );
    },

    async stopTimer(noteOverride) {
      const rows = await conn.query<{
        project_id: string; task_id: string | null; started_at: string; note: string | null;
      }>(`select project_id, task_id, started_at, note from public.running_timers`);
      const timer = rows[0];
      if (!timer) return;

      const minutes = elapsedMinutes(timer.started_at);
      // noteOverride is undefined when the caller isn't offering one (e.g.
      // discardTimer's sibling paths) — an explicit empty string from a
      // cleared review-panel textarea should still win over the note typed
      // at start, so this only falls back to timer.note when truly absent.
      const note = noteOverride === undefined ? timer.note : noteOverride;

      await conn.transaction((q) => {
        const queries = [];
        if (minutes > 0) {
          queries.push(
            q(
              `insert into public.time_entries
                 (owner_id, project_id, task_id, worked_on, minutes, note, source)
               values ((select public.app_user_id()), $1, $2, $3, $4, $5, 'timer')`,
              [
                timer.project_id, timer.task_id,
                timer.started_at.slice(0, 10),
                Math.min(minutes, 1440), note,
              ]
            )
          );
        }
        queries.push(q(`delete from public.running_timers where owner_id = (select public.app_user_id())`));
        return queries;
      });
    },

    async discardTimer() {
      await conn.query(`delete from public.running_timers where owner_id = (select public.app_user_id())`);
    },
  };
}
