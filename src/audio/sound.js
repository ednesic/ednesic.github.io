// The game's sound, all synthesised with Web Audio (no files to load): a soundscape of sea, wind,
// hull and rain that follows the race (see mix.js), and one-shot sounds for strokes, espetadas,
// bumps, huli, the start and the finish. Starts on the first tap or key (browsers need a gesture).
import { STROKES } from '../strokes.js';
import { clamp } from '../utils.js';
import { listen, mix } from './mix.js';

// how hard each stroke type hits the water
const STRENGTH = { forte: 1, media: 0.7, longa: 0.45, diagonal: 0.6 };
// rivals closer than this (m) can be heard paddling
const HEAR_M = 35;
const MUTE_KEY = 'vaa3d-mute';
const LOUD = 1.8;   // master level; the compressor after it keeps the loud moments from clipping
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
    this.heard = new Map();   // rival canoe -> the last stroke heard from it
    this.plant = 0; this.breathT = 0; this.breathIn = false; this.gullT = 4; this.breakT = 3; this.dropAcc = 0;
  }

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      if (!this.ctx) return;
      this.build();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : LOUD, this.ctx.currentTime, 0.05);
  }

  // master <- muffle (lowpass for under the canoe) <- sfx and ambience; a short reverb on a send
  build() {
    const a = this.ctx;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(a.destination);
    this.master = a.createGain(); this.master.gain.value = this.muted ? 0 : LOUD; this.master.connect(comp);
    this.muffle = a.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.7;
    this.muffle.connect(this.master);
    this.sfx = a.createGain(); this.sfx.connect(this.muffle);
    this.amb = a.createGain(); this.amb.gain.value = 0; this.amb.connect(this.muffle);
    this.verb = a.createConvolver(); this.verb.buffer = this.impulse(1.6);
    const wet = a.createGain(); wet.gain.value = 0.5; this.verb.connect(wet); wet.connect(this.muffle);

    this.noise = { white: this.noiseBuf('white'), pink: this.noiseBuf('pink'), brown: this.noiseBuf('brown') };
    this.layers = {
      sea: this.loop('brown', 'lowpass', 500, 0.5),
      lap: this.loop('pink', 'bandpass', 1200, 1.4),
      rush: this.loop('white', 'bandpass', 1500, 0.7),
      roar: this.loop('brown', 'lowpass', 200, 0.8),
      wind: this.loop('pink', 'bandpass', 500, 0.8, true),
      whistle: this.loop('white', 'bandpass', 1100, 9, true),
      rain: this.loop('white', 'highpass', 3500, 0.5),
      plant: this.loop('pink', 'bandpass', 900, 2, true),
      shore: this.loop('brown', 'lowpass', 650, 0.5),
    };
    // the lapping comes in little irregular slaps, not a steady hiss
    const lfo = a.createOscillator(), depth = a.createGain();
    lfo.frequency.value = 2.3; depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(this.layers.lap.mod.gain); lfo.start();
    const gurgle = a.createOscillator(), gd = a.createGain();
    gurgle.type = 'square'; gurgle.frequency.value = 9; gd.gain.value = 0.35;
    gurgle.connect(gd); gd.connect(this.layers.plant.mod.gain); gurgle.start();
  }

  // a stereo noise buffer, a few seconds long, that loops without a click
  noiseBuf(kind) {
    const a = this.ctx, n = Math.floor(a.sampleRate * 4);
    const buf = a.createBuffer(2, n, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      }
      // fade the seam so the loop does not tick
      const f = Math.floor(a.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
    }
    return buf;
  }

  impulse(sec) {
    const a = this.ctx, n = Math.floor(a.sampleRate * sec), buf = a.createBuffer(2, n, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4) * 0.4;
    }
    return buf;
  }

  // A looping noise layer: source -> filter -> mod (wobble) -> gain (level) -> pan -> ambience bus.
  loop(kind, type, freq, Q, panned) {
    const a = this.ctx;
    const src = a.createBufferSource(); src.buffer = this.noise[kind]; src.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
    const mod = a.createGain(), g = a.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(mod); mod.connect(g);
    let p = null;
    if (panned && a.createStereoPanner) { p = a.createStereoPanner(); g.connect(p); p.connect(this.amb); } else g.connect(this.amb);
    src.start(0, Math.random() * 3);
    return { f, mod, g, p };
  }

  // Follows the race every frame: the ambience levels, and the sounds that come from state
  // rather than from events (espetada, breathing, creaks, gulls, rain drops, rivals paddling).
  update(dt, race, mode) {
    const a = this.ctx;
    if (!a || a.state !== 'running' || !race) return;
    const s = listen(race, mode), m = mix(s), now = a.currentTime, L = this.layers;
    const set = (param, v, tc = 0.12) => param.setTargetAtTime(v, now, tc);
    for (const k of Object.keys(L)) {
      set(L[k].g.gain, m[k].gain);
      if (m[k].freq) set(L[k].f.frequency, m[k].freq);
      if (L[k].p && m[k].pan !== undefined) set(L[k].p.pan, m[k].pan);
    }
    set(L.whistle.f.frequency, m.whistle.freq * (1 + 0.08 * Math.sin(race.t * 0.7)), 0.3);
    set(this.amb.gain, m.amb, 0.6);
    set(this.muffle.frequency, m.muffle, s.huli ? 0.05 : 0.4);

    if (s.plant !== this.plant) { if (s.plant) this.plantIn(s.plant, s.speed); else this.plantOut(this.plant); this.plant = s.plant; }

    if (m.breath && (this.breathT -= dt) <= 0) {
      this.breathIn = !this.breathIn;
      this.breathT = m.breath * (this.breathIn ? 0.45 : 0.55);
      this.breath(this.breathIn, m.breathGain);
    }
    if (Math.random() < m.creak * dt) this.creak();

    if ((this.gullT -= dt) <= 0) {
      this.gullT = rnd(6, 16) * (s.place === 'kaiwi' ? 2.5 : 1);
      if (mode !== 'menu' || Math.random() < 0.5) this.gull();
    }
    if (m.shore.gain > 0.02 && (this.breakT -= dt) <= 0) {
      this.breakT = (race.sea.cond.period || 8) * rnd(0.8, 1.3);
      this.breakWave(m.shore.gain);
    }
    if (s.rain) {
      this.dropAcc += dt * 14;
      while (this.dropAcc >= 1) { this.dropAcc--; this.drop(); }
    }
    if (mode !== 'menu') this.rivals(race);
  }

  // rivals' strokes, quieter with distance and panned to where they are
  rivals(race) {
    const me = race.me, rx = Math.cos(me.psi), ry = -Math.sin(me.psi);
    for (const r of race.rivals) {
      const last = this.heard.get(r);
      this.heard.set(r, r.lastStroke);
      if (last === undefined || last === r.lastStroke || !r.stroke) continue;
      const dx = r.x - me.x, dy = r.y - me.y, d = Math.hypot(dx, dy);
      if (d > HEAR_M) continue;
      const vol = Math.pow(1 - d / HEAR_M, 2) * 0.6;
      this.stroke(r.stroke.side, r.stroke.type, { vol, pan: clamp((dx * rx + dy * ry) / 12, -1, 1), lite: true });
    }
  }

  // --- building blocks -------------------------------------------------------------------------

  // where a one-shot goes: panned into the sfx bus, with some of it sent to the reverb
  out(pan = 0, send = 0.15) {
    const a = this.ctx, g = a.createGain();
    let node = g;
    if (a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(this.sfx);
    if (send > 0) { const s = a.createGain(); s.gain.value = send; node.connect(s); s.connect(this.verb); }
    return g;
  }

  // a burst of filtered noise; the filter can sweep from f0 to f1
  hit({ kind = 'white', type = 'bandpass', f0 = 1000, f1 = f0, Q = 1, dur = 0.2, attack = 0.005, gain = 0.2, pan = 0, at = 0, send = 0.15, curve = 2 }) {
    const a = this.ctx, t0 = a.currentTime + at;
    gain = Math.max(gain, 0.0002); attack = Math.min(attack, dur * 0.9);
    const src = a.createBufferSource(); src.buffer = this.noise[kind];
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = Q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    // curve > 1 drops quickly then trails off, like water settling
    g.gain.setTargetAtTime(0.0001, t0 + attack, (dur - attack) / (curve + 1));
    src.connect(f); f.connect(g); g.connect(this.out(pan, send));
    src.start(t0, Math.random() * 3); src.stop(t0 + dur * 1.5 + 0.1);
  }

  // a tone gliding from f0 to f1
  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, attack = 0.005, gain = 0.2, pan = 0, at = 0, send = 0.15 }) {
    const a = this.ctx, t0 = a.currentTime + at;
    gain = Math.max(gain, 0.0002);
    const o = a.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.out(pan, send));
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // an air bubble ringing as it breaks free: a short tone that rises (the Minnaert resonance)
  bubble(f, gain, pan, at = 0) {
    this.tone({ f0: f, f1: f * rnd(1.5, 2.2), dur: rnd(0.025, 0.06), gain, pan, at, send: 0.25 });
  }

  bubbles(n, lo, hi, gain, pan, at, spread) {
    for (let i = 0; i < n; i++) this.bubble(rnd(lo, hi), gain * rnd(0.5, 1), pan + rnd(-0.15, 0.15), at + Math.random() * spread);
  }

  ready() { return this.ctx && this.ctx.state === 'running'; }

  // --- sounds ----------------------------------------------------------------------------------

  // A paddle stroke: the catch (blade entering), the pull past the hip and the exit with its drips.
  // A diagonal sweeps wide out from the hull. opts: { vol, pan, lite } for rivals.
  stroke(side, type, { vol = 1, pan = side * 0.55, lite = false } = {}) {
    if (!this.ready()) return;
    const P = STROKES[type] || STROKES.media, s = (STRENGTH[type] || 0.7) * vol;
    // the catch: a quick slap and the hollow plunk of the blade burying itself
    this.hit({ f0: 2600 + 800 * s, f1: 1100, Q: 0.9, dur: 0.13, gain: 0.16 * s + 0.02 * vol, pan });
    this.tone({ f0: rnd(150, 190), f1: 60, dur: 0.1, gain: 0.22 * s, pan, attack: 0.004, send: 0.05 });
    // the pull: water rushing over the blade, following the stroke's force curve
    const diag = type === 'diagonal';
    this.hit({ kind: 'pink', f0: diag ? 1300 : 950, f1: diag ? 350 : 420, Q: 1.1, dur: P.dur, attack: P.dur * 0.3,
      gain: 0.14 * s, pan: diag ? pan * 1.3 : pan, curve: 1, send: 0.1 });
    if (lite) return;
    this.bubbles(diag ? 4 : 3, 450, 1100, 0.05 * s, pan, 0.02, 0.1);
    // the exit: the blade flicks out and drips back into the sea
    this.hit({ f0: 4200, f1: 2500, Q: 0.7, dur: 0.09, gain: 0.05 * s, pan, at: P.dur });
    this.bubbles(4, 1300, 2600, 0.025 * vol, pan, P.dur + 0.06, 0.45);
  }

  // espetada: the blade is driven in and held (its hiss is a loop, see update)
  plantIn(side, speed) {
    const pan = side * 0.55, s = 0.6 + 0.4 * clamp(speed / 6, 0, 1);
    this.hit({ kind: 'pink', type: 'lowpass', f0: 1800, f1: 500, dur: 0.3, gain: 0.22 * s, pan });
    this.tone({ f0: 120, f1: 55, dur: 0.16, gain: 0.2 * s, pan, send: 0.05 });
    this.bubbles(5, 300, 800, 0.05, pan, 0.03, 0.25);
  }

  plantOut(side) {
    if (!this.ready()) return;
    this.hit({ f0: 3500, f1: 2000, dur: 0.1, gain: 0.05, pan: side * 0.55 });
    this.bubbles(3, 1200, 2200, 0.025, side * 0.55, 0.05, 0.3);
  }

  // hulls knocking: hollow wood with a click, harder for a hard hit
  bump(speed = 1, hard = false) {
    if (!this.ready()) return;
    const v = clamp(0.35 + speed * 0.25, 0.35, 1) * (hard ? 1.3 : 1);
    this.hit({ f0: 1900, Q: 2, dur: 0.035, gain: 0.25 * v, pan: rnd(-0.3, 0.3) });
    [[175, 0.3, 0.28], [395, 0.16, 0.16], [720, 0.08, 0.09]].forEach(([f, d, g]) =>
      this.tone({ type: 'triangle', f0: f * rnd(0.95, 1.05), f1: f * 0.92, dur: d, gain: g * v, send: 0.1 }));
    this.hit({ kind: 'pink', f0: 1400, f1: 600, dur: 0.35, gain: 0.08 * v });
    if (hard) this.hit({ f0: 3000, f1: 1200, Q: 3, dur: 0.12, gain: 0.12, at: 0.02 });
  }

  // huli: a big splash as the ama goes over, then the world goes dull under the canoe
  huli() {
    if (!this.ready()) return;
    this.hit({ type: 'lowpass', f0: 5000, f1: 500, dur: 1.2, attack: 0.02, gain: 0.45, curve: 1.5 });
    this.tone({ f0: 95, f1: 38, dur: 0.6, gain: 0.35, send: 0.05 });
    this.bubbles(14, 250, 700, 0.07, 0, 0.15, 1.2);
  }

  recovered() {
    if (!this.ready()) return;
    this.hit({ kind: 'pink', type: 'lowpass', f0: 2500, f1: 700, dur: 0.6, gain: 0.2 });
    this.bubbles(6, 900, 2200, 0.03, 0, 0.1, 0.6);
  }

  // the bow buried in the back of the wave ahead
  pearl() {
    if (!this.ready()) return;
    this.hit({ f0: 1500, f1: 400, Q: 0.6, dur: 0.8, attack: 0.03, gain: 0.35, curve: 1.2 });
    this.hit({ kind: 'brown', type: 'lowpass', f0: 600, f1: 150, dur: 0.9, attack: 0.05, gain: 0.4 });
    this.bubbles(8, 300, 900, 0.05, 0, 0.1, 0.6);
  }

  // a sea turtle surfacing to breathe nearby
  honu() {
    if (!this.ready()) return;
    const pan = rnd(-0.6, 0.6);
    this.hit({ f0: 1800, f1: 900, Q: 0.8, dur: 0.35, attack: 0.03, gain: 0.08, pan, send: 0.3 });
  }

  // a wave rising behind the canoe
  wave() {
    if (!this.ready()) return;
    this.hit({ kind: 'pink', type: 'lowpass', f0: 300, f1: 2400, dur: 1.5, attack: 1.0, gain: 0.16, curve: 0.5, send: 0.2 });
  }

  // the countdown: knocks on the canoe's wood, like a starter tapping the hull
  count() {
    if (!this.ready()) return;
    this.tone({ f0: 1150, f1: 1100, dur: 0.09, gain: 0.18, send: 0.3 });
    this.tone({ f0: 2550, f1: 2500, dur: 0.05, gain: 0.07, send: 0.3 });
  }

  // a pū (conch shell trumpet): a buzzy note through the shell's hollow resonances
  conch(dur = 1.3, gain = 0.22, at = 0) {
    if (!this.ready()) return;
    const a = this.ctx, t0 = a.currentTime + at, f = 196;
    const out = this.out(0, 0.6);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.1;
    const pk = a.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1300; pk.Q.value = 2; pk.gain.value = 8;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.14);
    g.gain.setValueAtTime(gain, t0 + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    bp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(out);
    const vib = a.createOscillator(), vd = a.createGain();
    vib.frequency.value = 5.2; vd.gain.value = 2.2; vib.connect(vd);
    for (const [mult, lvl] of [[1, 1], [2.004, 0.35]]) {
      const o = a.createOscillator(), og = a.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * mult * 0.9, t0);
      o.frequency.exponentialRampToValueAtTime(f * mult, t0 + 0.16);
      vd.connect(o.frequency); og.gain.value = lvl;
      o.connect(og); og.connect(bp); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    vib.start(t0); vib.stop(t0 + dur + 0.05);
  }

  go() { this.conch(1.4, 0.24); }

  // the finish: the conch and people cheering on the shore (more for a win)
  finish(place = 1) {
    if (!this.ready()) return;
    this.conch(1.8, 0.22);
    const n = place === 1 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      this.hit({ kind: 'pink', f0: rnd(700, 2200), f1: rnd(600, 1800), Q: 1.5, dur: rnd(1.6, 2.6), attack: rnd(0.15, 0.4),
        gain: 0.05, pan: rnd(-0.8, 0.8), at: 0.3 + Math.random() * 0.4, curve: 1, send: 0.4 });
    }
    for (let i = 0; i < (place === 1 ? 3 : 1); i++) {
      const f = rnd(420, 620);
      this.tone({ type: 'triangle', f0: f, f1: f * 1.5, dur: 0.5, attack: 0.08, gain: 0.03, pan: rnd(-0.7, 0.7), at: 0.5 + i * 0.35, send: 0.5 });
    }
  }

  breath(inhale, gain) {
    if (inhale) this.hit({ kind: 'pink', f0: 1900, f1: 2300, Q: 0.9, dur: 0.32, attack: 0.15, gain: gain * 0.6, curve: 0.8, send: 0 });
    else this.hit({ kind: 'pink', f0: 1100, f1: 700, Q: 0.8, dur: 0.42, attack: 0.04, gain, curve: 1.2, send: 0 });
  }

  // the iako lashings straining as the ama lifts
  creak() {
    const a = this.ctx, t0 = a.currentTime, dur = rnd(0.18, 0.35);
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = rnd(60, 95);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(700, 1100); f.Q.value = 5;
    const g = a.createGain(); g.gain.value = 0;
    // a ratchet of little grabs rather than a smooth tone
    const rat = a.createOscillator(), rd = a.createGain(); rat.type = 'square'; rat.frequency.value = rnd(25, 45); rd.gain.value = 0.04;
    rat.connect(rd); rd.connect(g.gain);
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.04); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(env); env.connect(this.out(rnd(-0.6, -0.2), 0.05));
    for (const n of [o, rat]) { n.start(t0); n.stop(t0 + dur + 0.05); }
  }

  // a gull calling far off: two or three falling cries
  gull() {
    const pan = rnd(-0.9, 0.9), n = 2 + Math.floor(Math.random() * 2), f = rnd(1400, 1900);
    for (let i = 0; i < n; i++) {
      const at = i * rnd(0.22, 0.32);
      this.tone({ type: 'triangle', f0: f * 1.25, f1: f * 0.8, dur: 0.2, attack: 0.03, gain: 0.025, pan, at, send: 0.5 });
      this.tone({ type: 'sine', f0: f * 2.5, f1: f * 1.6, dur: 0.18, attack: 0.03, gain: 0.008, pan, at, send: 0.5 });
    }
  }

  // a wave breaking on the beach or the reef
  breakWave(level) {
    this.hit({ kind: 'brown', type: 'lowpass', f0: 400, f1: 900, dur: 2.8, attack: 0.5, gain: level * 1.6, pan: rnd(-0.9, -0.3), curve: 1, send: 0.3 });
    this.hit({ kind: 'pink', type: 'bandpass', f0: 1500, f1: 800, dur: 2.2, attack: 0.6, gain: level * 0.4, pan: rnd(-0.9, -0.3), at: 0.3, curve: 1, send: 0.3 });
  }

  // a raindrop on the water or the hull
  drop() {
    const pan = rnd(-1, 1);
    if (Math.random() < 0.7) this.hit({ f0: rnd(3500, 7000), Q: 1.5, dur: 0.02, gain: rnd(0.01, 0.035), pan, send: 0 });
    else this.bubble(rnd(1200, 3000), 0.012, pan);
  }

  // the menus' buttons
  click() {
    if (!this.ready()) return;
    this.tone({ f0: 900, f1: 700, dur: 0.05, gain: 0.06, send: 0 });
  }
}
