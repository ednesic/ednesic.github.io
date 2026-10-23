import { makeRng } from '../src/utils.js';
import { makeConditions, Sea } from '../src/sea.js';
import { newCanoe, startStroke, stepCanoe } from '../src/canoe.js';
import { STROKES } from '../src/strokes.js';

// A flat, windless sea so a test isolates the paddle physics.
export function calmSea(track) {
  const cond = makeConditions(track, makeRng(1));
  cond.waves = cond.waves.map(w => ({ ...w, A: 0 }));
  cond.main = cond.waves[0];
  cond.wx = 0; cond.wy = 0; cond.windKn = 0;
  return new Sea(track, cond);
}

export function makeEnv(track, sea, events = []) {
  return { sea, track, rng: makeRng(7), emit: (c, name, detail) => events.push({ name, detail }) };
}

// Paddles for `seconds`, stroking as soon as allowed. pick(i, c) returns [side, type] for stroke i.
export function paddle(c, env, seconds, pick, { gapScale = 1, dt = 1 / 60, t0 = 0 } = {}) {
  let t = t0, next = t0, i = 0;
  while (t < t0 + seconds) {
    if (t >= next) {
      const [side, type] = pick(i, c);
      if (startStroke(c, side, type, t)) { i++; next = t + STROKES[type].gap * gapScale; }
    }
    stepCanoe(c, dt, t, env);
    t += dt;
  }
  return t;
}

export const alternate = type => i => [i % 2 ? 1 : -1, type];

// Alternates sides but steers back toward the centre line, switching to a diagonal stroke for big corrections.
export const steer = type => (i, c) => {
  const err = c.psi - Math.max(-0.4, Math.min(0.4, -c.x * 0.03));
  let side = -c.lastSide || 1, t = type;
  if (err > 0.06) side = 1; else if (err < -0.06) side = -1;
  if (Math.abs(err) > 0.35) t = 'diagonal';
  return [side, t];
};
export { newCanoe };
