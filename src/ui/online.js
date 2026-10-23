// The online screen: pick a name, create a room or join one by its code, then the room's lobby,
// where the host sets up the race and starts it for everyone.
import { Room, cleanCode, cleanName, MAX_PLAYERS } from '../net/room.js';
import { peerNet } from '../net/peer.js';

const $ = id => document.getElementById(id);

const WHY = {
  missing: code => 'Não achei a sala ' + code + '. Confira o código, ou se quem criou ainda está com ela aberta.',
  refused: (code, e) => e.message === 'full' ? 'A sala ' + code + ' está cheia (' + MAX_PLAYERS + ' remadores).' : 'A sala é de outra versão do jogo. Recarreguem a página.',
  browser: () => 'Este navegador não consegue jogar online.',
  network: () => 'Não deu para conectar. Confira a internet e tente de novo.',
};

// hooks: renderPicks(box) draws the host's race options, info() describes them, setup() returns
// what a new race needs (without the roster), status(slot) says how that player is doing in the
// current race (or ''), start(setup), state(slot, snap, rid), leave(slot, name), hostGone(), back()
export function setupOnline(hooks) {
  let room = null;
  const status = msg => { $('onStatus').textContent = msg || ''; };
  try { $('onName').value = localStorage.getItem('vaa3d-name') || ''; } catch (e) {}

  const name = () => {
    const n = cleanName($('onName').value);
    try { localStorage.setItem('vaa3d-name', n); } catch (e) {}
    return n || 'Remador';
  };

  function newRoom() {
    return new Room(peerNet, name(), {
      change: () => renderLobby(),
      start: s => hooks.start(s),
      state: (slot, snap, rid) => hooks.state(slot, snap, rid),
      leave: slot => {
        const p = room && room.players.find(q => q.slot === slot);
        hooks.leave(slot, p ? p.name : '');
      },
      closed: () => {
        room = null;
        showEntry();
        status('A sala fechou: quem criou saiu.');
        hooks.hostGone();
      },
    });
  }

  function busy(on) { for (const id of ['onCreate', 'onJoin']) $(id).disabled = on; }

  async function create() {
    busy(true); status('Abrindo a sala…');
    const r = newRoom();
    try {
      await r.create();
      room = r;
      room.setInfo(hooks.info());
      status('');
      showLobby();
    } catch (e) {
      r.close();
      status((WHY[e.type] || WHY.network)(''));
    }
    busy(false);
  }

  async function join() {
    const code = cleanCode($('onCode').value);
    if (code.length !== 4) { status('O código tem 4 letras.'); $('onCode').focus(); return; }
    busy(true); status('Procurando a sala ' + code + '…');
    const r = newRoom();
    try {
      await r.join(code);
      room = r;
      status('');
      showLobby();
    } catch (e) {
      r.close();
      status((WHY[e.type] || WHY.network)(code, e));
    }
    busy(false);
  }

  function showEntry() {
    $('onLobby').hidden = true; $('onEntry').hidden = false;
    $('onBack').textContent = 'Voltar';
  }

  function showLobby() {
    $('onEntry').hidden = true; $('onLobby').hidden = false;
    $('onBack').textContent = 'Sair da sala';
    renderLobby();
  }

  function renderLobby() {
    if (!room || $('onLobby').hidden) return;
    $('onRoomCode').textContent = room.code;
    const list = $('onPlayers');
    list.innerHTML = '';
    for (const p of room.players) {
      const li = document.createElement('li');
      if (p.slot === room.mySlot) li.className = 'me';
      li.innerHTML = '<span></span><span class="dot"></span><span></span><span></span>';
      li.children[0].textContent = p.slot === 0 ? '★' : '';
      li.children[1].style.background = hooks.color(p.slot);
      li.children[2].textContent = p.name + (p.slot === room.mySlot ? ' (você)' : '');
      li.children[3].textContent = p.slot === room.mySlot ? '' : hooks.status(p.slot);
      list.appendChild(li);
    }
    $('onConds').hidden = !room.isHost;
    $('onGo').hidden = !room.isHost;
    if (room.isHost) {
      hooks.renderPicks($('onConds'));
      const racing = room.players.some(p => p.slot !== room.mySlot && hooks.status(p.slot) === 'remando');
      $('onGo').textContent = racing ? 'Largar mesmo assim' : 'Largar';
      $('onInfo').textContent = room.players.length < 2
        ? 'Passe o código ou o convite para os amigos entrarem. Dá para largar sozinho também.'
        : racing ? 'Ainda tem gente remando a corrida anterior.' : 'Todos prontos? Largue quando quiser.';
    } else {
      const host = room.players.find(p => p.slot === 0);
      $('onInfo').textContent = (room.info ? room.info + '. ' : '') + 'Esperando ' + (host ? host.name : 'quem criou a sala') + ' largar.';
    }
  }

  function go() {
    if (!room || !room.isHost) return;
    room.start(hooks.setup(room.players));
  }

  async function share() {
    const url = location.origin + location.pathname + '?sala=' + room.code;
    const text = "Bora remar? Sala " + room.code + " no Va'a: " + url;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); status('Convite copiado.'); }
    } catch (e) { status('Código da sala: ' + room.code); }
  }

  function leave() {
    if (room) { room.close(); room = null; }
    showEntry();
  }

  $('onCreate').addEventListener('click', create);
  $('onJoin').addEventListener('click', join);
  $('onCode').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('onGo').addEventListener('click', go);
  $('onShare').addEventListener('click', share);
  $('onBack').addEventListener('click', () => {
    if (room) { leave(); status(''); } else hooks.back();
  });

  return {
    get room() { return room; },
    // shows the screen: the lobby when in a room, otherwise the entry (with a code from an invite)
    open(code) {
      $('onlineScreen').hidden = false;
      if (room) showLobby();
      else {
        showEntry();
        if (code) { $('onCode').value = cleanCode(code); status('Você foi convidado para a sala ' + cleanCode(code) + '. Escolha um nome e entre.'); }
        ($('onName').value ? (code ? $('onJoin') : $('onCreate')) : $('onName')).focus();
      }
    },
    hide() { $('onlineScreen').hidden = true; },
    picked() { if (room && room.isHost) room.setInfo(hooks.info()); renderLobby(); },
    refresh: renderLobby,
    leave,
  };
}
