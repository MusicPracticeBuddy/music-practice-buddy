import { createServerFn } from '@tanstack/solid-start'
import {
  createSession,
  getAuthenticatedUser,
  isDevelopmentLoginEnabled,
  revokeCurrentSession,
} from '@/auth/server'
import { pool } from '@/data/db'
import type { AuthenticatedUser } from '@/auth/types'

export type DevelopmentUser = {
  username: string
  displayName: string
}

export type LoginConfiguration = {
  developmentEnabled: boolean
  users: DevelopmentUser[]
}

function requireDevelopmentLogin() {
  if (!isDevelopmentLoginEnabled()) throw new Response('Not found', { status: 404 })
}

function validateDevelopmentUsername(username: string) {
  const normalized = username.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(normalized)) {
    throw new Error(
      'Username must start with a letter or number and contain only letters, numbers, hyphens, or underscores.',
    )
  }
  return normalized
}

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthenticatedUser | null> => getAuthenticatedUser(),
)

export const getLoginConfiguration = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LoginConfiguration> => {
    if (!isDevelopmentLoginEnabled()) return { developmentEnabled: false, users: [] }
    const result = await pool.query<DevelopmentUser>(`
      SELECT identity.provider_user_id AS username, musician.display_name AS "displayName"
      FROM auth_identity identity
      JOIN musician ON musician.id = identity.musician_id
      WHERE identity.provider = 'development'
      ORDER BY musician.display_name, identity.provider_user_id
    `)
    return { developmentEnabled: true, users: result.rows }
  },
)

export const getDevelopmentUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DevelopmentUser[]> => {
    requireDevelopmentLogin()
    const result = await pool.query<DevelopmentUser>(`
      SELECT identity.provider_user_id AS username, musician.display_name AS "displayName"
      FROM auth_identity identity
      JOIN musician ON musician.id = identity.musician_id
      WHERE identity.provider = 'development'
      ORDER BY musician.display_name, identity.provider_user_id
    `)
    return result.rows
  },
)

export const developmentLogin = createServerFn({ method: 'POST' })
  .validator(validateDevelopmentUsername)
  .handler(async ({ data: username }): Promise<AuthenticatedUser> => {
    requireDevelopmentLogin()
    const result = await pool.query<AuthenticatedUser>(
      `
        SELECT
          musician.id::text AS "musicianId",
          musician.display_name AS "displayName",
          musician.is_admin AS "isAdmin"
        FROM auth_identity identity
        JOIN musician ON musician.id = identity.musician_id
        WHERE identity.provider = 'development'
          AND identity.provider_user_id = $1
      `,
      [username],
    )
    const user = result.rows[0]
    if (!user) throw new Error('Development user not found')
    await revokeCurrentSession()
    await createSession(user.musicianId)
    return user
  })

export const createDevelopmentUser = createServerFn({ method: 'POST' })
  .validator(validateDevelopmentUsername)
  .handler(async ({ data: username }): Promise<AuthenticatedUser> => {
    requireDevelopmentLogin()
    const client = await pool.connect()
    let user: AuthenticatedUser
    try {
      await client.query('BEGIN')
      const musician = await client.query<{ musicianId: string }>(
        `INSERT INTO musician (display_name) VALUES ($1) RETURNING id::text AS "musicianId"`,
        [username],
      )
      user = {
        musicianId: musician.rows[0]!.musicianId,
        displayName: username,
        isAdmin: false,
      }
      await client.query(
        `INSERT INTO auth_identity (musician_id, provider, provider_user_id)
         VALUES ($1, 'development', $2)`,
        [user.musicianId, username],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new Error('That username is already in use', { cause: error })
      }
      throw error
    } finally {
      client.release()
    }

    await revokeCurrentSession()
    await createSession(user.musicianId)
    return user
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await revokeCurrentSession()
  return { success: true }
})
