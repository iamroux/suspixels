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

  beforeEach(() => {
    gateway = new WebsocketGateway({} as any, {} as any);
  });

  it('counts every connected client, including unidentified ones', () => {
    const a = fakeClient();
    const b = fakeClient();
    const c = fakeClient();
    const clients: Map<any, string> = gateway['clients'];
    clients.set(a, 'Alice');
    clients.set(b, ''); // connected but not yet identified
    clients.set(c, 'Bob');

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(a);
    expect(msg.type).toBe('user_count');
    expect(msg.count).toBe(3);
    expect(msg.names).toEqual(['Alice', 'Bob']);
  });

  it('reports a solo unidentified client as 1 online, not 0', () => {
    const solo = fakeClient();
    gateway['clients'].set(solo, '');

    gateway['broadcastUserCount']();

    expect(lastBroadcast(solo).count).toBe(1);
  });

  it('deduplicates same user across multiple tabs/devices', () => {
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    const tab3 = fakeClient();
    gateway['clients'].set(tab1, 'roux');
    gateway['clients'].set(tab2, 'roux');
    gateway['clients'].set(tab3, 'roux');

    gateway['broadcastUserCount']();

    const msg = lastBroadcast(tab1);
    expect(msg.count).toBe(1);
    expect(msg.names).toEqual(['roux']);
  });
});
