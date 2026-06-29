import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';

describe('password hashing', () => {
  it('uses verifiable non-plaintext hashes', async () => {
    const hash = await hashPassword('very-secure-password');
    expect(hash).not.toContain('very-secure-password');
    expect(await verifyPassword(hash, 'very-secure-password')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });
});
