export type AuthenticatedUser = {
  musicianId: string;
  displayName: string;
  isAdmin: boolean;
};

export type ExternalIdentity = {
  provider: string;
  providerUserId: string;
  email: string | null;
  displayName: string;
};
