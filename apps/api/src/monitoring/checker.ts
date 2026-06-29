import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CheckTarget {
  host: string;
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

export class PingChecker implements DeviceChecker {
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
