import { createServerFn } from '@tanstack/solid-start';
import { authMiddleware } from '@/auth/middleware';
import { pool } from '@/data/db';

export type LibraryCounts = {
  repertoire: number;
  exercises: number;
};

export const getLibraryCounts = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LibraryCounts> => {
    const result = await pool.query<LibraryCounts>(
      `SELECT
         (SELECT count(*)::integer
          FROM musician_repertoire_library
          WHERE musician_id = $1) AS repertoire,
         (SELECT count(*)::integer
          FROM exercise
          JOIN musician_exercise_library library
            ON library.exercise_id = exercise.id AND library.musician_id = $1
          WHERE exercise.deleted_at IS NULL
            AND (exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')) AS exercises`,
      [context.user.musicianId],
    );

    return result.rows[0] ?? { repertoire: 0, exercises: 0 };
  });
