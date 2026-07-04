import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from '../src/auth/passwords.js';

describe('password hashing', () => {
  it('uses verifiable non-plaintext hashes', async () => {
    const hash = await hashPassword('very-secure-password');
    expect(hash).not.toContain('very-secure-password');
    expect(await verifyPassword(hash, 'very-secure-password')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('verifyPasswordOrDummy still runs a verify for a missing hash and returns false', async () => {
    // Timing-equalizer path for non-existent users: never authenticates, but
    // does the argon2 work so timing matches a real user's failed login.
    expect(await verifyPasswordOrDummy(undefined, 'anything-at-all')).toBe(false);

    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPasswordOrDummy(hash, 'correct-horse-battery')).toBe(true);
    expect(await verifyPasswordOrDummy(hash, 'nope')).toBe(false);
  });
});
