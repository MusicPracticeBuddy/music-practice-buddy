import type { AuthenticatedUser } from '@/auth/types';
import {
  getAuthenticatedUser as getLegacyAuthenticatedUser,
  revokeCurrentSession as revokeLegacySession,
} from '@/auth/server';

export type AuthenticationProvider = Readonly<{
  getAuthenticatedUser: () => Promise<AuthenticatedUser | null>;
  revokeCurrentSession: () => Promise<void>;
}>;

let provider: AuthenticationProvider = {
  getAuthenticatedUser: getLegacyAuthenticatedUser,
  revokeCurrentSession: revokeLegacySession,
};

export function configureAuthenticationProvider(authenticationProvider: AuthenticationProvider) {
  provider = authenticationProvider;
}

export function getAuthenticatedUser() {
  return provider.getAuthenticatedUser();
}

export function revokeCurrentSession() {
  return provider.revokeCurrentSession();
}
