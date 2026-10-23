// V1 physics (Tahitian one-person va'a, no rudder) on a flat (x, y) plane in metres:
// y runs down the course, x points to the paddler's right.
// Heading psi: 0 = straight down the course, positive = turned to the right.
// No DOM or three.js here, so this runs in Node for the tests.
import { G, clamp } from './utils.js';
import { STROKES } from './strokes.js';

export const HULL = 7.3, HALF = HULL / 2, AMA_X = -1.9;
export const HULI_ROLL = 0.55;   // roll (rad) where the ama goes over

export function newCanoe(x, y) {
  return {
    x, y, vx: 0, vy: 0, psi: 0, r: 0, roll: 0, rollV: 0, pitch: 0, heave: 0,
    st: 100, huliT: 0, invuln: 0, hulis: 0, pearls: 0,
    stroke: null, lastStroke: -9, lastSide: 0, combo: 0, plant: 0,
    surf: 0, slopeAcc: 0, waveCatch: false, waveAngle: 0, pearlT: 0, bowDig: 0, finish: null,
  };
}

// side: -1 left, +1 right. Returns false when the previous stroke has not finished.
export function startStroke(c, side, type, t) {
  if (c.huliT > 0 || c.finish !== null) return false;
  c.plant = 0;
  const P = STROKES[type];
  const gap = t - c.lastStroke;
  const minGap = c.stroke ? STROKES[c.stroke.type].gap : 0;
  if (gap < minGap) return false;
  const alternate = side !== c.lastSide;
  if (alternate && gap < 0.95 && type !== 'diagonal') c.combo++;
  else if (type !== 'diagonal') c.combo = 0;
  const power = 0.5 + 0.5 * Math.pow(Math.max(0, c.st) / 100, 0.6);
  c.stroke = { side, type, t: 0, power: power * (alternate ? 1 : 0.8) * (1 + Math.min(c.combo, 10) * 0.012) };
  c.st = Math.max(0, c.st - P.cost);
  c.lastStroke = t; c.lastSide = side;
  return true;
}

// Espetada: the paddle is planted upright beside the stern and held there as a rudder.
// side -1 plants on the left (bow swings left), +1 on the right, 0 lifts it out.
export function setPlant(c, side) {
  c.plant = c.huliT > 0 || c.finish !== null ? 0 : side;
}

export function huli(c, env, why) {
  if (c.huliT > 0) return;
  c.huliT = 3; c.hulis++; c.combo = 0; c.stroke = null; c.plant = 0;
  env.emit(c, 'huli', why);
}

// Places the hull on the water without moving it (used during the countdown and on the menu).
export function float(c, sea, t) {
  const hb = sea.height(c.x, c.y + 3, t), hs = sea.height(c.x, c.y - 3, t);
  c.heave = (hb + hs) / 2;
  c.pitch = Math.atan2(hb - hs, 6);
}

// env: { sea, track, rng, emit(canoe, event, detail) }
export function stepCanoe(c, dt, t, env) {
  const { sea, track } = env;
  const w = sea.wind(t);
  const sp = Math.sin(c.psi), cp = Math.cos(c.psi);
  const fx = sp, fy = cp, rx = cp, ry = -sp;   // forward and right unit vectors
  let u = c.vx * fx + c.vy * fy;     // forward speed
  let v = c.vx * rx + c.vy * ry;     // sideways speed (to the right)
  let au = 0, av = 0, yawAcc = 0, rollM = 0;

  // paddle
  if (c.stroke) {
    const P = STROKES[c.stroke.type];
    c.stroke.t += dt;
    const ph = c.stroke.t / P.dur;
    if (ph < 1) {
      const prof = Math.sin(Math.PI * ph) * c.stroke.power;
      au += P.F * prof;
      // left side stroke turns the bow right; on a wave the hull is locked in and strokes barely steer it
      yawAcc += -c.stroke.side * P.yaw * prof * (1 - 0.7 * c.surf);
      rollM += (c.stroke.side > 0 ? -P.brace : 0.15) * prof * 2.2;   // a stroke on the right braces against the ama lifting
    }
    if (c.stroke.t > P.dur + 0.4) c.stroke = null;
  }

  // espetada: a planted blade drags on one side, swinging the bow toward it and holding the heading.
  // Its bite grows with speed, so it is strongest when riding a wave.
  if (c.plant && !(c.stroke && c.stroke.t < STROKES[c.stroke.type].dur)) {
    const q = u * Math.abs(u);
    au -= 0.022 * q;
    yawAcc += c.plant * 0.16 * q;
    yawAcc -= 0.3 * Math.max(0, u) * c.r;
    rollM += c.plant > 0 ? -1.4 : 0.3;   // planted on the right it props up the ama side
    c.st = Math.max(0, c.st - 1.2 * dt);
  }

  // hull drag: low along the hull, very high sideways
  au -= 0.12 * u * Math.abs(u);
  av -= 2.6 * v;

  // wind pushes along its direction
  au += 0.026 * (w.x * fx + w.y * fy);
  av += 0.03 * (w.x * rx + w.y * ry);

  // waves: gravity along the water surface, sampled at bow and stern
  const bx = c.x + fx * HALF * 0.85, by = c.y + fy * HALF * 0.85;
  const sx = c.x - fx * HALF * 0.85, sy = c.y - fy * HALF * 0.85;
  const gb = sea.grad(bx, by, t), gs = sea.grad(sx, sy, t);
  const gsl = G * 0.62;
  const fbU = -gsl * (gb[0] * fx + gb[1] * fy), fsU = -gsl * (gs[0] * fx + gs[1] * fy);
  const fbV = -gsl * (gb[0] * rx + gb[1] * ry), fsV = -gsl * (gs[0] * rx + gs[1] * ry);
  const slopeU = (fbU + fsU) / 2;
  au += slopeU;
  av += (fbV + fsV) / 2;
  // the push on the stern differs from the push on the bow: that difference turns the canoe (broaching).
  // With no rudder on a V1, a canoe that enters a wave crooked gets swung hard.
  yawAcc += (fbV - fsV) * 1.3;
  c.slopeAcc = c.slopeAcc * 0.9 + slopeU * 0.1;

  // breaking waves near the beach shove the canoe toward the sand
  if (track.shore && sea.distToShore(c.x) < 38 && sea.height(c.x, c.y, t) > sea.cond.swell.A * 0.9) {
    c.vx += track.shore.side * 2.2 * dt;
    rollM += track.shore.side * 2.5;
  }

  // heave, pitch and roll follow the water
  const hb = sea.height(bx, by, t), hs = sea.height(sx, sy, t);
  const hc = (hb + hs) / 2;
  c.heave = hc;
  c.pitch = Math.atan2(hb - hs, HULL * 0.85);
  const sideSlope = (sea.height(c.x + rx * 1.2, c.y + ry * 1.2, t) - sea.height(c.x - rx * 1.2, c.y - ry * 1.2, t)) / 2.4;   // > 0: water higher on the right

  // pearling: running down a face, the bow buries into the back of the wave ahead
  const tip = HALF + 0.8;
  const lineH = hc + Math.tan(c.pitch) * tip;
  c.bowDig = c.bowDig * 0.8 + (sea.height(c.x + fx * tip, c.y + fy * tip, t) - lineH) * 0.2;
  if (c.pearlT > 0) c.pearlT -= dt;
  if (c.huliT <= 0 && c.pearlT <= 0 && u > 4.9 && c.bowDig > 0.25 && c.pitch < -0.045) {
    c.pearlT = 2.5; c.pearls++;
    u *= 0.45;
    c.rollV += 1.4 + env.rng() * 0.8;
    c.r += (env.rng() - 0.5) * 1.2;
    env.emit(c, 'pearl');
  }

  // roll: positive = rolling to the right, lifting the ama
  rollM += -sideSlope * 10;                                      // wave arriving from the left lifts the ama side
  rollM += 0.085 * (w.x * rx + w.y * ry);                        // wind from the left pushes the ama up
  rollM += -c.r * Math.max(0, u) * 0.35;                         // turning left throws weight right
  rollM += Math.sin(t * 2.1 + c.y * 0.05) * 0.04 * w.kn / 10;    // chop
  const k = c.roll < 0 ? 26 : 7 * (1 - clamp(c.roll / HULI_ROLL, 0, 0.9) * 0.6);  // the ama resists sinking much more than lifting
  c.rollV += (rollM - k * c.roll - 3.2 * c.rollV) * dt;
  c.roll += c.rollV * dt;
  c.roll = clamp(c.roll, -0.35, 0.6);
  if (c.roll < -0.12) au -= (-c.roll - 0.12) * 4 * Math.max(0, u) * 0.3;   // ama buried: drag

  // integrate
  if (c.huliT > 0) {
    c.huliT -= dt;
    u *= Math.exp(-2.5 * dt); v *= Math.exp(-2.5 * dt);
    au = 0; yawAcc = 0; c.r *= Math.exp(-3 * dt);
    c.st = Math.min(100, c.st + 8 * dt);
    if (c.huliT <= 0) { c.roll = 0; c.rollV = 0; c.invuln = 1.5; env.emit(c, 'recovered'); }
  } else if (c.roll >= HULI_ROLL && c.invuln <= 0) {
    huli(c, env, 'o ama levantou');
  }
  if (c.invuln > 0) c.invuln -= dt;

  u += au * dt; v += av * dt;
  c.r += (yawAcc - 2.0 * c.r) * dt;
  c.psi += c.r * dt;
  c.psi = Math.atan2(Math.sin(c.psi), Math.cos(c.psi));
  const sp2 = Math.sin(c.psi), cp2 = Math.cos(c.psi);
  c.vx = u * sp2 + v * cp2;
  c.vy = u * cp2 - v * sp2;
  c.x += c.vx * dt; c.y += c.vy * dt;

  // course limits: reef, beach or open-water buoys
  if (c.x < track.bounds[0]) { c.vx = Math.abs(c.vx) * 0.3; c.x = track.bounds[0]; if (track.shore || track.coral) c.vy *= 0.5; }
  if (c.x > track.bounds[1]) { c.vx = -Math.abs(c.vx) * 0.3; c.x = track.bounds[1]; if (track.coral) c.vy *= 0.5; }

  // stamina comes back faster when resting or riding a wave
  const resting = t - c.lastStroke > 0.7;
  c.surf = slopeU > 0.35 && u > 2.5 ? Math.min(1, c.surf + dt * 3) : Math.max(0, c.surf - dt * 2);
  c.st = Math.min(100, c.st + ((resting ? 7.5 : 5.2) + c.surf * 4) * dt);

  // a wave is lifting the stern and the canoe is still slower than it: time to sprint onto it
  const main = sea.cond.main;
  const ws = main.dx * c.vx + main.dy * c.vy;
  c.waveCatch = c.huliT <= 0 && c.slopeAcc > 0.12 && ws < main.c * 0.92 && (main.dx * fx + main.dy * fy) > 0.5;
  // heading relative to the wave's travel (0 = straight down it, > 0 = bow pointing right of it)
  c.waveAngle = Math.atan2(Math.sin(c.psi - Math.atan2(main.dx, main.dy)), Math.cos(c.psi - Math.atan2(main.dx, main.dy)));
}

// Coral heads tip the canoe over; a honu only slows it down.
export function collide(c, objs, env) {
  const fx = Math.sin(c.psi), fy = Math.cos(c.psi);
  const rx = Math.cos(c.psi), ry = -Math.sin(c.psi);
  for (const o of objs) {
    if (Math.abs(o.y - c.y) > 6) continue;
    const along = clamp((o.x - c.x) * fx + (o.y - c.y) * fy, -HALF, HALF);
    const dHull = Math.hypot(o.x - (c.x + fx * along), o.y - (c.y + fy * along));
    const ax = c.x + rx * AMA_X, ay = c.y + ry * AMA_X;
    const alongA = clamp((o.x - ax) * fx + (o.y - ay) * fy, -1.4, 1.4);
    const dAma = Math.hypot(o.x - (ax + fx * alongA), o.y - (ay + fy * alongA));
    if (dHull >= o.r + 0.3 && dAma >= o.r + 0.15) continue;
    if (o.k === 'coral' && c.huliT <= 0 && c.invuln <= 0) {
      c.vx *= 0.2; c.vy *= 0.2;
      huli(c, env, 'bateu no coral');
    } else if (o.k === 'honu' && !o.hit) {
      o.hit = true; c.vx *= 0.6; c.vy *= 0.6;
      env.emit(c, 'honu');
    }
  }
}
