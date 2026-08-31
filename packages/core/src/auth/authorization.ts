import type { AuthenticatedUser } from '@/auth/types'

export type Visibility = 'PRIVATE' | 'PUBLIC'

export type ResourceAccess = {
  canEdit: boolean
  canManage: boolean
  canUse: boolean
}

export function canRead(
  user: AuthenticatedUser,
  ownerMusicianId: string | null,
  visibility: Visibility,
) {
  return ownerMusicianId === user.musicianId || visibility === 'PUBLIC'
}

export function canEditContent(
  user: AuthenticatedUser,
  ownerMusicianId: string | null,
  visibility: Visibility,
) {
  return ownerMusicianId === user.musicianId || (user.isAdmin && visibility === 'PUBLIC')
}

export function canManage(user: AuthenticatedUser, ownerMusicianId: string | null) {
  return ownerMusicianId === user.musicianId
}

export function resourceAccess(
  user: AuthenticatedUser,
  ownerMusicianId: string | null,
  visibility: Visibility,
): ResourceAccess {
  return {
    canEdit: canEditContent(user, ownerMusicianId, visibility),
    canManage: canManage(user, ownerMusicianId),
    canUse: canRead(user, ownerMusicianId, visibility),
  }
}
