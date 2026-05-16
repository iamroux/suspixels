import { WebsocketGateway } from './pixels.gateway';

const OPEN = 1;

function fakeClient() {
  return { readyState: OPEN, send: jest.fn() } as any;
}

function lastBroadcast(client: any) {
  const calls = client.send.mock.calls;
  return JSON.parse(calls[calls.length - 1][0]);
}

describe('WebsocketGateway online count', () => {
  let gateway: WebsocketGateway;
  let clients: Map<any, { userId: string | null; name: string }>;

  beforeEach(() => {
    gateway = new WebsocketGateway({} as any, {} as any);
    clients = gateway['clients'] as any;
  });

  it('counts every connected client, including unidentified ones', () => {
    const a = fakeClient();
    const b = fakeClient();
    const c = fakeClient();
    clients.set(a, { userId: 'u1', name: 'Alice' });
    clients.set(b, { userId: null, name: '' }); // connected but not yet identified
    clients.set(c, { userId: 'u2', name: 'Bob' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(a);
    expect(msg.type).toBe('user_count');
    expect(msg.count).toBe(3);
    expect(msg.names).toEqual(['Alice', 'Bob']);
  });

  it('reports a solo unidentified client as 1 online, not 0', () => {
    const solo = fakeClient();
    clients.set(solo, { userId: null, name: '' });

    gateway['broadcastUserCount']();

    expect(lastBroadcast(solo).count).toBe(1);
  });

  it('deduplicates same user across multiple tabs/devices (by userId)', () => {
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    const tab3 = fakeClient();
    clients.set(tab1, { userId: 'u-roux', name: 'roux' });
    clients.set(tab2, { userId: 'u-roux', name: 'roux' });
    clients.set(tab3, { userId: 'u-roux', name: 'roux' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(tab1);
    expect(msg.count).toBe(1);
    expect(msg.names).toEqual(['roux']);
  });

  it('deduplicates by userId even if one tab has a stale name string', () => {
    // Simulates the user renaming themselves in tab1; tab2 still has old
    // cached name string until it reconnects.
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    clients.set(tab1, { userId: 'u-1', name: 'newName' });
    clients.set(tab2, { userId: 'u-1', name: 'oldName' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(tab1);
    expect(msg.count).toBe(1);
    // Only one of the names shows — the one from whichever socket was iterated first.
    expect(msg.names.length).toBe(1);
  });

  it('deduplicates by userId when one tab is logged-in and another is mid-handshake', () => {
    // Same user, but tab2's identify hasn't completed yet (userId still null).
    // It still counts as a separate anon presence — that is intentional, since
    // we cannot prove it's the same user without an id. The named copy counts
    // as 1 user.
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    clients.set(tab1, { userId: 'u-1', name: 'Alice' });
    clients.set(tab2, { userId: null, name: '' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(tab1);
    expect(msg.count).toBe(2); // 1 named + 1 anon
    expect(msg.names).toEqual(['Alice']);
  });

  it('dedups guests by name (same browser → same Guest_xyz across tabs)', () => {
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    clients.set(tab1, { userId: null, name: 'Guest_abc (Guest)' });
    clients.set(tab2, { userId: null, name: 'Guest_abc (Guest)' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(tab1);
    expect(msg.count).toBe(1);
    expect(msg.names).toEqual(['Guest_abc (Guest)']);
  });
});
