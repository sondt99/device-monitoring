import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let encryptionKey: Buffer | null = null;

export function setEncryptionKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  encryptionKey = key;
}

function getKey(): Buffer {
  if (!encryptionKey) throw new Error('Encryption key not initialized; call setEncryptionKey() at boot');
  return encryptionKey;
}

const ENVELOPE_PATTERN = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(envelope: string): string {
  if (!ENVELOPE_PATTERN.test(envelope)) {
    // Legacy plaintext JSON written before encryption was introduced.
    return envelope;
  }
  const [ivB64, authTagB64, ciphertextB64] = envelope.split(':');
  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // Not actually one of our envelopes (e.g. plaintext JSON that happens to
    // look base64-ish) — fall back to treating it as legacy plaintext.
    return envelope;
  }
}
