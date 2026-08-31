export type AuthenticatedUser = {
  musicianId: string
  displayName: string
  isAdmin: boolean
}

export type ExternalIdentity = {
  provider: 'google' | 'apple'
  providerUserId: string
  email: string | null
  displayName: string
}
