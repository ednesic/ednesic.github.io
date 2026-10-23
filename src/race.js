// One race: conditions, canoes, obstacles, countdown and finish. No DOM or three.js here.
import { makeRng, range } from './utils.js';
import { makeConditions, Sea } from './sea.js';
import { newCanoe, stepCanoe, collide, float } from './canoe.js';
import { aiStep } from './ai.js';
import { RIVALS } from './tracks/index.js';

const LANES = [-14, 14, 28];
const STEP = 1 / 120;   // physics runs in small equal steps whatever the frame rate, so motion stays smooth

export class Race {
  // onEvent(name, detail) hears what happens to the player's canoe and the race itself.
  constructor(track, { seed, onEvent, weather } = {}) {
    this.track = track;
    this.rng = makeRng(seed);
    this.cond = makeConditions(track, this.rng, { weather });
    this.sea = new Sea(track, this.cond);
    this.onEvent = onEvent || (() => {});
    this.t = 0; this.rt = 0; this.count = 3.6; this.finishT = null;
    this.me = newCanoe(0, 0);
    this.rivals = RIVALS.map((r, i) => Object.assign(newCanoe(LANES[i], -2 - i), r, { skill: track.rivals[i], lane: LANES[i], nextT: 0 }));
    for (const c of this.canoes) c.heat = this.cond.weather.cost;
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

    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const ti = t - dt + (i + 1) * h;
      for (const r of this.rivals) aiStep(r, ti, this.objs, this.rng);
      for (const c of this.canoes) stepCanoe(c, h, ti, this.env);
      for (const c of this.canoes) collide(c, this.objs, this.env);
    }
    for (const o of this.objs) if (o.k === 'honu') { o.t += dt; o.x += o.vx * dt; }

    for (const r of this.rivals) if (r.finish === null && r.y >= this.track.len) { r.finish = this.rt; r.plant = 0; }
    const me = this.me;
    if (this.finishT === null && me.y >= this.track.len) {
      this.finishT = this.rt; me.finish = this.rt; me.plant = 0;
      this.onEvent('finish', this.finishT);
    }

    // coaching cues, each fired once when its state starts
    const cue = this.cue;
    if (me.waveCatch && !cue.waveCatch && me.huliT <= 0) this.onEvent('wave');
    cue.waveCatch = me.waveCatch;
    // riding a wave crooked: the cue to plant the paddle (espetada) and straighten up
    const crooked = me.surf > 0.5 && Math.abs(me.waveAngle) > 0.3 && !me.plant && me.huliT <= 0;
    if (crooked && !cue.crooked) this.onEvent('crooked', me.waveAngle > 0 ? -1 : 1);
    cue.crooked = crooked;
    if (me.surf > 0.9 && !cue.surf) { this.onEvent('surf'); cue.surf = true; }
    if (me.surf < 0.2) cue.surf = false;
    if (me.st < 12 && !cue.tired) { this.onEvent('tired'); cue.tired = true; }
    if (me.st > 40) cue.tired = false;
  }

  // After the player finishes the rivals keep paddling to the line.
  coast(dt) {
    this.t += dt;
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const ti = this.t - dt + (i + 1) * h;
      for (const r of this.rivals) { aiStep(r, ti, this.objs, this.rng); stepCanoe(r, h, ti, this.env); }
      stepCanoe(this.me, h, ti, this.env);
    }
  }

  // Every canoe with its finish time, or an estimate from its current speed if it has not finished.
  standings() {
    const all = [{ name: 'Você', css: '#c2462c', me: true, c: this.me }]
      .concat(this.rivals.map(r => ({ name: r.name, css: r.css, c: r })));
    for (const a of all) {
      const sp = Math.max(1.5, a.c.vy);
      a.est = a.c.finish !== null ? a.c.finish : this.rt + (this.track.len - a.c.y) / sp;
    }
    return all;
  }

  position() {
    const order = this.canoes.slice().sort((a, b) => b.y - a.y);
    return order.indexOf(this.me) + 1;
  }
}
