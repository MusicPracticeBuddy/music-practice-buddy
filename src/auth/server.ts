import { createHash, randomBytes } from 'node:crypto'
import { deleteCookie, getCookie, setCookie } from '@tanstack/solid-start/server'
import type { PoolClient } from 'pg'
import { pool } from '@/data/db'
import type { AuthenticatedUser, ExternalIdentity } from '@/auth/types'

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30
const DEVELOPMENT_COOKIE = 'practice_session'
const PRODUCTION_COOKIE = '__Host-practice_session'

function sessionCookieName() {
  return process.env.NODE_ENV === 'production' ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function isDevelopmentLoginEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_LOGIN_ENABLED === 'true'
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = getCookie(sessionCookieName())
  if (!token) return null

  const result = await pool.query<{
    musicianId: string
    displayName: string
    isAdmin: boolean
  }>(
    `
      SELECT
        musician.id::text AS "musicianId",
        musician.display_name AS "displayName",
        musician.is_admin AS "isAdmin"
      FROM auth_session session
      JOIN musician ON musician.id = session.musician_id
      WHERE session.token_hash = $1
        AND session.expires_at > CURRENT_TIMESTAMP
    `,
    [hashToken(token)],
  )

  return result.rows[0] ?? null
}

export async function createSession(musicianId: string) {
  const token = randomBytes(32).toString('base64url')
  await pool.query(
    `
      INSERT INTO auth_session (musician_id, token_hash, expires_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(secs => $3))
    `,
    [musicianId, hashToken(token), SESSION_DURATION_SECONDS],
  )

  setCookie(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  })
}

export async function revokeCurrentSession() {
  const cookieName = sessionCookieName()
  const token = getCookie(cookieName)
  if (token) {
    await pool.query(`DELETE FROM auth_session WHERE token_hash = $1`, [hashToken(token)])
  }
  deleteCookie(cookieName, { path: '/', secure: process.env.NODE_ENV === 'production' })
}

export async function resolveOrCreateExternalIdentity(
  identity: ExternalIdentity,
  linkingMusicianId: string | null = null,
): Promise<string> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query<{ musicianId: string }>(
      `SELECT musician_id::text AS "musicianId"
       FROM auth_identity WHERE provider = $1 AND provider_user_id = $2`,
      [identity.provider, identity.providerUserId],
    )
    if (existing.rows[0]) {
      await client.query('COMMIT')
      return existing.rows[0].musicianId
    }

    const musicianId = linkingMusicianId ?? (await insertMusician(client, identity.displayName))
    await client.query(
      `INSERT INTO auth_identity (musician_id, provider, provider_user_id, email)
       VALUES ($1, $2, $3, $4)`,
      [musicianId, identity.provider, identity.providerUserId, identity.email],
    )
    await client.query('COMMIT')
    return musicianId
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function insertMusician(client: PoolClient, displayName: string) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO musician (display_name) VALUES ($1) RETURNING id::text`,
    [displayName.trim() || 'Musician'],
  )
  return result.rows[0]!.id
}
