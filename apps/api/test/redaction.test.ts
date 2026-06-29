import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/db/mappers.js';

describe('secret redaction', () => {
  it('redacts known secret config keys', () => {
    expect(redactSecrets({ webhookUrl: 'https://secret', chatId: '123' })).toEqual({ webhookUrl: '********', chatId: '123' });
  });
});
