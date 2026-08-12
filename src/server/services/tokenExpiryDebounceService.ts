/**
 * Sliding-window debounce for "token expired" detection.
 *
 * A single upstream 401 / auth-looking error can be a transient individual glitch
 * (site throttling, a momentary one-off error) rather than a genuinely expired token.
 * Promoted an account to the "expired" state on the first hit is too eager and burns
 * the account, forcing the user to re-verify while the token was actually fine.
 *
 * This gate records each auth-looking signal per account and only actually reports a
 * token as expired when N signals land within a short rolling window. A successful
 * terminal outcome for the account clears accumulated partial signals, so a healthy
 * stretch never lets a lone old hit contribute to a future expiry decision.
 *
 * The counters are in-memory and intentionally NOT persisted: a 10-minute window is
 * short-lived, and a process restart is itself a fresh confirmation (the next real
 * auth error re-armed the window from zero).
 */
export const TOKEN_EXPIRY_CONFIRM_THRESHOLD = 5;
export const TOKEN_EXPIRY_CONFIRM_WINDOW_MS = 10 * 60 * 1000;

/** Timestamps of each auth-looking signal seen within the window, oldest first, per account. */
const signalsByAccount = new Map<number, number[]>();

function pruneWindow(accountId: number, now: number): number[] {
  const cutoff = now - TOKEN_EXPIRY_CONFIRM_WINDOW_MS;
  const events = (signalsByAccount.get(accountId) || []).filter((ts) => ts > cutoff);
  if (events.length === 0) {
    signalsByAccount.delete(accountId);
  } else {
    signalsByAccount.set(accountId, events);
  }
  return events;
}

/**
 * Record one auth-looking (token-expired-like) signal for an account.
 * Returns `true` only when the account has accumulated >= threshold signals within the
 * rolling window — i.e. only then should the caller actually mark the token expired.
 */
export function bumpTokenExpirySignal(accountId: number): boolean {
  const now = Date.now();
  const events = pruneWindow(accountId, now);
  events.push(now);
  signalsByAccount.set(accountId, events);

  if (events.length >= TOKEN_EXPIRY_CONFIRM_THRESHOLD) {
    console.warn(`[tokenExpiryDebounce] account ${accountId} reached ${
      events.length}/${TOKEN_EXPIRY_CONFIRM_THRESHOLD} auth signals within ${
        TOKEN_EXPIRY_CONFIRM_WINDOW_MS / 1000}s — reporting token expired`);
    return true;
  }
  return false;
}

/**
 * Clear any accumulated partial signals for an account. Call on a successful terminal
 * outcome (proxy success, successful checkin / balance) so a healthy stretch never
 * lets old lone failures contribute to a future expiry decision.
 */
export function clearTokenExpirySignals(accountId: number): void {
  signalsByAccount.delete(accountId);
}