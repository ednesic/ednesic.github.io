// A room for an online race, joined with a short code. The host's browser is the room: guests
// connect only to it, it hands out starting places, starts the race and passes each player's
// canoe on to the others. There is no server of our own; `net` is whatever links the browsers
// (PeerJS in the game, an in-memory stand-in in the tests), so it can be swapped later.
//
// net.open(id) resolves to an endpoint { onConnection(cb), connect(id), close() }, or rejects
// with an error whose type is 'taken' when the id is in use. connect(id) resolves to a connection
// { send(msg), onData(cb), onClose(cb), close() }, or rejects with type 'missing' when no one has that id.
// No DOM or three.js here, so this runs in Node for the tests.

export const MAX_PLAYERS = 6;
const PROTO = 1;
const ID_PREFIX = 'ednesic-vaa-';
// no 0/O, 1/I/L: a code read out loud or copied by hand still works
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newCode = (rnd = Math.random) => Array.from({ length: 4 }, () => LETTERS[Math.floor(rnd() * LETTERS.length)]).join('');
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
const peerId = code => ID_PREFIX + code.toLowerCase();

export class Room {
  // on: { change(room), start(setup), state(slot, snap, rid), leave(slot), closed(reason) }, all optional
  constructor(net, name, on = {}) {
    this.net = net;
    this.name = name;
    this.on = on;
    this.code = null;
    this.isHost = false;
    this.mySlot = 0;
    this.players = [];      // [{ slot, name }] in slot order
    this.info = null;       // what the host set up for the next race (shown to guests in the lobby)
    this.rtt = 0;           // guests: round trip to the host, in seconds
    this.guests = new Map(); // host: slot -> connection
    this.ep = null; this.conn = null; this.pingTimer = null;
  }

  emit(name, ...args) { if (this.on[name]) this.on[name](...args); }

  // Opens a new room under a free code.
  async create(tries = 5) {
    for (let i = 0; ; i++) {
      const code = newCode();
      try {
        this.ep = await this.net.open(peerId(code));
      } catch (e) {
        if (e.type === 'taken' && i < tries) continue;
        throw e;
      }
      this.code = code;
      this.isHost = true;
      this.mySlot = 0;
      this.players = [{ slot: 0, name: this.name }];
      this.ep.onConnection(conn => this.welcome(conn));
      this.emit('change', this);
      return code;
    }
  }

  // Joins the room with that code; resolves once the host has given this player a place.
  async join(code) {
    code = cleanCode(code);
    this.ep = await this.net.open(null);
    let conn;
    try {
      conn = await this.ep.connect(peerId(code));
    } catch (e) { this.ep.close(); throw e; }
    this.conn = conn;
    this.code = code;
    return new Promise((resolve, reject) => {
      let joined = false;
      conn.onData(m => {
        if (!joined) {
          if (m.t === 'welcome') { joined = true; this.mySlot = m.slot; resolve(code); }
          else if (m.t === 'refused') { reject(Object.assign(new Error(m.why), { type: 'refused' })); this.close(); return; }
        }
        this.fromHost(m);
      });
      conn.onClose(() => {
        if (!joined) { reject(Object.assign(new Error('closed'), { type: 'missing' })); return; }
        if (this.conn === conn) { this.close(); this.emit('closed', 'host'); }
      });
      conn.send({ t: 'hello', name: this.name, v: PROTO });
      this.pingTimer = setInterval(() => this.conn && this.conn.send({ t: 'ping', at: now() }), 2000);
      if (this.pingTimer.unref) this.pingTimer.unref();   // Node (tests): never holds the process open
      this.conn.send({ t: 'ping', at: now() });
    });
  }

  // host: a guest knocked
  welcome(conn) {
    let slot = null;
    conn.onData(m => {
      if (slot === null) {
        if (m.t !== 'hello') return;
        if (m.v !== PROTO) { conn.send({ t: 'refused', why: 'version' }); return; }
        if (this.players.length >= MAX_PLAYERS) { conn.send({ t: 'refused', why: 'full' }); return; }
        slot = 0;
        while (this.players.some(p => p.slot === slot)) slot++;
        this.players.push({ slot, name: cleanName(m.name) || 'Remador ' + (slot + 1) });
        this.players.sort((a, b) => a.slot - b.slot);
        this.guests.set(slot, conn);
        conn.send({ t: 'welcome', slot });
        this.sendLobby();
        this.emit('change', this);
        return;
      }
      if (m.t === 'ping') conn.send({ t: 'pong', at: m.at });
      else if (m.t === 'state') {
        // pass it on to everyone else, and to this screen's race
        const s = { [slot]: m.s[slot] };
        if (!s[slot]) return;
        for (const [k, c] of this.guests) if (k !== slot) c.send({ t: 'state', rid: m.rid, s });
        this.emit('state', slot, s[slot], m.rid);
      }
    });
    conn.onClose(() => {
      if (slot === null) return;
      this.guests.delete(slot);
      this.players = this.players.filter(p => p.slot !== slot);
      this.broadcast({ t: 'left', slot });
      this.sendLobby();
      this.emit('leave', slot);
      this.emit('change', this);
    });
  }

  // guest: a message from the host
  fromHost(m) {
    switch (m.t) {
      case 'lobby': this.players = m.players; this.info = m.info; this.emit('change', this); break;
      case 'pong': this.rtt = this.rtt ? this.rtt * 0.7 + (now() - m.at) * 0.3 : now() - m.at; break;
      case 'start': this.emit('start', Object.assign({}, m.setup, { lead: this.rtt / 2 })); break;
      case 'state': for (const k in m.s) if (+k !== this.mySlot) this.emit('state', +k, m.s[k], m.rid); break;
      case 'left': this.emit('leave', m.slot); break;
    }
  }

  broadcast(m) { for (const c of this.guests.values()) c.send(m); }
  sendLobby() { this.broadcast({ t: 'lobby', players: this.players, info: this.info }); }

  // host: what the lobby shows about the next race (place and conditions)
  setInfo(info) { this.info = info; if (this.isHost) this.sendLobby(); }

  // host: starts a race for everyone in the room. setup carries what every screen needs to build the
  // same race (track, seed, conditions, roster); each guest's copy adds lead, half the round trip,
  // to catch up with the host's clock.
  start(setup) {
    this.broadcast({ t: 'start', setup });
    this.emit('start', Object.assign({}, setup, { lead: 0 }));
  }

  // Sends this screen's canoes ({ slot: snapshot }) for race rid.
  sendState(rid, s) {
    const m = { t: 'state', rid, s };
    if (this.isHost) this.broadcast(m);
    else if (this.conn) this.conn.send(m);
  }

  close() {
    clearInterval(this.pingTimer);
    for (const c of this.guests.values()) c.close();
    this.guests.clear();
    if (this.conn) { const c = this.conn; this.conn = null; c.close(); }
    if (this.ep) { this.ep.close(); this.ep = null; }
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
export const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14);
