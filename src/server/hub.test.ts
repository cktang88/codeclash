import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Hub, MAX_BUFFERED_BYTES } from './hub.ts';

function fakeSocket(bufferedAmount: number) {
  return { OPEN: 1, readyState: 1, bufferedAmount, send: vi.fn(), terminate: vi.fn(), close: vi.fn(), on: vi.fn() };
}

describe('Hub', () => {
  it('drops a viewer that stopped reading instead of buffering for it without bound', () => {
    const hub = new Hub();
    const slow = fakeSocket(MAX_BUFFERED_BYTES + 1);
    const fine = fakeSocket(0);
    hub.add(1, slow as unknown as WebSocket, null);
    hub.add(1, fine as unknown as WebSocket, null);
    hub.broadcast(1, { type: 'presence', presence: [] });
    expect(slow.send).not.toHaveBeenCalled();
    expect(slow.terminate).toHaveBeenCalled();
    expect(fine.send).toHaveBeenCalledTimes(1);
    hub.closeAll();
  });
});
