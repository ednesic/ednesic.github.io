// Wires the race simulation to the 3D view, the HUD and the menus, and runs the frame loop.
import { fmt } from './utils.js';
import { STROKES } from './strokes.js';
import { TRACKS } from './tracks/index.js';
import { Race } from './race.js';
import { startStroke, setPlant, float, HULL } from './canoe.js';
import { Sound } from './audio/sound.js';
import { Hud } from './ui/hud.js';
import { setupInput } from './ui/input.js';
import { setupAd } from './ui/ad.js';
import { setupOnline } from './ui/online.js';
import { makeRoster } from './net/sync.js';
import { RIVALS } from './tracks/index.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
// Races roll their conditions. Simular lets the player pick the place, weather, wind and sea
// (or leave each one rolled) and whether rivals come along. ?tempo=sol|nublado|chuva fixes the
// weather of normal races (for testing).
const PICKS = [
  { key: 'place', label: 'Lugar', opts: TRACKS.map(t => [t.id, t.name]) },
  { key: 'weather', label: 'Tempo', opts: [['', 'Sorteado'], ['sol', 'Sol'], ['nublado', 'Nublado'], ['chuva', 'Chuva']] },
  { key: 'wind', label: 'Vento', opts: [['', 'Sorteado'], ['sem', 'Sem vento'], ['fraco', 'Fraco'], ['forte', 'Forte']] },
  { key: 'sea', label: 'Mar', opts: [['', 'Sorteado'], ['liso', 'Liso'], ['calmo', 'Calmo'], ['grande', 'Grande']] },
  { key: 'rivals', label: 'Adversários', opts: [['nao', 'Sozinho'], ['sim', 'Com adversários']] },
];
const picks = { place: TRACKS[0].id, weather: '', wind: '', sea: '', rivals: 'nao' };
try { Object.assign(picks, JSON.parse(localStorage.getItem('vaa3d-picks') || '{}')); } catch (e) {}
const URL_WEATHER = new URLSearchParams(location.search).get('tempo') || undefined;
const URL_ROOM = new URLSearchParams(location.search).get('sala');   // an invite link to an online room
const ROOM_RIVALS = { nao: 'Só a sala', sim: 'Completar com adversários' };
const pickedTrack = () => TRACKS.find(t => t.id === picks.place) || TRACKS[0];

if (!window.THREE) {
  stage.insertAdjacentHTML('beforeend', '<div class="err">Não foi possível carregar o motor 3D. Confira a conexão e recarregue a página.</div>');
} else {
  // the view imports three.js models, so it loads only once the global is there
  // the paddler's body and the canoe models load first so every canoe is built with them (or without, if they fail)
  Promise.all([import('./render/scene.js'), import('./render/human.js').then(h => h.loadHuman()), import('./render/boat.js').then(b => b.loadBoat())])
    .then(([{ View }]) => boot(new View(stage)));
}

function boot(view) {
  const sound = new Sound();
  const hud = new Hud();
  const bests = {};
  try { Object.assign(bests, JSON.parse(localStorage.getItem('vaa3d-bests') || '{}')); } catch (e) {}

  let mode = 'menu';   // menu | race | done
  let track = TRACKS[0];
  let race = null;
  let sim = false;     // this race was set up on the Simular screen
  let online = false; // this race is an online one, with the players of a room
  let lastBump = 0;
  let sendT = 0, listT = 0;
  let quitArmed = 0;

  function onEvent(name, detail) {
    switch (name) {
      case 'count': hud.callout(String(detail)); sound.count(); break;
      case 'go': hud.callout('Imua!', 'reme!'); sound.go(); break;
      case 'huli': hud.callout('Huli!', detail); sound.huli(); break;
      case 'recovered': hud.callout('Desvirou. Imua!'); sound.recovered(); break;
      case 'pearl': hud.callout('Proa enterrou!', 'desceu rápido demais na onda'); sound.pearl(); break;
      case 'crooked': hud.callout('Torta na onda!', 'espeta na ' + (detail < 0 ? 'esquerda (Q)' : 'direita (E)')); break;
      case 'stroke': sound.stroke(detail.side, detail.type); break;
      case 'honu': hud.callout('Honu!', 'desvia da tartaruga'); sound.honu(); break;
      case 'bump':
        // one hit can touch for a few steps; call it out once
        if (performance.now() - lastBump < 900) break;
        lastBump = performance.now();
        if (!detail.hard) hud.callout('Batida!', 'cuidado com as outras canoas');
        sound.bump(detail.speed, detail.hard);
        break;
      case 'wave': hud.callout('Onda chegando!', 'rema forte para pegar'); sound.wave(); break;
      case 'surf': hud.callout('Na onda!', 'agora alivia e surfa'); break;
      case 'tired': hud.callout('Sem fôlego!', 'a remada sai lenta até recuperar'); break;
      case 'finish':
        sound.finish(race.position());
        hud.callout('Chegada!', fmt(detail));
        setTimeout(showResults, 1600);
        break;
    }
  }

  function newRace(t, simMode = false) {
    track = t;
    const opts = simMode
      ? { weather: picks.weather || undefined, wind: picks.wind || undefined, sea: picks.sea || undefined, rivals: picks.rivals === 'sim' }
      : { weather: URL_WEATHER };
    race = new Race(track, Object.assign({ onEvent }, opts));
    view.build(race);
  }

  function startRace(t, simMode = false) {
    sim = simMode; online = false;
    newRace(t, sim);
    begin();
  }

  // An online race: every screen in the room builds the same one from the host's setup.
  function startOnline(s) {
    const room = net.room;
    if (!room) return;
    sim = true; online = true;
    track = TRACKS.find(t => t.id === s.track) || TRACKS[0];
    race = new Race(track, { onEvent, seed: s.seed, weather: s.weather, wind: s.wind, sea: s.sea, roster: s.roster, mySlot: room.mySlot, host: room.isHost });
    view.build(race);
    net.hide();
    begin();
    if (s.lead > 0) race.update(Math.min(0.3, s.lead));   // the host started this long ago
  }

  function begin() {
    sound.init();
    $('simScreen').hidden = true;
    mode = 'race';
    $('startScreen').hidden = true; $('overScreen').hidden = true;
    $('hud').hidden = false; $('controls').hidden = false; $('quit').hidden = false;
    disarmQuit();
    hud.start(race);
    hud.callout(track.name, race.sea.describe().split('. ').slice(0, 2).join(' · '));
    sendT = 0;
  }

  function showMenu() {
    if (net.room) net.leave();
    leaveRace();
    renderTracks();
    $('startScreen').hidden = false;
  }

  function leaveRace() {
    // online, the others see this canoe drop out
    if (online && mode === 'race' && net.room) { race.me.quit = true; net.room.sendState(race.seed, race.localStates()); }
    mode = 'menu'; online = false;
    $('overScreen').hidden = true; $('hud').hidden = true; $('controls').hidden = true; $('quit').hidden = true;
    $('simScreen').hidden = true; net.hide();
    $('callout').style.opacity = 0;
    newRace(track);
  }

  function showOnline(code) {
    const back = online && net.room ? race : null;   // the room's last race, kept for the lobby to show who is still out there
    leaveRace();
    if (back) { race = back; view.build(race); }
    $('startScreen').hidden = true;
    net.open(code);
  }

  // Giving up takes two presses so a stray tap does not end the race.
  function disarmQuit() { quitArmed = 0; $('quit').textContent = 'Desistir'; $('quit').classList.remove('confirm'); }
  function quit() {
    if (mode !== 'race') return;
    if (quitArmed > 0) { if (online && net.room) showOnline(); else showMenu(); return; }
    quitArmed = 3;
    $('quit').textContent = 'Toque de novo para sair';
    $('quit').classList.add('confirm');
  }
  $('quit').addEventListener('click', e => { quit(); e.currentTarget.blur(); });

  function showResults() {
    if (mode !== 'race') return;
    mode = 'done';
    const st = race.standings().sort((a, b) => a.est - b.est);
    const place = st.findIndex(a => a.me) + 1;
    const prev = bests[track.id];
    listT = 0;
    // a simulation's picked conditions do not count toward the track record
    const isBest = !sim && (!prev || race.finishT < prev);
    if (isBest) { bests[track.id] = race.finishT; try { localStorage.setItem('vaa3d-bests', JSON.stringify(bests)); } catch (e) {} }
    $('resTitle').textContent = sim && st.length === 1 ? 'Simulação em ' + track.name
      : place === 1 ? 'Vitória em ' + track.name + '!' : place + 'º lugar em ' + track.name;
    const me = race.me;
    const bits = [
      me.hulis ? me.hulis + ' huli' + (me.hulis > 1 ? 's' : '') : 'nenhum huli',
      me.pearls ? me.pearls + ' proa' + (me.pearls > 1 ? 's' : '') + ' enterrada' + (me.pearls > 1 ? 's' : '') : 'nenhuma proa enterrada',
    ];
    $('resMsg').textContent = 'Tempo de ' + fmt(race.finishT) + ', com ' + bits.join(' e ') + '.';
    renderStandings();
    $('resCond').textContent = 'Condições desta largada: ' + race.sea.describe();
    $('resBest').textContent = online ? 'Corrida online: o tempo não conta para o recorde da pista. Quem ainda está remando aparece com ~ até chegar.'
      : sim ? 'Simulação: o tempo não conta para o recorde da pista.'
      : isBest ? 'Novo recorde seu nesta pista (salvo neste navegador).' : 'Seu recorde nesta pista: ' + fmt(prev);
    $('againBtn').textContent = online ? 'Voltar para a sala' : sim ? 'Simular de novo' : 'Correr de novo';
    $('menuBtn').textContent = online ? 'Sair da sala' : 'Trocar de pista';
    $('overScreen').hidden = false;
    $('hud').hidden = true; $('controls').hidden = true; $('quit').hidden = true;
    $('againBtn').focus();
  }

  // the results list; online it is redrawn as the others cross the line
  function renderStandings() {
    const st = race.standings().sort((a, b) => a.est - b.est);
    const list = $('resList');
    list.innerHTML = '';
    st.forEach((a, i) => {
      const li = document.createElement('li');
      if (a.me) li.className = 'me';
      li.innerHTML = '<span></span><span class="dot"></span><span></span><span></span>';
      li.children[0].textContent = a.out ? '–' : (i + 1) + 'º';
      li.children[1].style.background = a.css;
      li.children[2].textContent = a.name;
      li.children[3].textContent = a.out ? 'saiu' : (a.c.finish === null ? '~' : '') + fmt(a.est);
      list.appendChild(li);
    });
  }

  // box: where the choices go (the Simular screen, or the lobby of an online room)
  function renderPicks(box = $('conds')) {
    const inRoom = box.id === 'onConds';
    box.innerHTML = '';
    for (const p of PICKS) {
      const row = document.createElement('div'); row.className = 'cond';
      const lbl = document.createElement('span'); lbl.textContent = p.label; row.appendChild(lbl);
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', p.label);
      for (const [v, name] of p.opts) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = inRoom && p.key === 'rivals' ? ROOM_RIVALS[v] : name;
        b.setAttribute('aria-pressed', String(picks[p.key] === v));
        b.addEventListener('click', () => {
          picks[p.key] = v;
          try { localStorage.setItem('vaa3d-picks', JSON.stringify(picks)); } catch (e) {}
          if (inRoom) { net.picked(); return; }
          renderPicks(box);
          newRace(pickedTrack(), true);   // the place and sea behind the menu show the new pick
        });
        seg.appendChild(b);
      }
      row.appendChild(seg); box.appendChild(row);
    }
  }

  function renderTracks() {
    const list = $('trackList');
    list.innerHTML = '';
    for (const t of TRACKS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'track';
      const hex = n => '#' + n.toString(16).padStart(6, '0');
      b.style.setProperty('--tbg', 'linear-gradient(160deg, ' + hex(t.colors.deep) + 'ee, ' + hex(t.colors.shallow) + 'aa)');
      b.innerHTML = '<span class="place"></span><span class="where"></span><span class="desc"></span><span class="tags"></span><span class="best"></span>';
      b.querySelector('.place').textContent = t.name;
      b.querySelector('.where').textContent = t.where;
      b.querySelector('.desc').textContent = t.desc;
      const tags = b.querySelector('.tags');
      for (const s of [t.level, t.len + ' m (real: ' + t.realKm + ' km)', 'vento ' + t.wind.kn[0] + '–' + t.wind.kn[1] + ' nós']) {
        const sp = document.createElement('span'); sp.textContent = s; tags.appendChild(sp);
      }
      b.querySelector('.best').textContent = bests[t.id] ? 'Seu recorde: ' + fmt(bests[t.id]) : '';
      b.addEventListener('click', () => startRace(t));
      list.appendChild(b);
    }
  }
  $('againBtn').addEventListener('click', () => { if (online) showOnline(); else startRace(track, sim); });
  function showSim() {
    $('startScreen').hidden = true;
    renderPicks();
    $('simScreen').hidden = false;
    newRace(pickedTrack(), true);
    $('simGo').focus();
  }
  $('simBtn').addEventListener('click', showSim);
  setupAd($('adBox'));
  $('simGo').addEventListener('click', () => startRace(pickedTrack(), true));
  $('simBack').addEventListener('click', showMenu);
  window.addEventListener('keydown', e => {
    if (mode !== 'menu' || $('simScreen').hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); startRace(pickedTrack(), true); }
    else if (e.key === 'Escape') showMenu();
  });
  $('menuBtn').addEventListener('click', showMenu);

  const pickedInfo = () => {
    const name = (key, v) => PICKS.find(p => p.key === key).opts.find(o => o[0] === v)[1];
    return [pickedTrack().name].concat(['weather', 'wind', 'sea'].map(k => picks[k] ? name(k, picks[k]) : null).filter(Boolean),
      picks.rivals === 'sim' ? 'com adversários' : []).join(' · ');
  };
  const net = setupOnline({
    renderPicks,
    info: pickedInfo,
    setup: players => ({
      track: pickedTrack().id, seed: Math.floor(Math.random() * 2 ** 31),
      weather: picks.weather || undefined, wind: picks.wind || undefined, sea: picks.sea || undefined,
      roster: makeRoster(players, picks.rivals === 'sim'),
    }),
    color: slot => slot ? RIVALS[slot - 1].css : '#c2462c',
    // how a player is doing in the room's last race, for the lobby
    status: slot => {
      const c = race && race.online && race.rivals.find(r => r.slot === slot && r.human);
      if (!c) return '';
      return c.finish !== null ? 'chegou em ' + fmt(c.finish) : c.quit ? 'saiu da corrida' : 'remando';
    },
    start: startOnline,
    state: (slot, snap, rid) => { if (race && race.online && rid === race.seed) race.receive(slot, snap); },
    leave: (slot, who) => {
      if (race && race.online) race.drop(slot);
      if (mode === 'race' && who) hud.callout(who + ' saiu da sala');
    },
    hostGone: () => { if (mode === 'race') hud.callout('A sala fechou', 'quem criou saiu; termine a corrida'); },
    back: showMenu,
  });
  $('onlineBtn').addEventListener('click', () => showOnline());
  // the sound starts on the first touch or key anywhere (browsers need a gesture), the sea already on the menu
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sound.init());
  $('mute').textContent = sound.muted ? 'Som: desligado' : 'Som: ligado';
  // a soft tick for the menus' buttons (not the paddle buttons)
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.closest('#controls')) sound.click(); });
  $('mute').addEventListener('click', e => {
    sound.setMuted(!sound.muted);
    e.currentTarget.textContent = sound.muted ? 'Som: desligado' : 'Som: ligado';
    e.currentTarget.blur();
  });

  const input = setupInput({
    onStroke(side, type) {
      if (mode !== 'race') return null;
      if (race.count > 0 || race.finishT !== null) return false;
      const ok = startStroke(race.me, side, type, race.t);
      if (ok === true) sound.stroke(side, race.me.stroke.type);   // tired, a forte comes out softer
      return ok;
    },
    onQuit: quit,
  });

  renderPicks();
  renderTracks();
  newRace(track);
  if (URL_ROOM) showOnline(URL_ROOM);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === 'race') {
      // espetada follows whatever plant button or key is held
      const want = race.count > 0 ? 0 : input.plantWanted();
      if (race.me.plant !== want) setPlant(race.me, want);
      race.update(dt);
      hud.update(race);
      if (quitArmed > 0 && (quitArmed -= dt) <= 0) disarmQuit();
    } else if (mode === 'done') {
      race.coast(dt);
      if (online && (listT += dt) > 1) { listT = 0; renderStandings(); }
    } else { race.t += dt; float(race.me, race.sea, race.t); }
    // online: this screen's canoes go out to the others about 15 times a second
    if (online && mode !== 'menu' && net.room && (sendT -= dt) <= 0) { sendT = 1 / 15; net.room.sendState(race.seed, race.localStates()); }
    if (mode === 'menu' && net.room && (listT += dt) > 1) { listT = 0; net.refresh(); }
    input.showPlant(mode === 'race' ? race.me.plant : 0);
    hud.tick(dt);
    sound.update(dt, race, mode);
    view.render(dt, mode);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // hook for automated checks in a browser
  window.__vaa = { get race() { return race; }, get mode() { return mode; }, view, sound, TRACKS, startRace, STROKES, HULL };
}
