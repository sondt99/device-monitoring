import { describe, expect, it } from 'vitest';
import { assertSafeOutboundUrl } from '../src/notifications/url-guard.js';

describe('assertSafeOutboundUrl (webhook SSRF guard)', () => {
  it('blocks link-local / cloud-metadata targets', async () => {
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/link-local/);
    await expect(assertSafeOutboundUrl('http://169.254.0.1/')).rejects.toThrow(/link-local/);
    await expect(assertSafeOutboundUrl('http://[fe80::1]/hook')).rejects.toThrow(/link-local/);
    await expect(assertSafeOutboundUrl('http://[::ffff:169.254.169.254]/')).rejects.toThrow(/link-local/);
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(assertSafeOutboundUrl('gopher://x/')).rejects.toThrow(/http/);
    await expect(assertSafeOutboundUrl('not a url')).rejects.toThrow(/Invalid/);
  });

  it('allows ordinary public, LAN and loopback destinations', async () => {
    // Literal IPs (no DNS): public, private LAN, and loopback are all permitted
    // — a self-hosted tool legitimately notifies internal relays.
    await expect(assertSafeOutboundUrl('https://1.1.1.1/webhook')).resolves.toBeUndefined();
    await expect(assertSafeOutboundUrl('http://192.168.1.10:9000/alert')).resolves.toBeUndefined();
    await expect(assertSafeOutboundUrl('http://127.0.0.1:8080/hook')).resolves.toBeUndefined();
    // Hostname that resolves locally (exercises the DNS path without network).
    await expect(assertSafeOutboundUrl('http://localhost/hook')).resolves.toBeUndefined();
  });
});
