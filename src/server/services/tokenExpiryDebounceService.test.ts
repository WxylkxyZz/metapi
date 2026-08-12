import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bumpTokenExpirySignal,
  clearTokenExpirySignals,
  TOKEN_EXPIRY_CONFIRM_THRESHOLD,
  TOKEN_EXPIRY_CONFIRM_WINDOW_MS,
} from './tokenExpiryDebounceService.js';

describe('tokenExpiryDebounceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearTokenExpirySignals(1);
    clearTokenExpirySignals(2);
    vi.useRealTimers();
  });

  it('does not report before the threshold is reached', () => {
    for (let i = 0; i < TOKEN_EXPIRY_CONFIRM_THRESHOLD - 1; i++) {
      expect(bumpTokenExpirySignal(1)).toBe(false);
    }
  });

  it('reports exactly when the threshold is reached, and on further signals', () => {
    for (let i = 0; i < TOKEN_EXPIRY_CONFIRM_THRESHOLD - 1; i++) {
      bumpTokenExpirySignal(1);
    }
    expect(bumpTokenExpirySignal(1)).toBe(true);
    // Further signals within the window keep reporting.
    expect(bumpTokenExpirySignal(1)).toBe(true);
  });

  it('keeps accounts independent', () => {
    for (let i = 0; i < TOKEN_EXPIRY_CONFIRM_THRESHOLD; i++) {
      bumpTokenExpirySignal(1);
    }
    // Account 2 has only one signal — must not report.
    expect(bumpTokenExpirySignal(2)).toBe(false);
    expect(bumpTokenExpirySignal(1)).toBe(true);
  });

  it('drops hits older than the window (sliding window semantics)', () => {
    // Threshold-1 signals, then advance time past the window, then one more signal.
    // The earlier hits are now expired, so a lone fresh signal must NOT report.
    for (let i = 0; i < TOKEN_EXPIRY_CONFIRM_THRESHOLD - 1; i++) {
      bumpTokenExpirySignal(1);
    }
    vi.advanceTimersByTime(TOKEN_EXPIRY_CONFIRM_WINDOW_MS + 1);
    expect(bumpTokenExpirySignal(1)).toBe(false);
  });

  it('clearTokenExpirySignals resets accumulated signals', () => {
    for (let i = 0; i < TOKEN_EXPIRY_CONFIRM_THRESHOLD - 1; i++) {
      bumpTokenExpirySignal(1);
    }
    clearTokenExpirySignals(1);
    expect(bumpTokenExpirySignal(1)).toBe(false);
  });
});