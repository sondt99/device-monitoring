import { execFile } from 'node:child_process';
import { resolve as dnsResolve } from 'node:dns/promises';
import { createConnection, isIP } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { promisify } from 'node:util';
import type { CheckType } from '@device-monitoring/shared';

const execFileAsync = promisify(execFile);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CheckTarget {
  host: string;
  checkType: CheckType;
  checkUrl: string | null;
  checkPort: number | null;
  timeoutMs: number;
  retries: number;
}

export interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number | null;
  error: string | null;
  meta?: { daysUntilExpiry?: number };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface DeviceChecker {
  check(target: CheckTarget): Promise<CheckResult>;
}

export class PingChecker {
  async check(target: CheckTarget): Promise<CheckResult> {
    const attempts = target.retries + 1;
    let lastError = 'Unknown ping failure';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      try {
        const timeoutSeconds = Math.max(1, Math.ceil(target.timeoutMs / 1000));
        await execFileAsync('ping', ['-c', '1', '-W', String(timeoutSeconds), target.host], { timeout: target.timeoutMs + 500 });
        return { status: 'up', latencyMs: Date.now() - started, error: null };
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 500) : 'Ping failed';
      }
    }
    return { status: 'down', latencyMs: null, error: lastError };
  }
}

export class HttpChecker {
  async check(target: CheckTarget): Promise<CheckResult> {
    const { checkUrl, timeoutMs, retries } = target;
    if (!checkUrl) return { status: 'down', latencyMs: null, error: 'No URL configured for HTTP check' };

    const attempts = retries + 1;
    let lastError = 'HTTP check failed';

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(checkUrl, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - started;
        if (response.ok) return { status: 'up', latencyMs, error: null };
        lastError = `HTTP ${response.status} ${response.statusText}`;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = `Timeout after ${timeoutMs}ms`;
        } else {
          lastError = err instanceof Error ? err.message.slice(0, 500) : 'HTTP request failed';
        }
      }
    }
    return { status: 'down', latencyMs: null, error: lastError };
  }
}

export class TcpChecker {
  async check(target: CheckTarget): Promise<CheckResult> {
    const { host, checkPort, timeoutMs, retries } = target;
    if (!checkPort) return { status: 'down', latencyMs: null, error: 'No port configured for TCP check' };

    const attempts = retries + 1;
    let lastError = 'TCP check failed';

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = createConnection({ host, port: checkPort, timeout: timeoutMs });
          socket.once('connect', () => { socket.destroy(); resolve(); });
          socket.once('timeout', () => { socket.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
          socket.once('error', (err) => { socket.destroy(); reject(err); });
        });
        return { status: 'up', latencyMs: Date.now() - started, error: null };
      } catch (err) {
        lastError = err instanceof Error ? err.message.slice(0, 500) : 'TCP connection failed';
      }
    }
    return { status: 'down', latencyMs: null, error: lastError };
  }
}

export class DnsChecker {
  async check(target: CheckTarget): Promise<CheckResult> {
    const { host, timeoutMs, retries } = target;
    const attempts = retries + 1;
    let lastError = 'DNS resolution failed';

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      try {
        const addresses = await withTimeout(dnsResolve(host), timeoutMs, `Timeout after ${timeoutMs}ms`);
        if (addresses.length === 0) throw new Error('DNS resolution returned no records');
        return { status: 'up', latencyMs: Date.now() - started, error: null };
      } catch (err) {
        lastError = err instanceof Error ? err.message.slice(0, 500) : 'DNS resolution failed';
      }
    }
    return { status: 'down', latencyMs: null, error: lastError };
  }
}

export class TlsChecker {
  async check(target: CheckTarget): Promise<CheckResult> {
    const { host, checkPort, timeoutMs, retries } = target;
    if (!checkPort) return { status: 'down', latencyMs: null, error: 'No port configured for TLS check' };

    const attempts = retries + 1;
    let lastError = 'TLS check failed';

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      try {
        const daysUntilExpiry = await new Promise<number>((resolvePromise, reject) => {
          const socket = tlsConnect(
            {
              host,
              port: checkPort,
              // SNI's servername must be a hostname, not an IP literal (RFC
              // 6066) — Node warns and will eventually ignore it otherwise.
              // Many monitored devices are reached by bare LAN IP.
              servername: isIP(host) ? undefined : host,
              timeout: timeoutMs,
              // Certificate *trust* isn't what this check verifies — only
              // expiry. Self-signed/internal certs (common on monitored
              // home/office devices) must still hand back their certificate.
              rejectUnauthorized: false
            },
            () => {
              const cert = socket.getPeerCertificate();
              socket.end();
              if (!cert || !cert.valid_to) {
                reject(new Error('No TLS certificate presented'));
                return;
              }
              const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / MS_PER_DAY);
              resolvePromise(daysLeft);
            }
          );
          socket.once('timeout', () => {
            socket.destroy();
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          });
          socket.once('error', (err) => {
            socket.destroy();
            reject(err);
          });
        });
        return { status: 'up', latencyMs: Date.now() - started, error: null, meta: { daysUntilExpiry } };
      } catch (err) {
        lastError = err instanceof Error ? err.message.slice(0, 500) : 'TLS check failed';
      }
    }
    return { status: 'down', latencyMs: null, error: lastError };
  }
}

export class MultiChecker implements DeviceChecker {
  private readonly ping = new PingChecker();
  private readonly http = new HttpChecker();
  private readonly tcp = new TcpChecker();
  private readonly dns = new DnsChecker();
  private readonly tls = new TlsChecker();

  async check(target: CheckTarget): Promise<CheckResult> {
    if (target.checkType === 'http') return this.http.check(target);
    if (target.checkType === 'tcp') return this.tcp.check(target);
    if (target.checkType === 'dns') return this.dns.check(target);
    if (target.checkType === 'tls') return this.tls.check(target);
    return this.ping.check(target);
  }
}
