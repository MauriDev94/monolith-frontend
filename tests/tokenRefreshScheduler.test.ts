import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRefreshScheduler } from '@/auth/tokenRefreshScheduler';

/**
 * Build a JWT whose `exp` is `now + secondsOffset`.
 */
function makeToken(expSecondsOffset: number): string {
  const exp = Math.floor(Date.now() / 1000) + expSecondsOffset;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: 'user-1', exp };
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64(header)}.${b64(payload)}.sig`;
}

describe('createRefreshScheduler', () => {
  let now = 0;
  let clock: ReturnType<typeof vi.useFakeTimers>;

  beforeEach(() => {
    now = Date.now();
    clock = vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    clock.useRealTimers();
  });

  it('schedules setTimeout for (exp - 60s) relative to now', () => {
    const scheduler = createRefreshScheduler();
    const token = makeToken(900); // 15 min lifetime → timer in ~14 min
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule(token, onRefresh);

    // Exactly one timer is armed.
    expect(clock.getTimerCount()).toBe(1);
    // Well inside the pending region — 5 minutes in, no refresh yet.
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(onRefresh).not.toHaveBeenCalled();
    // Cross the 60s lead — refresh fires.
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('schedules the timer immediately when exp is already in the past', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const token = makeToken(-30); // expired 30s ago

    scheduler.schedule(token, onRefresh);

    // Drift clamp: delay is `max(0, …)` so the timer fires on the next tick.
    vi.advanceTimersByTime(0);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('schedules the timer at exactly exp - 60s when exp is within 60s of now', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const token = makeToken(45); // exp in 45s → fire in 0s (drift clamp)

    scheduler.schedule(token, onRefresh);
    vi.advanceTimersByTime(0);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending timer without firing onRefresh', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    scheduler.schedule(makeToken(900), onRefresh);

    scheduler.cancel();
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(clock.getTimerCount()).toBe(0);
  });

  it('cancel is idempotent', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    scheduler.schedule(makeToken(900), onRefresh);

    scheduler.cancel();
    expect(() => scheduler.cancel()).not.toThrow();
    scheduler.cancel();
    expect(clock.getTimerCount()).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('cancel before schedule is a no-op', () => {
    const scheduler = createRefreshScheduler();
    expect(() => scheduler.cancel()).not.toThrow();
    expect(clock.getTimerCount()).toBe(0);
  });

  it('schedule replaces any previously scheduled timer', () => {
    const scheduler = createRefreshScheduler();
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule(makeToken(900), first);
    scheduler.schedule(makeToken(1800), second); // 30 min — second wins
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(first).not.toHaveBeenCalled();
    expect(clock.getTimerCount()).toBe(1);
  });

  it('schedule clears a stale handle when called twice in a row', () => {
    const scheduler = createRefreshScheduler();
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule(makeToken(900), a);
    scheduler.schedule(makeToken(1800), b);

    expect(clock.getTimerCount()).toBe(1);
  });

  it('swallows onRefresh errors so the scheduler survives', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockRejectedValue(new Error('refresh failed'));

    scheduler.schedule(makeToken(-30), onRefresh); // fires immediately
    // Advance enough to drain any microtasks.
    return vi.advanceTimersByTimeAsync(0).then(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
      // The scheduler does not re-throw synchronously; the .catch in
      // createRefreshScheduler swallows the rejection.
    });
  });

  it('throws when given a malformed token (does not silently schedule)', () => {
    const scheduler = createRefreshScheduler();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    expect(() => scheduler.schedule('not-a-jwt', onRefresh)).toThrow();
    expect(clock.getTimerCount()).toBe(0);
  });
});