import { describe, expect, it, vi } from 'vitest';
import { authEvents } from '@/auth/authEvents';

describe('authEvents', () => {
  it('invokes registered listeners when an event is emitted', () => {
    const cb = vi.fn();
    const off = authEvents.on('unauthorized', cb);
    authEvents.emit('unauthorized');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const cb = vi.fn();
    const off = authEvents.on('unauthorized', cb);
    off();
    authEvents.emit('unauthorized');
    expect(cb).not.toHaveBeenCalled();
  });

  it('keeps other listeners alive when one unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = authEvents.on('unauthorized', a);
    authEvents.on('unauthorized', b);
    offA();
    authEvents.emit('unauthorized');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('supports multiple subscribers for the same event', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = authEvents.on('unauthorized', a);
    const offB = authEvents.on('unauthorized', b);
    authEvents.emit('unauthorized');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it('re-subscribing after unsubscribe re-fires the listener', () => {
    const cb = vi.fn();
    const off = authEvents.on('unauthorized', cb);
    off();
    authEvents.on('unauthorized', cb);
    authEvents.emit('unauthorized');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('emitting with no listeners is a no-op', () => {
    // Just confirm no throw and no leaked state.
    expect(() => authEvents.emit('unauthorized')).not.toThrow();
  });

  it('swallows listener exceptions so the bus survives', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const offBad = authEvents.on('unauthorized', bad);
    authEvents.on('unauthorized', good);
    // EventTarget silently swallows listener errors; `good` must still run.
    authEvents.emit('unauthorized');
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
  });
});