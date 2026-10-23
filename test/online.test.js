import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/tracks/index.js';
import { Race } from '../src/race.js';
import { startStroke } from '../src/canoe.js';
import { STROKES } from '../src/strokes.js';
import { Room, MAX_PLAYERS, cleanCode } from '../src/net/room.js';
import { makeRoster } from '../src/net/sync.js';

// Browsers linked in memory instead of through WebRTC. Messages arrive on a later tick, as on a network.
function fakeNet() {
  const peers = new Map();
  let n = 0;
  const later = f => setTimeout(f, 0);
  function pipe() {
    const a = { data: [], close: [] }, b = { data: [], close: [] };
    let open = true;
    const end = (me, other) => ({
      send: m => { if (open) { const copy = JSON.parse(JSON.stringify(m)); later(() => open && other.data.forEach(f => f(copy))); } },
      onData: cb => me.data.push(cb),
      onClose: cb => me.close.push(cb),
      close: () => { if (!open) return; open = false; later(() => { a.close.forEach(f => f()); b.close.forEach(f => f()); }); },
    });
    return [end(a, b), end(b, a)];
  }
  return {
    async open(id) {
      id = id || 'anon-' + n++;
      if (peers.has(id)) throw Object.assign(new Error('taken'), { type: 'taken' });
      const listeners = [];
      peers.set(id, listeners);
      return {
        onConnection: cb => listeners.push(cb),
        async connect(target) {
          const there = peers.get(target);
          if (!there) throw Object.assign(new Error('missing'), { type: 'missing' });
          const [mine, theirs] = pipe();
          there.forEach(cb => cb(theirs));
          return mine;
        },
        close: () => peers.delete(id),
      };
    },
  };
}
const tick = () => new Promise(r => setTimeout(r, 5));

test('códigos de sala: 4 letras, sem caracteres ambíguos', () => {
  assert.equal(cleanCode(' ab-c d9 '), 'ABCD');
});

test('sala: o anfitrião cria, amigos entram pelo código e todos largam juntos', async () => {
  const net = fakeNet();
  const starts = [];
  const host = new Room(net, 'Eduardo', { start: s => starts.push(['host', s]) });
  const code = await host.create();
  assert.match(code, /^[A-Z2-9]{4}$/);
  const ana = new Room(net, 'Ana', { start: s => starts.push(['ana', s]) });
  const bia = new Room(net, 'Bia', { start: s => starts.push(['bia', s]) });
  await ana.join(code.toLowerCase());
  await bia.join(code);
  await tick();
  assert.deepEqual(host.players.map(p => p.name), ['Eduardo', 'Ana', 'Bia']);
  assert.deepEqual(bia.players.map(p => p.slot), [0, 1, 2]);
  assert.equal(ana.mySlot, 1); assert.equal(bia.mySlot, 2);

  host.start({ track: 'copa', seed: 42, roster: makeRoster(host.players, true) });
  await tick();
  assert.deepEqual(starts.map(s => s[0]).sort(), ['ana', 'bia', 'host']);
  assert.ok(starts.every(([, s]) => s.seed === 42 && s.roster.length === 7));

  // Ana leaves: the others hear it and her place frees up
  const left = [];
  host.on.leave = s => left.push(s);
  ana.close();
  await tick(); await tick();
  assert.deepEqual(left, [1]);
  assert.deepEqual(bia.players.map(p => p.name), ['Eduardo', 'Bia']);
  host.close(); bia.close();
});

test('sala cheia recusa mais um e código errado não entra', async () => {
  const net = fakeNet();
  const host = new Room(net, 'H');
  const code = await host.create();
  const rooms = [];
  for (let i = 1; i < MAX_PLAYERS; i++) { const r = new Room(net, 'P' + i); await r.join(code); rooms.push(r); }
  await assert.rejects(new Room(net, 'X').join(code), e => e.type === 'refused');
  await assert.rejects(new Room(net, 'Y').join('ZZZZ'), e => e.type === 'missing');
  for (const r of rooms) r.close();
  host.close();
});

test('corrida online: cada tela rema a sua canoa e vê a do outro chegando perto de onde ela está', async () => {
  const net = fakeNet();
  const races = {};
  const mk = (who, name) => new Room(net, name, {
    start: s => { races[who] = new Race(TRACKS.find(t => t.id === s.track), { seed: s.seed, weather: 'nublado', roster: s.roster, mySlot: rooms[who].mySlot, host: rooms[who].isHost }); },
    state: (slot, snap, rid) => { if (races[who] && rid === races[who].seed) races[who].receive(slot, snap); },
  });
  const rooms = {};
  rooms.host = mk('host', 'Eduardo');
  const code = await rooms.host.create();
  rooms.guest = mk('guest', 'Ana');
  await rooms.guest.join(code);
  await tick();
  rooms.host.start({ track: 'copa', seed: 9, roster: makeRoster(rooms.host.players, true) });
  await tick();
  const { host, guest } = races;
  assert.equal(host.me.slot, 0); assert.equal(guest.me.slot, 1);
  // the guest's screen moves nobody but the guest; the host also paddles the rivals
  assert.ok(guest.rivals.every(r => r.remote));
  assert.deepEqual(host.rivals.filter(r => r.remote).map(r => r.name), ['Ana']);

  const next = { host: 0, guest: 0 };
  for (let i = 0; i < 60 * 40; i++) {
    for (const who of ['host', 'guest']) {
      const r = races[who], me = r.me;
      if (r.count <= 0 && r.t >= next[who]) {
        const err = me.psi - Math.max(-0.4, Math.min(0.4, (me.lane - me.x) * 0.03));
        const side = err > 0.06 ? 1 : err < -0.06 ? -1 : -me.lastSide || 1;
        next[who] = r.t + (startStroke(me, side, 'media', r.t) ? STROKES.media.gap * 1.08 : 0.03);
      }
      r.update(1 / 60);
      if (i % 4 === 0) rooms[who].sendState(r.seed, r.localStates());
    }
    if (i % 4 === 0) await tick();
  }
  await tick();
  const ana = host.rivals.find(r => r.slot === 1), carina = guest.rivals.find(r => r.slot === 2);
  assert.ok(guest.me.y > 50, `Ana andou (${guest.me.y.toFixed(0)} m)`);
  assert.ok(Math.abs(ana.y - guest.me.y) < 4, `a Ana na tela do anfitrião está onde ela está (${ana.y.toFixed(1)} x ${guest.me.y.toFixed(1)})`);
  const edu = guest.rivals.find(r => r.slot === 0);
  assert.ok(Math.abs(edu.y - host.me.y) < 4, `o anfitrião na tela da Ana (${edu.y.toFixed(1)} x ${host.me.y.toFixed(1)})`);
  const hostCarina = host.rivals.find(r => r.slot === 2);
  assert.ok(Math.abs(carina.y - hostCarina.y) < 4, 'os rivais do anfitrião aparecem na tela da Ana');

  // Ana gives up: she goes to the bottom of the host's results
  guest.me.quit = true;
  rooms.guest.sendState(guest.seed, guest.localStates());
  await tick();
  const st = host.standings().sort((a, b) => a.est - b.est);
  assert.equal(st[st.length - 1].name, 'Ana');
  rooms.host.close(); rooms.guest.close();
});
