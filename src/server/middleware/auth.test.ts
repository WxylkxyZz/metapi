import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { extractClientIp, isIpAllowed } from './auth.js';
import { config } from '../config.js';

describe('auth middleware IP helpers', () => {
  let originalTrustedProxy: string[];

  beforeEach(() => {
    originalTrustedProxy = config.trustedProxy;
  });

  afterEach(() => {
    config.trustedProxy = originalTrustedProxy;
  });

  it('does not trust X-Forwarded-For when no trusted proxy is configured', () => {
    config.trustedProxy = [];
    const ip = extractClientIp('203.0.113.10', '198.51.100.7');
    expect(ip).toBe('203.0.113.10');
  });

  it('trusts X-Forwarded-For only when the socket peer is a configured trusted proxy', () => {
    config.trustedProxy = ['10.0.0.8'];
    // Typical nginx setup: the proxy appends the client IP as the only entry.
    const ip = extractClientIp('10.0.0.8', '198.51.100.7');
    expect(ip).toBe('198.51.100.7');
  });

  it('returns the rightmost non-trusted entry in a multi-hop chain', () => {
    config.trustedProxy = ['10.0.0.8'];
    // client 198.51.100.7 -> proxy 203.0.113.2 -> trusted proxy 10.0.0.8.
    // The trusted proxy's immediate upstream (203.0.113.2) is the effective client.
    const ip = extractClientIp('10.0.0.8', '198.51.100.7, 203.0.113.2');
    expect(ip).toBe('203.0.113.2');
  });

  it('does not trust X-Forwarded-For from a non-trusted socket peer', () => {
    config.trustedProxy = ['10.0.0.8'];
    const ip = extractClientIp('203.0.113.99', '198.51.100.7');
    expect(ip).toBe('203.0.113.99');
  });

  it('walks right-to-left skipping trusted proxy IPs in the chain', () => {
    config.trustedProxy = ['10.0.0.8'];
    const ip = extractClientIp('10.0.0.8', '198.51.100.7, 10.0.0.8');
    expect(ip).toBe('198.51.100.7');
  });

  it('trusts X-Forwarded-For from a CIDR trusted proxy range', () => {
    config.trustedProxy = ['10.0.0.0/24'];
    const ip = extractClientIp('10.0.0.8', '198.51.100.7');
    expect(ip).toBe('198.51.100.7');

    const nonTrusted = extractClientIp('10.1.0.8', '198.51.100.7');
    expect(nonTrusted).toBe('10.1.0.8');
  });

  it('allows request when allowlist is empty', () => {
    expect(isIpAllowed('203.0.113.8', [])).toBe(true);
  });

  it('rejects non-allowlisted IP when allowlist is configured', () => {
    expect(isIpAllowed('203.0.113.8', ['203.0.113.9'])).toBe(false);
    expect(isIpAllowed('203.0.113.9', ['203.0.113.9'])).toBe(true);
  });

  it('matches ipv4 CIDR ranges in the allowlist', () => {
    expect(isIpAllowed('8.8.8.8', ['8.8.8.0/24'])).toBe(true);
    expect(isIpAllowed('8.8.9.8', ['8.8.8.0/24'])).toBe(false);
    expect(isIpAllowed('8.8.8.8', ['8.8.0.0/16'])).toBe(true);
  });

  it('ignores malformed CIDR entries instead of matching unexpectedly', () => {
    expect(isIpAllowed('8.8.8.8', ['8.8.8.0/99'])).toBe(false);
    expect(isIpAllowed('8.8.8.8', ['not-an-ip/24'])).toBe(false);
  });
});
