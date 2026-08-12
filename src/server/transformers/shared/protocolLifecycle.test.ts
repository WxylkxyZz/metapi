import { describe, expect, it, vi } from 'vitest';
import { createProxyStreamLifecycle } from './protocolLifecycle.js';

function makeReader(overrides: Partial<{
  reads: Array<{ done: boolean; value?: Uint8Array } | Promise<{ done: boolean; value?: Uint8Array }>>;
  cancelImpl: (reason?: unknown) => Promise<unknown>;
}> = {}) {
  let index = 0;
  const cancel = overrides.cancelImpl || vi.fn(async () => undefined);
  const reads = overrides.reads || [];
  return {
    read: vi.fn(async () => {
      const next = reads[index];
      index += 1;
      if (next === undefined) return { done: true, value: undefined };
      return next;
    }),
    cancel,
    releaseLock: vi.fn(),
  };
}

const encoder = new TextEncoder();

describe('createProxyStreamLifecycle idle timeout', () => {
  it('ends the stream and runs onEof when the upstream stalls after the first byte', async () => {
    const ended = vi.fn();
    const onEof = vi.fn();
    const handleEvent = vi.fn(async () => false);

    // First read returns a chunk, then the next read hangs forever (never resolves).
    const reader = makeReader({
      reads: [
        { done: false, value: encoder.encode('data: {"x":1}\n\n') },
        new Promise<{ done: boolean; value?: Uint8Array }>(() => {}), // never settles
      ],
    });

    const lifecycle = createProxyStreamLifecycle({
      reader,
      response: { end: ended },
      pullEvents: (buffer) => {
        const events = buffer.includes('data:')
          ? [{ payload: { x: 1 } }]
          : [];
        return { events, rest: buffer };
      },
      handleEvent,
      onEof,
      idleTimeoutMs: 50,
    });

    await lifecycle.run();

    expect(handleEvent).toHaveBeenCalledTimes(1); // the chunk was processed
    expect(onEof).toHaveBeenCalledTimes(1); // stalled -> terminal event emitted
    expect(ended).toHaveBeenCalledTimes(1); // response closed
    expect(reader.cancel).toHaveBeenCalled(); // upstream reader cancelled
  });

  it('does NOT kill a slow-but-alive stream that keeps sending chunks', async () => {
    const ended = vi.fn();
    const onEof = vi.fn();
    const handleEvent = vi.fn(async () => false);

    // Many chunks, each arriving well inside the 50ms idle window.
    const reader = makeReader({
      reads: [
        { done: false, value: encoder.encode('data: {"i":1}\n\n') },
        { done: false, value: encoder.encode('data: {"i":2}\n\n') },
        { done: false, value: encoder.encode('data: {"i":3}\n\n') },
        { done: true, value: undefined },
      ],
    });

    const lifecycle = createProxyStreamLifecycle({
      reader,
      response: { end: ended },
      pullEvents: (buffer) => {
        // Consume every complete event so the buffer doesn't accumulate across reads (mirrors
        // the real pullSseEvents contract).
        const count = (buffer.match(/data:/g) || []).length;
        return { events: Array.from({ length: count }, () => ({ payload: {} })), rest: '' };
      },
      handleEvent,
      onEof,
      idleTimeoutMs: 500,
    });

    await lifecycle.run();

    expect(handleEvent).toHaveBeenCalledTimes(3);
    expect(onEof).toHaveBeenCalledTimes(1); // normal EOF (not a stall)
    expect(ended).toHaveBeenCalledTimes(1);
    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it('does not trigger the idle timeout when disabled (idleTimeoutMs 0)', async () => {
    const ended = vi.fn();
    const onEof = vi.fn();
    const handleEvent = vi.fn(async () => false);

    const reader = makeReader({
      reads: [
        { done: false, value: encoder.encode('data: {"i":1}\n\n') },
        new Promise<{ done: boolean; value?: Uint8Array }>(() => {}),
      ],
    });

    const lifecycle = createProxyStreamLifecycle({
      reader,
      response: { end: ended },
      pullEvents: (buffer) => ({
        events: buffer.trim().length > 0 ? [{ payload: {} }] : [],
        rest: buffer,
      }),
      handleEvent,
      onEof,
      idleTimeoutMs: 0,
    });

    // With idle disabled, run() stays pending forever on the hanging read. We can't await it,
    // so drive it and assert it is still pending after a short wait.
    const runPromise = lifecycle.run();
    let settled = false;
    runPromise.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(settled).toBe(false);
    // Clean up: cancel won't happen, but the reader is a dangling promise — nothing to release.
    expect(reader.cancel).not.toHaveBeenCalled();
  });
});