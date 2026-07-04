import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// SSRF guard for outbound notification requests. Notification channels are
// admin-configured and the response body is never surfaced back to the caller,
// so this is defence-in-depth rather than a primary control — but a webhook
// pointed at a cloud metadata endpoint (169.254.169.254) is the one genuinely
// dangerous target, so we block link-local addresses outright. Ordinary
// destinations (Discord, Telegram, Slack, and LAN/loopback relays a
// self-hosted operator might legitimately use) are unaffected.

function normalizeIp(ip: string): string {
  const withoutZone = ip.split('%')[0].toLowerCase(); // drop IPv6 zone id, e.g. fe80::1%eth0
  // IPv4-mapped IPv6, dotted form: ::ffff:169.254.169.254
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(withoutZone);
  if (dotted) return dotted[1];
  // IPv4-mapped IPv6, hex form (how Node normalizes it): ::ffff:a9fe:a9fe
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(withoutZone);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return withoutZone;
}

function isLinkLocal(ip: string): boolean {
  const addr = normalizeIp(ip);
  if (addr.startsWith('169.254.')) return true; // IPv4 link-local, incl. 169.254.169.254 cloud metadata
  if (/^fe[89ab]/.test(addr)) return true; // IPv6 fe80::/10 link-local
  return false;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid notification URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Notification URL must use http:// or https://');
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((entry) => entry.address);
    } catch {
      // DNS failure — let the real fetch surface the network error instead.
      return;
    }
  }

  if (addresses.some(isLinkLocal)) {
    throw new Error('Notification URL resolves to a blocked link-local address (SSRF guard)');
  }
}
