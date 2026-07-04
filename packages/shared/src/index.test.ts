import { describe, expect, it } from 'vitest';
import { createDeviceSchema, loginSchema } from './index.js';

describe('shared schemas', () => {
  it('applies safe defaults for devices', () => {
    const parsed = createDeviceSchema.parse({ name: 'Router', host: '192.168.1.1' });
    expect(parsed.checkType).toBe('ping');
    expect(parsed.checkUrl).toBeNull();
    expect(parsed.checkPort).toBeNull();
    expect(parsed.group).toBeNull();
    expect(parsed.latencyThresholdMs).toBeNull();
    expect(parsed.intervalSeconds).toBe(60);
    expect(parsed.timeoutMs).toBe(5000);
    expect(parsed.retries).toBe(1);
    expect(parsed.enabled).toBe(true);
  });

  it('rejects weak login payloads', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: 'short' })).toThrow();
  });

  it('accepts legitimate LAN hosts (hostnames, IPv4, IPv6)', () => {
    for (const host of ['192.168.1.1', 'router-01.local', '::1', 'fe80::1%eth0', 'my_nas', '[2001:db8::1]']) {
      expect(() => createDeviceSchema.parse({ name: 'Dev', host })).not.toThrow();
    }
  });

  it('rejects hosts that could inject ping flags or shell metacharacters', () => {
    for (const host of ['-f', '--flood', '-oProxyCommand=x', '8.8.8.8; rm -rf /', '$(reboot)', 'a b', 'host\nx']) {
      expect(() => createDeviceSchema.parse({ name: 'Dev', host })).toThrow();
    }
  });
});
