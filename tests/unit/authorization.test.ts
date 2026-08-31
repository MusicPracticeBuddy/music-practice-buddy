import { describe, expect, it } from 'vitest';
import { resourceAccess } from '@/auth/authorization';
import type { AuthenticatedUser } from '@/auth/types';

const user: AuthenticatedUser = {
  musicianId: '1',
  displayName: 'Owner',
  isAdmin: false,
};

const admin: AuthenticatedUser = {
  musicianId: '2',
  displayName: 'Administrator',
  isAdmin: true,
};

describe('resource authorization', () => {
  it('gives owners full access to private resources', () => {
    expect(resourceAccess(user, '1', 'PRIVATE')).toEqual({
      canEdit: true,
      canManage: true,
      canUse: true,
    });
  });

  it('gives ordinary users read-only access to public resources', () => {
    expect(resourceAccess(user, '3', 'PUBLIC')).toEqual({
      canEdit: false,
      canManage: false,
      canUse: true,
    });
  });

  it('gives admins content-only access to public resources', () => {
    expect(resourceAccess(admin, '3', 'PUBLIC')).toEqual({
      canEdit: true,
      canManage: false,
      canUse: true,
    });
  });

  it('does not let admins access another musician private resources', () => {
    expect(resourceAccess(admin, '3', 'PRIVATE')).toEqual({
      canEdit: false,
      canManage: false,
      canUse: false,
    });
  });
});
