// Wires the race simulation to the 3D view, the HUD and the menus, and runs the frame loop.
import { fmt } from './utils.js';
import { STROKES } from './strokes.js';
import { TRACKS } from './tracks/index.js';
import { Race } from './race.js';
import { startStroke, setPlant, float, HULL } from './canoe.js';
import { Sound } from './audio.js';
import { Hud } from './ui/hud.js';
import { setupInput } from './ui/input.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
// The start screen lets the player fix the weather, wind and sea, or leave each one rolled.
// ?tempo=sol|nublado|chuva picks the weather too (for testing).
const PICKS = [
  { key: 'weather', label: 'Tempo', opts: [['', 'Sorteado'], ['sol', 'Sol'], ['nublado', 'Nublado'], ['chuva', 'Chuva']] },
  { key: 'wind', label: 'Vento', opts: [['', 'Sorteado'], ['sem', 'Sem vento'], ['fraco', 'Fraco'], ['forte', 'Forte']] },
  { key: 'sea', label: 'Mar', opts: [['', 'Sorteado'], ['liso', 'Liso'], ['calmo', 'Calmo'], ['grande', 'Grande']] },
];
const picks = { weather: '', wind: '', sea: '' };
try { Object.assign(picks, JSON.parse(localStorage.getItem('vaa3d-picks') || '{}')); } catch (e) {}
const urlWeather = new URLSearchParams(location.search).get('tempo');
if (urlWeather) picks.weather = urlWeather;

if (!window.THREE) {
  stage.insertAdjacentHTML('beforeend', '<div class="err">Não foi possível carregar o motor 3D. Confira a conexão e recarregue a página.</div>');
} else {
  // the view imports three.js models, so it loads only once the global is there
  // the paddler's body model loads first so every canoe is built with it (or without, if it fails)
  Promise.all([import('./render/scene.js'), import('./render/human.js').then(h => h.loadHuman())])
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
  let quitArmed = 0;

  const splash = (side, type) => sound.splash(side, type === 'forte' ? 1 : type === 'longa' ? 0.3 : 0.6);
  function onEvent(name, detail) {
    switch (name) {
      case 'count': hud.callout(String(detail)); sound.tone(520, 500, 0.15, 0.25); break;
      case 'go': hud.callout('Imua!', 'reme!'); sound.tone(880, 860, 0.35, 0.3); break;
      case 'huli': hud.callout('Huli!', detail); sound.tone(140, 50, 0.4, 0.4); break;
      case 'recovered': hud.callout('Desvirou. Imua!'); break;
      case 'pearl': hud.callout('Proa enterrou!', 'desceu rápido demais na onda'); break;
      case 'crooked': hud.callout('Torta na onda!', 'espeta na ' + (detail < 0 ? 'esquerda (Q)' : 'direita (E)')); break;
      case 'stroke': splash(detail.side, detail.type); break;
      case 'honu': hud.callout('Honu!', 'desvia da tartaruga'); break;
      case 'wave': hud.callout('Onda chegando!', 'rema forte para pegar'); break;
      case 'surf': hud.callout('Na onda!', 'agora alivia e surfa'); break;
      case 'tired': hud.callout('Sem fôlego!', 'use a remada longa'); break;
      case 'finish':
        sound.tone(660, 990, 0.5, 0.3);
        hud.callout('Chegada!', fmt(detail));
        setTimeout(showResults, 1600);
        break;
    }
  }

  function newRace(t) {
    track = t;
    race = new Race(track, { onEvent, weather: picks.weather || undefined, wind: picks.wind || undefined, sea: picks.sea || undefined });
    view.build(race);
  }

  function startRace(t) {
    sound.init();
    newRace(t);
    mode = 'race';
    $('startScreen').hidden = true; $('overScreen').hidden = true;
    $('hud').hidden = false; $('controls').hidden = false; $('quit').hidden = false;
    disarmQuit();
    hud.start(race);
    hud.callout(track.name, race.sea.describe().split('. ').slice(0, 2).join(' · '));
  }

  function showMenu() {
    mode = 'menu';
    $('overScreen').hidden = true; $('hud').hidden = true; $('controls').hidden = true; $('quit').hidden = true;
    $('callout').style.opacity = 0;
    renderTracks();
    $('startScreen').hidden = false;
    newRace(track);
  }

  // Giving up takes two presses so a stray tap does not end the race.
  function disarmQuit() { quitArmed = 0; $('quit').textContent = 'Desistir'; $('quit').classList.remove('confirm'); }
  function quit() {
    if (mode !== 'race') return;
    if (quitArmed > 0) { showMenu(); return; }
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
    const isBest = !prev || race.finishT < prev;
    if (isBest) { bests[track.id] = race.finishT; try { localStorage.setItem('vaa3d-bests', JSON.stringify(bests)); } catch (e) {} }
    $('resTitle').textContent = place === 1 ? 'Vitória em ' + track.name + '!' : place + 'º lugar em ' + track.name;
    const me = race.me;
    const bits = [
      me.hulis ? me.hulis + ' huli' + (me.hulis > 1 ? 's' : '') : 'nenhum huli',
      me.pearls ? me.pearls + ' proa' + (me.pearls > 1 ? 's' : '') + ' enterrada' + (me.pearls > 1 ? 's' : '') : 'nenhuma proa enterrada',
    ];
    $('resMsg').textContent = 'Tempo de ' + fmt(race.finishT) + ', com ' + bits.join(' e ') + '.';
    const list = $('resList');
    list.innerHTML = '';
    st.forEach((a, i) => {
      const li = document.createElement('li');
      if (a.me) li.className = 'me';
      li.innerHTML = '<span></span><span class="dot"></span><span></span><span></span>';
      li.children[0].textContent = (i + 1) + 'º';
      li.children[1].style.background = a.css;
      li.children[2].textContent = a.name;
      li.children[3].textContent = (a.c.finish === null ? '~' : '') + fmt(a.est);
      list.appendChild(li);
    });
    $('resCond').textContent = 'Condições desta largada: ' + race.sea.describe();
    $('resBest').textContent = isBest ? 'Novo recorde seu nesta pista (salvo neste navegador).' : 'Seu recorde nesta pista: ' + fmt(prev);
    $('overScreen').hidden = false;
    $('hud').hidden = true; $('controls').hidden = true; $('quit').hidden = true;
    $('againBtn').focus();
  }

  function renderPicks() {
    const box = $('conds');
    box.innerHTML = '';
    for (const p of PICKS) {
      const row = document.createElement('div'); row.className = 'cond';
      const lbl = document.createElement('span'); lbl.textContent = p.label; row.appendChild(lbl);
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', p.label);
      for (const [v, name] of p.opts) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = name;
        b.setAttribute('aria-pressed', String(picks[p.key] === v));
        b.addEventListener('click', () => {
          picks[p.key] = v;
          try { localStorage.setItem('vaa3d-picks', JSON.stringify(picks)); } catch (e) {}
          renderPicks();
          newRace(track);   // the sea behind the menu shows the new pick
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
  $('againBtn').addEventListener('click', () => startRace(track));
  $('menuBtn').addEventListener('click', showMenu);
  $('mute').addEventListener('click', e => {
    sound.muted = !sound.muted;
    e.currentTarget.textContent = sound.muted ? 'Som: desligado' : 'Som: ligado';
    e.currentTarget.blur();
  });

  const input = setupInput({
    onStroke(side, type) {
      if (mode !== 'race') return null;
      if (race.count > 0 || race.finishT !== null) return false;
      const ok = startStroke(race.me, side, type, race.t);
      if (ok === true) splash(side, type);
      return ok;
    },
    onQuit: quit,
  });

  renderPicks();
  renderTracks();
  newRace(track);
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
    } else if (mode === 'done') race.coast(dt);
    else { race.t += dt; float(race.me, race.sea, race.t); }
    input.showPlant(mode === 'race' ? race.me.plant : 0);
    hud.tick(dt);
    view.render(dt, mode);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // hook for automated checks in a browser
  window.__vaa = { get race() { return race; }, get mode() { return mode; }, view, TRACKS, startRace, STROKES, HULL };
}
