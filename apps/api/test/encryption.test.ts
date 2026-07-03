import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/database.js';
import { createChannel, getChannel } from '../src/notifications/service.js';
import { decryptSecret, encryptSecret } from '../src/notifications/crypto.js';

describe('secret encryption', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const envelope = encryptSecret(JSON.stringify({ botToken: 'abc123', chatId: '999' }));
    expect(envelope).not.toContain('abc123');
    expect(JSON.parse(decryptSecret(envelope))).toEqual({ botToken: 'abc123', chatId: '999' });
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-input');
    const b = encryptSecret('same-input');
    expect(a).not.toBe(b);
  });

  it('treats legacy plaintext JSON as-is instead of throwing', () => {
    const legacy = JSON.stringify({ url: 'https://example.com/hook' });
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it('does not store the plaintext secret in config_json', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    createChannel(db, {
      type: 'telegram',
      name: 'Ops',
      enabled: true,
      config: { botToken: 'super-secret-token', chatId: '42' }
    });

    const row = db.prepare('SELECT config_json FROM notification_channels').get() as { config_json: string };
    expect(row.config_json).not.toContain('super-secret-token');
    expect(row.config_json).not.toContain('42');
    db.close();
  });

  it('decrypts transparently through the normal read path', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const channel = createChannel(db, {
      type: 'webhook',
      name: 'Hook',
      enabled: true,
      config: { url: 'https://example.com/hook' }
    });

    const fetched = getChannel(db, channel.id, false);
    expect(fetched?.config.url).toBe('https://example.com/hook');
    db.close();
  });
});
