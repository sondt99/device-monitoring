import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { DnsChecker, TlsChecker } from '../src/monitoring/checker.js';

const baseTarget = { host: '', checkType: 'dns' as const, checkUrl: null, checkPort: null, timeoutMs: 1000, retries: 0 };

describe('DnsChecker', () => {
  it('reports down for a hostname that cannot resolve', async () => {
    const checker = new DnsChecker();
    const result = await checker.check({ ...baseTarget, host: 'this-host-does-not-exist.invalid' });
    expect(result.status).toBe('down');
    expect(result.latencyMs).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('reports up for a hostname known to resolve', async () => {
    const checker = new DnsChecker();
    const result = await checker.check({ ...baseTarget, host: 'localhost' });
    expect(result.status).toBe('up');
    expect(result.latencyMs).not.toBeNull();
  });
});

function opensslAvailable(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Generates a real, valid self-signed certificate via the `openssl` CLI so
// TlsChecker parses an actual X.509 cert rather than a hand-typed fixture.
// Node's crypto module can generate key pairs but not sign certificates.
function generateSelfSignedCert(days: number): { cert: string; key: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dm-tls-test-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-days', String(days), '-nodes', '-subj', '/CN=127.0.0.1'],
      { stdio: 'ignore' }
    );
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!opensslAvailable())('TlsChecker', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolvePromise) => server?.close(() => resolvePromise()));
    server = undefined;
  });

  async function listen(cert: string, key: string): Promise<number> {
    server = createServer({ cert, key });
    await new Promise<void>((resolvePromise) => server?.listen(0, '127.0.0.1', resolvePromise));
    return (server?.address() as AddressInfo).port;
  }

  it('reports up and extracts days-until-expiry from a real certificate', async () => {
    const { cert, key } = generateSelfSignedCert(30);
    const port = await listen(cert, key);

    const result = await new TlsChecker().check({ ...baseTarget, checkType: 'tls', host: '127.0.0.1', checkPort: port });

    expect(result.status).toBe('up');
    expect(result.latencyMs).not.toBeNull();
    // Allow slop for time-of-day rounding rather than asserting exactly 30.
    expect(result.meta?.daysUntilExpiry).toBeGreaterThanOrEqual(28);
    expect(result.meta?.daysUntilExpiry).toBeLessThanOrEqual(30);
  });

  it('accepts a self-signed / untrusted certificate (expiry monitoring, not trust validation)', async () => {
    const { cert, key } = generateSelfSignedCert(1);
    const port = await listen(cert, key);

    const result = await new TlsChecker().check({ ...baseTarget, checkType: 'tls', host: '127.0.0.1', checkPort: port });
    expect(result.status).toBe('up');
  });

  it('reports down when nothing is listening on the target port', async () => {
    const result = await new TlsChecker().check({ ...baseTarget, checkType: 'tls', host: '127.0.0.1', checkPort: 1 });
    expect(result.status).toBe('down');
    expect(result.error).toBeTruthy();
  });

  it('reports down when no port is configured', async () => {
    const result = await new TlsChecker().check({ ...baseTarget, checkType: 'tls', host: '127.0.0.1', checkPort: null });
    expect(result.status).toBe('down');
    expect(result.error).toBe('No port configured for TLS check');
  });
});
