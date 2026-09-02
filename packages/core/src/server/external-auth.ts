export {
  createSession,
  getAuthenticatedUser,
  resolveOrCreateExternalIdentity,
  revokeCurrentSession,
} from '@/auth/server';
export type { ExternalIdentity } from '@/auth/types';
