type PulledEventBatch<TEvent> = {
  events: TEvent[];
  rest: string;
};

type ProxyStreamReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<unknown>;
  releaseLock(): void;
};

type ProxyStreamLifecycleInput<TEvent> = {
  reader: ProxyStreamReader | null | undefined;
  response: { end(): void };
  pullEvents(buffer: string): PulledEventBatch<TEvent>;
  handleEvent(event: TEvent): Promise<boolean | void> | boolean | void;
  onEof?: () => Promise<void> | void;
  /**
   * Idle timeout in milliseconds. If no upstream chunk arrives within this window after the
   * previous chunk (or after the first byte), the stream is considered stalled: the reader is
   * cancelled, `onEof` runs (so the correct terminal event is still emitted), and the response
   * is ended. Without this, an upstream that accepts a request, sends a chunk, then hangs forever
   * (half-closed TLS, dropped reverse-proxy buffer) would leave the downstream SSE hanging open
   * indefinitely. `0` disables the guard.
   */
  idleTimeoutMs?: number;
};

export function createProxyStreamLifecycle<TEvent>(input: ProxyStreamLifecycleInput<TEvent>) {
  const flushBuffer = async (buffer: string): Promise<{ rest: string; stop: boolean }> => {
    const pulled = input.pullEvents(buffer);
    for (const event of pulled.events) {
      if (await input.handleEvent(event)) {
        return {
          rest: pulled.rest,
          stop: true,
        };
      }
    }

    return {
      rest: pulled.rest,
      stop: false,
    };
  };

  return {
    async run(): Promise<void> {
      const reader = input.reader;
      if (!reader) {
        try {
          await input.onEof?.();
        } finally {
          input.response.end();
        }
        return;
      }

      const decoder = new TextDecoder();
      let sseBuffer = '';
      let shouldStop = false;

      // Idle-stall guard: a per-read watchdog that resolves to true if no chunk arrives before
      // the timeout. It is re-armed after every read so a slow-but-alive stream is never killed.
      const idleTimeoutMs = Math.max(0, Math.trunc(input.idleTimeoutMs || 0));
      let idleCancelled = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const idleWatchdog = (): Promise<boolean> => new Promise((resolve) => {
        idleTimer = setTimeout(() => {
          idleCancelled = true;
          resolve(true);
        }, idleTimeoutMs);
      });

      try {
        while (true) {
          const idlePromise = idleTimeoutMs > 0 ? idleWatchdog() : null;
          const readPromise = reader.read();
          const settled = idlePromise
            ? await Promise.race([readPromise, idlePromise])
            : await readPromise;

          if (idleCancelled) {
            // Stall detected: no data for idleTimeoutMs. Tell the caller the stream is gone and
            // end the downstream response so the client isn't left hanging.
            clearIdleTimer();
            await reader.cancel(new Error(`stream idle timeout (${idleTimeoutMs}ms)`)).catch(() => {});
            if (!shouldStop) {
              await input.onEof?.();
            }
            break;
          }

          // A read settled first — disarm the watchdog so it can't fire later.
          clearIdleTimer();
          const { done, value } = settled as { done: boolean; value?: Uint8Array };
          if (done) break;
          if (!value) continue;

          sseBuffer += decoder.decode(value, { stream: true });
          const flushed = await flushBuffer(sseBuffer);
          sseBuffer = flushed.rest;
          if (!flushed.stop) continue;

          shouldStop = true;
          await reader.cancel().catch(() => {});
          break;
        }

        if (!shouldStop && !idleCancelled) {
          sseBuffer += decoder.decode();
          if (sseBuffer.trim().length > 0) {
            const flushed = await flushBuffer(`${sseBuffer}\n\n`);
            sseBuffer = flushed.rest;
            shouldStop = flushed.stop;
          }
        }

        if (!shouldStop && !idleCancelled) {
          await input.onEof?.();
        }
      } finally {
        clearIdleTimer();
        reader.releaseLock();
        input.response.end();
      }
    },
  };
}
