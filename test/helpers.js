import { makeRng } from '../src/utils.js';
import { makeConditions, Sea } from '../src/sea.js';
import { newCanoe, startStroke, stepCanoe, setPlant, plantSideFor, headingAhead } from '../src/canoe.js';
import { STROKES } from '../src/strokes.js';
import { WEATHER } from '../src/weather.js';

// A flat, windless sea so a test isolates the paddle physics.
export function calmSea(track) {
  const cond = makeConditions(track, makeRng(1));
  cond.waves = cond.waves.map(w => ({ ...w, A: 0 }));
  cond.main = cond.waves[0];
  cond.wx = 0; cond.wy = 0; cond.windKn = 0;
  cond.weather = WEATHER.nublado;
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
  const err = headingAhead(c) - Math.max(-0.4, Math.min(0.4, -c.x * 0.03));
  let side = -c.lastSide || 1, t = type;
  if (err > 0.06) side = 1; else if (err < -0.06) side = -1;
  if (Math.abs(err) > 0.35) t = 'diagonal';
  return [side, t];
};
export { newCanoe };

// Like paddle() with steer(), but on a wave it holds the canoe straight with an espetada when `espetada` is on.
export function ride(c, env, seconds, type, { espetada = true, dt = 1 / 60 } = {}) {
  const pick = steer(type);
  let t = 0, next = 0, maxSpeed = 0, sumAngle = 0, n = 0;
  while (t < seconds) {
    const err = headingAhead(c) - Math.max(-0.4, Math.min(0.4, -c.x * 0.03));
    const side = plantSideFor(err);
    // steering by where the bow is heading (swing included), plant when that is off and hold the
    // plant until it is nearly straight again
    if (espetada && c.surf > 0.4 && Math.abs(err) > (c.plant === side ? 0.03 : 0.08)) setPlant(c, side);
    else {
      if (c.plant) setPlant(c, 0);
      if (t >= next) {
        const [side, ty] = pick(0, c);
        if (startStroke(c, side, ty, t)) next = t + STROKES[ty].gap * 1.05;
      }
    }
    stepCanoe(c, dt, t, env);
    maxSpeed = Math.max(maxSpeed, Math.hypot(c.vx, c.vy));
    if (c.surf > 0.4) { sumAngle += Math.abs(c.psi); n++; }
    t += dt;
  }
  return { maxSpeed, meanSurfAngle: n ? sumAngle / n : 0, surfTime: n * dt };
}
