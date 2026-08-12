import { isIP } from 'node:net';
import { config } from '../config.js';

// Dependency-free IP resolution helpers shared by the auth middleware and the
// rate-limit guard. Kept separate from middleware/auth.js so that the rate-limit
// module does not transitively load the DB at import time.

export function normalizeIp(rawIp: string | null | undefined): string {
  const ip = (rawIp || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length).trim();
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

export function parseIpv4Value(rawIp: string | null | undefined): number | null {
  const normalizedIp = normalizeIp(rawIp);
  if (isIP(normalizedIp) !== 4) return null;

  let value = 0;
  for (const part of normalizedIp.split('.')) {
    value = (value << 8) + Number(part);
  }
  return value >>> 0;
}

export function isTrustedProxyIp(socketIp: string | null | undefined): boolean {
  const normalized = normalizeIp(socketIp);
  if (!normalized) return false;
  return config.trustedProxy.some((entry) => {
    const normalizedEntry = normalizeIp(entry);
    if (!normalizedEntry) return false;
    if (normalizedEntry === normalized) return true;
    // Support CIDR entries for trusted proxy ranges.
    const slashIndex = normalizedEntry.indexOf('/');
    if (slashIndex === -1) return false;
    const cidrNetwork = normalizeIp(normalizedEntry.slice(0, slashIndex));
    const prefixText = normalizedEntry.slice(slashIndex + 1).trim();
    if (!cidrNetwork || !/^\d+$/.test(prefixText)) return false;
    const prefix = Number(prefixText);
    const networkValue = parseIpv4Value(cidrNetwork);
    const clientValue = parseIpv4Value(normalized);
    if (networkValue === null || clientValue === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (clientValue & mask) === (networkValue & mask);
  });
}

export function extractClientIp(
  remoteIp: string | null | undefined,
  xForwardedFor?: string | string[] | undefined,
): string {
  const socketIp = normalizeIp(remoteIp);
  // Only honor X-Forwarded-For when the direct peer is a configured trusted proxy.
  // Otherwise a spoofed header lets remote clients impersonate loopback or bypass
  // the admin IP allowlist.
  if (isTrustedProxyIp(remoteIp)) {
    if (Array.isArray(xForwardedFor)) {
      const first = xForwardedFor.find((item) => item && item.trim().length > 0);
      if (first) {
        const entries = first.split(',');
        // Walk from the right, skipping our own trusted proxy IPs, to find the real client.
        for (let i = entries.length - 1; i >= 0; i -= 1) {
          const candidate = normalizeIp(entries[i]);
          const candidateIsTrustedProxy = config.trustedProxy.some((p) => normalizeIp(p) === candidate);
          if (!candidateIsTrustedProxy) return candidate;
        }
        return normalizeIp(entries[0]);
      }
    } else if (typeof xForwardedFor === 'string' && xForwardedFor.trim().length > 0) {
      const entries = xForwardedFor.split(',');
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const candidate = normalizeIp(entries[i]);
        const candidateIsTrustedProxy = config.trustedProxy.some((p) => normalizeIp(p) === candidate);
        if (!candidateIsTrustedProxy) return candidate;
      }
      return normalizeIp(entries[0]);
    }
  }
  return socketIp;
}