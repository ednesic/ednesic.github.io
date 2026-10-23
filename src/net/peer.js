// Links browsers with WebRTC through PeerJS. PeerJS's free public server only introduces the two
// browsers (and relays through its TURN server when a network blocks a direct link); the race
// itself goes straight from one browser to the other. The library loads only when someone opens
// the online screen. Implements the `net` that Room expects.
const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const TIMEOUT = 12000;

let loading = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(Object.assign(new Error('peerjs'), { type: 'network' })); };
      document.head.append(s);
    });
  }
  return loading;
}

const fail = (type, msg) => Object.assign(new Error(msg || type), { type });
const kind = t => t === 'unavailable-id' ? 'taken' : t === 'peer-unavailable' ? 'missing' : t === 'browser-incompatible' ? 'browser' : 'network';

function wrap(dc) {
  return {
    send: m => { if (dc.open) dc.send(m); },
    onData: cb => dc.on('data', cb),
    onClose: cb => { let done = false; const once = () => { if (!done) { done = true; cb(); } }; dc.on('close', once); dc.on('error', once); },
    close: () => dc.close(),
  };
}

export const peerNet = {
  // id null: any free id (a guest)
  async open(id) {
    await loadPeerJs();
    const peer = id ? new window.Peer(id) : new window.Peer();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { peer.destroy(); reject(fail('network', 'timeout')); }, TIMEOUT);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('error', e => { clearTimeout(timer); peer.destroy(); reject(fail(kind(e.type), e.message)); });
    });
    let pending = null;   // a connect() waiting to hear if the other id exists
    peer.removeAllListeners('error');
    peer.on('error', e => { if (pending) pending(fail(kind(e.type), e.message)); });
    // the link to the public server can drop while the room is open; get it back so others can still join
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    return {
      onConnection: cb => peer.on('connection', dc => dc.on('open', () => cb(wrap(dc)))),
      connect: target => new Promise((resolve, reject) => {
        const dc = peer.connect(target, { reliable: true });
        const timer = setTimeout(() => { pending = null; dc.close(); reject(fail('missing', 'timeout')); }, TIMEOUT);
        pending = e => { clearTimeout(timer); pending = null; reject(e); };
        dc.on('open', () => { clearTimeout(timer); pending = null; resolve(wrap(dc)); });
      }),
      close: () => peer.destroy(),
    };
  },
};
