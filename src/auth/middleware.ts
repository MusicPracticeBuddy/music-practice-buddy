import { createMiddleware } from '@tanstack/solid-start'
import { getAuthenticatedUser } from '@/auth/server'

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await getAuthenticatedUser()
  if (!user) throw new Response('Unauthorized', { status: 401 })
  return next({ context: { user } })
})
