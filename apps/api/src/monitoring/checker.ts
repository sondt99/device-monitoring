import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CheckTarget {
  host: string;
  checkType: 'ping' | 'http';
  checkUrl: string | null;
  timeoutMs: number;
  retries: number;
}

export interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number | null;
  error: string | null;
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

export class MultiChecker implements DeviceChecker {
  private readonly ping = new PingChecker();
  private readonly http = new HttpChecker();

  async check(target: CheckTarget): Promise<CheckResult> {
    return target.checkType === 'http' ? this.http.check(target) : this.ping.check(target);
  }
}
