// One race: conditions, canoes, obstacles, countdown and finish. No DOM or three.js here.
import { makeRng, range } from './utils.js';
import { makeConditions, Sea } from './sea.js';
import { newCanoe, stepCanoe, collide, bump, float, plantSideFor } from './canoe.js';
import { aiStep } from './ai.js';
import { RIVALS } from './tracks/index.js';
import { snapshot, applySnapshot, stepRemote } from './net/sync.js';

// Starting places: slot 0 (the player offline, the host online) in the middle, the rest in lanes either side.
const LANES = [0, -14, 14, -28, 28, 42, -42];
const startY = slot => slot ? -1 - slot : 0;
const STEP = 1 / 120;   // physics runs in small equal steps whatever the frame rate, so motion stays smooth
const TRAIL_DT = 0.25;  // seconds between the points of each canoe's trail, drawn on the results screen

export class Race {
  // onEvent(name, detail) hears what happens to the player's canoe and the race itself.
  // Online, roster lists every canoe by slot ({ slot, name, color, css, outfit, human }) and mySlot is the
  // player's. Other humans' canoes are remote (moved by their messages); so are the rivals on a guest's
  // screen, since the host paddles them.
  constructor(track, { seed, onEvent, weather, wind, sea, rivals = true, roster, mySlot = 0, host = true } = {}) {
    this.track = track;
    this.rng = makeRng(seed);
    this.cond = makeConditions(track, this.rng, { weather, wind, sea });
    this.sea = new Sea(track, this.cond);
    this.onEvent = onEvent || (() => {});
    this.t = 0; this.rt = 0; this.after = 0; this.count = 3.6; this.finishT = null;
    this.seed = seed;
    this.online = !!roster;
    roster = roster || [{ slot: 0 }].concat(rivals ? RIVALS.map((r, i) => Object.assign({ slot: i + 1 }, r)) : []);
    const place = p => Object.assign(newCanoe(LANES[p.slot], startY(p.slot)), p, { lane: LANES[p.slot] });
    this.me = place(roster.find(p => p.slot === mySlot) || { slot: mySlot });
    this.rivals = roster.filter(p => p.slot !== mySlot).map(p => Object.assign(place(p),
      { skill: track.rivals[Math.max(0, p.slot - 1) % track.rivals.length], nextT: 0, remote: !!p.human || !host }));
    for (const c of this.canoes) c.heat = this.cond.weather.cost;
    // Each canoe's trail: points [y, x, speed] every TRAIL_DT from the Imua to the line, and its top
    // speed (checked every physics step) with where it came. Only read here, so the race runs the same.
    this.trails = new Map(this.canoes.map(c => [c, { pts: [], top: 0, topAt: null, done: false }]));
    this.trailT = 0;
    this.objs = [];
    for (let y = 120; y < track.len - 60; y += range(this.rng, 28, 55)) {
      if (this.rng() < track.coral * 0.55) this.objs.push({ k: 'coral', x: range(this.rng, track.bounds[0] + 10, track.bounds[1] - 10), y, r: range(this.rng, 1.2, 2.6) });
      else if (this.rng() < track.honu * 0.08) this.objs.push({ k: 'honu', x: range(this.rng, -40, 40), y, r: 0.7, vx: range(this.rng, -0.6, 0.6), t: this.rng() * 6 });
    }
    this.env = {
      sea: this.sea, track, rng: this.rng,
      emit: (c, name, detail) => { if (c === this.me) this.onEvent(name, detail); },
    };
    this.cue = { waveCatch: false, surf: false, tired: false, crooked: false };
  }

  get canoes() { return [this.me].concat(this.rivals); }

  update(dt) {
    this.t += dt;
    const t = this.t;
    if (this.count > 0) {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const after = Math.ceil(this.count);
      if (after !== before) this.onEvent(after > 0 ? 'count' : 'go', after);
      for (const c of this.canoes) float(c, this.sea, t);   // hold behind the line, bobbing
      return;
    }
    if (this.finishT === null) this.rt += dt;

    this.substeps(dt, true);
    for (const o of this.objs) if (o.k === 'honu') { o.t += dt; o.x += o.vx * dt; }

    const me = this.me;
    if (this.finishT === null && me.y >= this.track.len) {
      this.finishT = this.rt; me.finish = this.rt; me.plant = 0;
      this.onEvent('finish', this.finishT);
    }

    // coaching cues, each fired once when its state starts
    const cue = this.cue;
    if (me.waveCatch && !cue.waveCatch && me.huliT <= 0) this.onEvent('wave');
    cue.waveCatch = me.waveCatch;
    // riding a wave crooked: the cue to plant the paddle on the side that pulls the bow back in line
    // (also when the paddle is planted on the wrong side, where it only adds to the swing)
    const crooked = me.surf > 0.5 && Math.abs(me.waveAngle) > 0.3 && me.plant !== plantSideFor(me.waveAngle) && me.huliT <= 0;
    if (crooked && !cue.crooked) this.onEvent('crooked', plantSideFor(me.waveAngle));
    cue.crooked = crooked;
    if (me.surf > 0.9 && !cue.surf) { this.onEvent('surf'); cue.surf = true; }
    if (me.surf < 0.2) cue.surf = false;
    if (me.st < 12 && !cue.tired) { this.onEvent('tired'); cue.tired = true; }
    if (me.st > 40) cue.tired = false;
  }

  // After the player finishes the rivals keep paddling to the line.
  coast(dt) {
    this.t += dt; this.after += dt;
    this.substeps(dt, false);
  }

  // Advances the physics over the dt that just ended at this.t, in equal steps no longer than STEP.
  // obstacles: whether coral and honu are hit (not after the player has finished).
  substeps(dt, obstacles) {
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const ti = this.t - dt + (i + 1) * h;
      for (const r of this.rivals) if (!r.remote) aiStep(r, ti, this.objs, this.rng);
      for (const c of this.canoes) this.step(c, h, ti);
      if (obstacles) for (const c of this.canoes) if (!c.remote) collide(c, this.objs, this.env);
      this.bumps();
      this.record(ti);
    }
    // after the player finishes the race clock stops, so the rivals' times run on from it
    for (const r of this.rivals) if (!r.remote && r.finish === null && r.y >= this.track.len) { r.finish = this.rt + this.after; r.plant = 0; }
  }

  record(t) {
    const sample = t >= this.trailT;
    if (sample) this.trailT = t + TRAIL_DT;
    for (const [c, tr] of this.trails) {
      if (tr.done) continue;
      const v = Math.hypot(c.vx, c.vy);
      if (v > tr.top) { tr.top = v; tr.topAt = [c.y, c.x]; }
      const end = c.y >= this.track.len || !!c.quit;
      if (sample || end) tr.pts.push([c.y, c.x, v]);
      if (end) tr.done = true;
    }
  }

  step(c, h, t) {
    if (c.remote) stepRemote(c, h, t, this.sea);
    else stepCanoe(c, h, t, this.env);
  }

  // canoes that run into each other bounce off (two remote canoes are left to their own screens)
  bumps() {
    const all = this.canoes;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (!all[i].remote || !all[j].remote) bump(all[i], all[j], this.env);
  }

  // Online: the canoes this screen paddles (the player, and the rivals on the host), by slot.
  localStates() {
    const out = {};
    for (const c of this.canoes) if (!c.remote) out[c.slot] = snapshot(c);
    return out;
  }

  // Online: a message about the canoe in that slot.
  receive(slot, s) {
    const c = this.rivals.find(r => r.slot === slot);
    if (c && c.remote) applySnapshot(c, s);
  }

  // Online: that player left the room; their canoe stops where it is.
  drop(slot) {
    const c = this.rivals.find(r => r.slot === slot);
    if (c && c.remote) { c.quit = true; c.stroke = null; c.plant = 0; }
  }

  // Every canoe with its finish time, or an estimate from its current speed if it has not finished.
  standings() {
    const all = [{ name: 'Você', css: this.me.css || '#c2462c', me: true, c: this.me }]
      .concat(this.rivals.map(r => ({ name: r.name, css: r.css, c: r })));
    for (const a of all) {
      a.trail = this.trails.get(a.c);
      const sp = Math.max(1.5, a.c.vy);
      // a player who gave up or left (and never finished) goes to the bottom
      a.out = a.c.finish === null && !!a.c.quit;
      a.est = a.c.finish !== null ? a.c.finish : a.out ? Infinity : this.rt + (this.track.len - a.c.y) / sp;
    }
    return all;
  }

  position() {
    const order = this.canoes.slice().sort((a, b) => b.y - a.y);
    return order.indexOf(this.me) + 1;
  }
}
