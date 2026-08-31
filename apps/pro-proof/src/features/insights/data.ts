import { createServerFn } from '@tanstack/solid-start';
import { authMiddleware } from '@music-practice-buddy/core/server/auth';

export type PracticeInsights = Readonly<{
  completedSessions: number;
  minutesPracticed: number;
  activeDays: number;
}>;

export const getPracticeInsights = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PracticeInsights> => {
    const { pool } = await import('@music-practice-buddy/core/server/database');
    const result = await pool.query<{
      completed_sessions: number;
      minutes_practiced: number;
      active_days: number;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_sessions,
          COALESCE(round(sum(extract(epoch FROM (ended_at - started_at))) / 60), 0)::int
            AS minutes_practiced,
          count(DISTINCT started_at::date)::int AS active_days
        FROM session
        WHERE musician_id = $1
      `,
      [context.user.musicianId],
    );

    const insights = result.rows[0]!;
    return {
      completedSessions: insights.completed_sessions,
      minutesPracticed: insights.minutes_practiced,
      activeDays: insights.active_days,
    };
  });
