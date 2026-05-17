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

  it('counts identified users only — anon sockets do not inflate the count', () => {
    // Anon sockets get filtered out here so the same user on a 2nd device
    // (which silently failed to identify) doesn't appear as a phantom "+1".
    // The frontend handles the "lone visitor sees 1 online" UX itself.
    const a = fakeClient();
    const b = fakeClient();
    const c = fakeClient();
    clients.set(a, { userId: 'u1', name: 'Alice' });
    clients.set(b, { userId: null, name: '' }); // connected but never identified
    clients.set(c, { userId: 'u2', name: 'Bob' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(a);
    expect(msg.type).toBe('user_count');
    expect(msg.count).toBe(2);
    expect(msg.names).toEqual(['Alice', 'Bob']);
  });

  it('a solo unidentified socket reports 0 from the server (client shows 1)', () => {
    const solo = fakeClient();
    clients.set(solo, { userId: null, name: '' });

    gateway['broadcastUserCount']();

    // Server count is 0; frontend bumps it to max(count, 1) when connected.
    expect(lastBroadcast(solo).count).toBe(0);
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

  it('one identified + one anon-ghost on the same person = 1 (not 2)', () => {
    // This is the bug the user reported: phone tab silently failed to
    // identify (cookie not sent + no localStorage authToken), so the
    // server has an anon entry alongside the Mac's named entry. Previously
    // we returned count=2 with names=['Alice']; now the anon is dropped.
    const mac = fakeClient();
    const phone = fakeClient();
    clients.set(mac, { userId: 'u-1', name: 'Alice' });
    clients.set(phone, { userId: null, name: '' });

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(mac);
    expect(msg.count).toBe(1);
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
