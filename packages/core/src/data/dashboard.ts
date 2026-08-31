import { createServerFn } from '@tanstack/solid-start';
import { authMiddleware } from '@/auth/middleware';
import { pool } from '@/data/db';
import { getDashboardForMusician } from '@/features/dashboard/service.server';

export const getDashboard = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => getDashboardForMusician(pool, context.user.musicianId));
