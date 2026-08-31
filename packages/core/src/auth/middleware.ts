import { createMiddleware } from '@tanstack/solid-start'
import { setResponseHeader } from '@tanstack/solid-start/server'
import { getAuthenticatedUser } from '@/auth/server'

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await getAuthenticatedUser()
  if (!user) throw new Response('Unauthorized', { status: 401 })
  setResponseHeader('Cache-Control', 'private, no-store')
  return next({ context: { user } })
})
