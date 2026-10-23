// V1 physics (Tahitian one-person va'a, no rudder) on a flat (x, y) plane in metres:
// y runs down the course, x points to the paddler's right.
// Heading psi: 0 = straight down the course, positive = turned to the right.
// No DOM or three.js here, so this runs in Node for the tests.
import { G, clamp, wrapAngle, axes } from './utils.js';
import { STROKES, QUEUE_WINDOW, strokeProfile, strokeBite, strokeEffort } from './strokes.js';

// Below this speed (m/s) a stroke steers fully; above it, steering falls with the cube of speed.
const STEER_U = 4;

// Turning a hull in the water means turning the water around it too (added mass), so the canoe
// is slow to start a turn and keeps swinging after the blade comes out. The yaw torques below are
// scaled by YAW_GAIN (one over the inertia) and the swing dies through the water's damping: a linear
// part that grows with speed (the hull runs like a keel and resists the turn) and a quadratic part in
// the turn rate itself (stopped, a spun canoe slows down little by little).
// Time constant of the swing: ~2.5 s stopped, ~1 s at a 4 m/s cruise, ~1.8 s surfing a wave.
export const YAW_GAIN = 0.18, YAW_D0 = 0.35, YAW_DU = 0.18, YAW_DQ = 0.8;
// Sideways the water pushes back on the drift, harder the faster the hull runs: a turn makes the canoe
// slide out a little before its track follows the bow (~0.4 s at cruise). That push acts a little behind
// the middle, so a drifting canoe also swings its bow toward where it is going.
const SWAY_D0 = 0.9, SWAY_DU = 0.55, SWAY_DQ = 0.8, SWAY_YAW = 0.02;
// How hard the waves swing the hull: through the slope under bow and stern, and through the water
// running sideways differently at each end.
const SLOPE_YAW = 3.0, FLOW_YAW = 1.6;
// Share of gravity along the water surface that pushes the hull down a wave face.
const SLOPE_G = 0.85, SURF_GLIDE = 0.45;
// Along the hull a V1 slips through the water easily: about 70 N at 4 m/s for ~90 kg of canoe and paddler.
// Low drag is what lets it keep pace with a bump and glide between strokes.
const HULL_DRAG = 0.05;

export const HULL = 7.3, HALF = HULL / 2, AMA_X = -1.9;
export const HULI_ROLL = 0.55;   // roll (rad) where the ama goes over
export const LOW_ST = 25, TIRED_ST = 12;   // stamina below which the forte and then every stroke is cut back

export function newCanoe(x, y) {
  return {
    x, y, vx: 0, vy: 0, psi: 0, r: 0, roll: 0, rollV: 0, pitch: 0, heave: 0,
    st: 100, huliT: 0, invuln: 0, hulis: 0, pearls: 0,
    stroke: null, lastStroke: -9, lastSide: 0, combo: 0, plant: 0, heat: 1, queued: null,
    surf: 0, slopeAcc: 0, waveCatch: false, waveAngle: 0, pearlT: 0, bowDig: 0, finish: null,
  };
}

// side: -1 left, +1 right. Returns true for a stroke taken, 'queued' for one pressed a little early
// (stepCanoe starts it as soon as the previous one allows) and false for one refused.
export function startStroke(c, side, type, t) {
  if (c.huliT > 0 || c.finish !== null) return false;
  // out of breath the arms cannot give a hard stroke: low on stamina the forte comes out as a média,
  // and nearly empty every stroke (but the diagonal) is a slow longa
  if (c.st < TIRED_ST && type !== 'diagonal') type = 'longa';
  else if (c.st < LOW_ST && type === 'forte') type = 'media';
  const P = STROKES[type];
  const gap = t - c.lastStroke;
  const minGap = c.stroke ? c.stroke.gap : 0;
  if (gap < minGap) {
    if (minGap - gap > QUEUE_WINDOW) return false;
    c.queued = { side, type };
    return 'queued';
  }
  c.queued = null;
  c.plant = 0;   // the blade comes out of the water to stroke
  const alternate = side !== c.lastSide;
  if (alternate && gap < P.gap * 1.6 && type !== 'diagonal') c.combo++;
  else if (type !== 'diagonal') c.combo = 0;
  const power = 0.5 + 0.5 * Math.pow(Math.max(0, c.st) / 100, 0.6);
  // a tired paddler also strokes slower: up to 60% more time between catches with the tank empty
  const slow = 1 + 0.6 * clamp((LOW_ST - c.st) / LOW_ST, 0, 1);
  c.stroke = { side, type, t: 0, gap: P.gap * slow, power: power * (alternate ? 1 : 0.8) * (1 + Math.min(c.combo, 10) * 0.012) };
  const u = c.vx * Math.sin(c.psi) + c.vy * Math.cos(c.psi);
  c.st = Math.max(0, c.st - P.cost * strokeEffort(P, u) * c.heat);   // heat: the weather's toll (sun > 1)
  c.lastStroke = t; c.lastSide = side;
  return true;
}

// Espetada: the paddle is planted upright in the water beside the paddler and held there.
// The blade grips the water and damps any swing, and its drag on that one side pulls the bow
// toward it, harder the faster the canoe runs (a wave or the canoe's own momentum).
// side -1 plants on the left (pulls the bow left), +1 on the right, 0 lifts it out.
export function setPlant(c, side) {
  c.plant = c.huliT > 0 || c.finish !== null ? 0 : side;
}

// The side to plant on to bring the bow back when it points `err` radians right (> 0) of where it should.
export const plantSideFor = err => err > 0 ? -1 : 1;

// Where the bow will point once the swing it has now dies out: a canoe keeps turning for about a
// second after the blade comes out, so a paddler steers by this, not by where the bow is now.
export const YAW_LEAD = 0.8;
export const headingAhead = c => c.psi + c.r * YAW_LEAD;

export function huli(c, env, why) {
  if (c.huliT > 0) return;
  c.huliT = 3; c.hulis++; c.combo = 0; c.stroke = null; c.plant = 0; c.queued = null;
  env.emit(c, 'huli', why);
}

// Places the hull on the water without moving it (used during the countdown and on the menu).
export function float(c, sea, t) {
  const hb = sea.height(c.x, c.y + HALF * 0.85, t), hs = sea.height(c.x, c.y - HALF * 0.85, t);
  c.heave = (hb + hs) / 2;
  c.pitch = Math.atan2(hb - hs, HULL * 0.85);
}

// env: { sea, track, rng, emit(canoe, event, detail) }
export function stepCanoe(c, dt, t, env) {
  const { sea, track } = env;
  const w = sea.wind(t, c.x, c.y);
  const { fx, fy, rx, ry } = axes(c.psi);
  const u = c.vx * fx + c.vy * fy;   // forward speed
  const v = c.vx * rx + c.vy * ry;     // sideways speed (to the right)
  let au = 0, av = 0, yawAcc = 0, rollM = 0;

  // the water itself moves in the waves' orbits: the hull and the blade work against the water, not
  // the ground. Sampled at bow and stern, where it can run differently
  const bx = c.x + fx * HALF * 0.85, by = c.y + fy * HALF * 0.85;
  const sx = c.x - fx * HALF * 0.85, sy = c.y - fy * HALF * 0.85;
  const wb = sea.flow(bx, by, t), wst = sea.flow(sx, sy, t);
  const ur = u - ((wb[0] + wst[0]) * fx + (wb[1] + wst[1]) * fy) / 2;   // forward speed through the water
  const vr = v - ((wb[0] + wst[0]) * rx + (wb[1] + wst[1]) * ry) / 2;   // sideways speed through the water

  // a stroke pressed early starts as soon as the last one allows
  if (c.queued && c.stroke && t - c.lastStroke >= c.stroke.gap) {
    const q = c.queued;
    if (startStroke(c, q.side, q.type, t) === true) env.emit(c, 'stroke', { side: q.side, type: c.stroke.type });
  }

  // paddle
  if (c.stroke) {
    const P = STROKES[c.stroke.type];
    c.stroke.t += dt;
    const ph = c.stroke.t / P.dur;
    if (ph < 1) {
      const prof = strokeProfile(ph) * c.stroke.power;
      au += P.F * prof * strokeBite(P, ur);
      // left side stroke turns the bow right. The faster the hull runs the harder it is to swing with
      // the paddle, so above a cruise it loses steering fast and on a fast wave it barely turns
      const turnable = Math.pow(STEER_U / Math.max(STEER_U, Math.abs(u)), 3);
      yawAcc += -c.stroke.side * P.yaw * prof * turnable * (1 - 0.65 * c.surf);
      rollM += (c.stroke.side > 0 ? -P.brace : 0.15) * prof * 2.2;   // a stroke on the right braces against the ama lifting
    }
    if (c.stroke.t > P.dur + 0.4) c.stroke = null;
  }

  // espetada: a planted blade drags a little and props the hull; its grip on the turn is applied below
  const planted = c.plant && !(c.stroke && c.stroke.t < STROKES[c.stroke.type].dur);
  const qa = ur * Math.abs(ur);
  if (planted) {
    au -= 0.018 * qa;
    rollM += c.plant > 0 ? -1.4 : 0.3;   // planted on the right it props up the ama side (no stamina: the blade is only held)
  }

  // hull drag: low along the hull, high sideways and more so the faster it runs; running down a wave the hull glides
  au -= HULL_DRAG * (1 - SURF_GLIDE * c.surf) * qa;
  const swayD = SWAY_D0 + SWAY_DU * Math.abs(u);
  av -= swayD * vr + SWAY_DQ * vr * Math.abs(vr);
  // the side push sits aft of the middle: a hull sliding right swings its bow right, into its track.
  // Surfing, the stern lifts clear and that hold is lost
  yawAcc += SWAY_YAW * vr * Math.max(0, u) * (1 - 0.7 * c.surf) / YAW_GAIN;
  // water running sideways faster under the bow than under the stern drags the bow with it.
  // Only waves longer than the hull swing it: a short chop pushes both ways along it at once
  const lb = sea.flow(bx, by, t, HULL), ls = sea.flow(sx, sy, t, HULL);
  yawAcc += FLOW_YAW * swayD * ((lb[0] - ls[0]) * rx + (lb[1] - ls[1]) * ry);

  // wind pushes along its direction
  au += 0.011 * (w.x * fx + w.y * fy);
  av += 0.03 * (w.x * rx + w.y * ry);
  // weathercocking: a moving hull swings its bow up into a crosswind (wind from the left turns it left)
  yawAcc -= 0.014 * (w.x * rx + w.y * ry) * clamp(u / 3, 0, 1.5);

  // waves: gravity along the water surface, sampled at bow and stern
  const gb = sea.grad(bx, by, t), gs = sea.grad(sx, sy, t);
  const gsl = G * SLOPE_G;
  const fbU = -gsl * (gb[0] * fx + gb[1] * fy), fsU = -gsl * (gs[0] * fx + gs[1] * fy);
  const fbV = -gsl * (gb[0] * rx + gb[1] * ry), fsV = -gsl * (gs[0] * rx + gs[1] * ry);
  const slopeU = (fbU + fsU) / 2;
  au += slopeU;
  av += (fbV + fsV) / 2;
  // the push on the stern differs from the push on the bow: that difference turns the canoe (broaching).
  // With no rudder on a V1, a canoe that enters a wave crooked gets swung hard. As with the flow,
  // only the waves longer than the hull count
  const gbL = sea.grad(bx, by, t, HULL), gsL = sea.grad(sx, sy, t, HULL);
  yawAcc += -gsl * ((gbL[0] - gsL[0]) * rx + (gbL[1] - gsL[1]) * ry) * SLOPE_YAW;
  c.slopeAcc = c.slopeAcc * 0.9 + slopeU * 0.1;

  // breaking waves near the beach shove the canoe toward the sand
  if (track.shore && sea.distToShore(c.x) < 38 && sea.height(c.x, c.y, t) > sea.cond.swell.A * 0.9) {
    c.vx += track.shore.side * 2.2 * dt;
    rollM += track.shore.side * 2.5;
  }

  // heave, pitch and roll follow the water
  const hb = sea.height(bx, by, t), hs = sea.height(sx, sy, t);
  const hc = (hb + hs) / 2;
  // on a sharp crest the middle of the hull sits higher than its ends: float on whichever is higher
  c.heave = Math.max(hc, sea.height(c.x, c.y, t) - 0.08);
  c.pitch = Math.atan2(hb - hs, HULL * 0.85);
  const sideSlope = (sea.height(c.x + rx * 1.2, c.y + ry * 1.2, t) - sea.height(c.x - rx * 1.2, c.y - ry * 1.2, t)) / 2.4;   // > 0: water higher on the right

  // pearling: running down a face, the bow buries into the back of the wave ahead
  const tip = HALF + 0.8;
  const lineH = hc + Math.tan(c.pitch) * tip;
  c.bowDig = c.bowDig * 0.8 + (sea.height(c.x + fx * tip, c.y + fy * tip, t) - lineH) * 0.2;
  if (c.pearlT > 0) c.pearlT -= dt;
  if (c.huliT <= 0 && c.pearlT <= 0 && u > 4.5 && c.bowDig > 0.12 && c.pitch < -0.045) {
    c.pearlT = 2.5; c.pearls++;
    c.vx -= 0.55 * u * fx; c.vy -= 0.55 * u * fy;
    c.rollV += 1.4 + env.rng() * 0.8;
    c.r += (env.rng() - 0.5) * 0.5;
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
  // the ama always drags in the water on the left: it slows the canoe and pulls the bow to the left,
  // which the paddler answers by stroking more on that side. Pressed down it drags more; lifted it barely touches.
  const amaLoad = clamp(1 - c.roll / 0.25, 0, 2);
  au -= 0.0035 * amaLoad * qa;
  yawAcc -= 0.008 * amaLoad * qa;
  if (c.roll < -0.12) au -= (-c.roll - 0.12) * 4 * Math.max(0, u) * 0.3;   // ama buried: much more drag

  // integrate
  if (c.huliT > 0) {
    c.huliT -= dt;
    c.vx *= Math.exp(-2.5 * dt); c.vy *= Math.exp(-2.5 * dt);
    au = 0; yawAcc = 0; c.r *= Math.exp(-3 * dt);
    c.st = Math.min(100, c.st + 8 * dt);
    if (c.huliT <= 0) { c.roll = 0; c.rollV = 0; c.invuln = 1.5; env.emit(c, 'recovered'); }
  } else if (c.roll >= HULI_ROLL && c.invuln <= 0) {
    huli(c, env, 'o ama levantou');
  }
  if (c.invuln > 0) c.invuln -= dt;

  // the hull's grip on the water resists any swing, more the faster it runs, so a stroke only nudges
  // the bow at cruise. Running down a wave the stern lifts clear and lets go: there the wave swings it
  // and only the espetada holds it
  let yawDamp = YAW_D0 + YAW_DU * Math.min(Math.abs(u), 4.5) * (1 - 0.6 * c.surf);

  // the planted blade grips: it damps any swing (wave, wind or momentum) and, dragging on one side
  // only, pulls the bow toward that side; both bite harder the faster the canoe runs, so on a wave
  // it holds the stern from being thrown round
  if (planted) {
    // the blade sits aft beside the stern, a long lever: almost nothing slow, a strong hold fast
    const grip = clamp(Math.abs(ur) * 0.13, 0, 0.75);   // a good hold, never a full lock
    yawAcc *= 1 - grip * 0.6;
    yawDamp += grip * 2.5;
    yawAcc += c.plant * clamp(0.13 * qa, 0, 6);
  }

  // the canoe keeps its velocity over the ground: turning the bow does not turn the motion with it,
  // the water's side push does that over a moment (au, av act along and across the hull)
  c.vx += (au * fx + av * rx) * dt;
  c.vy += (au * fy + av * ry) * dt;
  c.r += (yawAcc * YAW_GAIN - yawDamp * c.r - YAW_DQ * c.r * Math.abs(c.r)) * dt;
  c.psi += c.r * dt;
  c.psi = wrapAngle(c.psi);
  c.x += c.vx * dt; c.y += c.vy * dt;

  // course limits: reef, beach or open-water buoys
  if (c.x < track.bounds[0]) { c.vx = Math.abs(c.vx) * 0.3; c.x = track.bounds[0]; if (track.shore || track.coral) c.vy *= 0.5; }
  if (c.x > track.bounds[1]) { c.vx = -Math.abs(c.vx) * 0.3; c.x = track.bounds[1]; if (track.coral) c.vy *= 0.5; }

  // stamina comes back faster when resting or riding a wave
  const resting = t - c.lastStroke > 1.4;
  c.surf = slopeU > 0.35 && u > 2.5 ? Math.min(1, c.surf + dt * 3) : Math.max(0, c.surf - dt * 2);
  const regen = sea.cond.weather ? sea.cond.weather.regen : 1;
  c.st = Math.min(100, c.st + ((resting ? 7.5 : 5.2) + c.surf * 4) * regen * dt);

  // a wave is lifting the stern and the canoe is still slower than it: time to sprint onto it
  const main = sea.cond.main;
  const ws = main.dx * c.vx + main.dy * c.vy;
  c.waveCatch = c.huliT <= 0 && c.slopeAcc > 0.12 && ws < main.c * 0.92 && (main.dx * fx + main.dy * fy) > 0.5;
  // heading relative to the wave's travel (0 = straight down it, > 0 = bow pointing right of it)
  c.waveAngle = wrapAngle(c.psi - Math.atan2(main.dx, main.dy));
}

// Coral heads tip the canoe over; a honu only slows it down.
export function collide(c, objs, env) {
  const { fx, fy, rx, ry } = axes(c.psi);
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

// --- canoe against canoe ------------------------------------------------------------------
// Each canoe is a few capsules in the plane: the hull, the ama out on the left and the two
// iako booms between them. [along, side] of each end, measured from the hull's centre, and the radius.
const PARTS = [
  { k: 'hull', a: [HALF, 0], b: [-HALF, 0], r: 0.24 },
  { k: 'ama', a: [0.4 + 1.4, AMA_X], b: [0.4 - 1.4, AMA_X], r: 0.14 },
  { k: 'iako', a: [0.5, 0], b: [0.5, AMA_X], r: 0.05 },
  { k: 'iako', a: [-1.55, 0], b: [-1.55, AMA_X], r: 0.05 },
];
const BUMP_E = 0.25;          // how much of the closing speed bounces back
const BUMP_HULI = 2.2;        // closing speed (m/s) that tips over a canoe struck on its ama or iako

function partEnds(c, p) {
  const { fx, fy, rx, ry } = axes(c.psi);
  return [
    c.x + fx * p.a[0] + rx * p.a[1], c.y + fy * p.a[0] + ry * p.a[1],
    c.x + fx * p.b[0] + rx * p.b[1], c.y + fy * p.b[0] + ry * p.b[1],
  ];
}

// Closest points between segments P0P1 and Q0Q1: returns [px, py, qx, qy].
function closest(p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y) {
  const ux = p1x - p0x, uy = p1y - p0y, vx = q1x - q0x, vy = q1y - q0y, wx = p0x - q0x, wy = p0y - q0y;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy;
  const den = a * c - b * b;
  let s = den > 1e-9 ? clamp((b * e - c * d) / den, 0, 1) : 0;
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? clamp(-d / a, 0, 1) : 0; }
  else if (t > 1) { t = 1; s = a > 1e-9 ? clamp((b - d) / a, 0, 1) : 0; }
  return [p0x + ux * s, p0y + uy * s, q0x + vx * t, q0y + vy * t];
}

// The deepest contact between two canoes, or null when they are apart.
export function contact(A, B) {
  let best = null;
  for (const pa of PARTS) {
    const ea = partEnds(A, pa);
    for (const pb of PARTS) {
      const eb = partEnds(B, pb);
      const [px, py, qx, qy] = closest(...ea, ...eb);
      const dx = px - qx, dy = py - qy, d = Math.hypot(dx, dy), depth = pa.r + pb.r - d;
      if (depth > 0 && (!best || depth > best.depth)) {
        // n points from B to A; parts lying across each other fall back to centre to centre
        let nx = dx / d, ny = dy / d;
        if (!(d > 1e-6)) { const cx = A.x - B.x, cy = A.y - B.y, l = Math.hypot(cx, cy) || 1; nx = cx / l; ny = cy / l; }
        best = { depth, nx, ny, x: (px + qx) / 2, y: (py + qy) / 2, partA: pa.k, partB: pb.k };
      }
    }
  }
  return best;
}

// Two canoes that touch are pushed apart and trade momentum along the contact; the hit swings both
// round, and a hard hit on an ama or iako tips that canoe over. Equal masses.
export function bump(A, B, env) {
  if (Math.abs(A.y - B.y) > HULL + 1 || Math.abs(A.x - B.x) > HULL + 4) return null;
  const k = contact(A, B);
  if (!k) return null;
  const { nx, ny } = k;
  // push apart until no part overlaps (a few passes, since an ama can still touch once the hulls are clear)
  for (let i = 0, q = k; q && i < 4; i++, q = contact(A, B)) {
    A.x += q.nx * q.depth / 2; A.y += q.ny * q.depth / 2;
    B.x -= q.nx * q.depth / 2; B.y -= q.ny * q.depth / 2;
  }
  const close = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;   // < 0: moving into each other
  if (close >= 0) return k;
  const j = -(1 + BUMP_E) * close / 2;
  A.vx += j * nx; A.vy += j * ny;
  B.vx -= j * nx; B.vy -= j * ny;
  // scraping along each other: some of the sliding speed is lost too
  const tx = -ny, ty = nx, slide = (A.vx - B.vx) * tx + (A.vy - B.vy) * ty, f = Math.min(Math.abs(slide) * 0.25, j * 0.6) * Math.sign(slide);
  A.vx -= f * tx; A.vy -= f * ty; B.vx += f * tx; B.vy += f * ty;
  // the push off centre swings the hull: psi grows clockwise, so a push to the right on the bow turns it right
  for (const [c, s] of [[A, 1], [B, -1]]) {
    const ox = k.x - c.x, oy = k.y - c.y;
    c.r += -(ox * ny * s - oy * nx * s) * j * 0.5;
    c.rollV += (env.rng() - 0.5) * j * 0.8;
  }
  const hard = -close > BUMP_HULI;
  for (const [c, part] of [[A, k.partA], [B, k.partB]]) {
    c.combo = 0;
    if (hard && part !== 'hull' && c.invuln <= 0) huli(c, env, 'bateram no seu ama');
  }
  k.speed = -close; k.hard = hard;
  for (const c of [A, B]) env.emit(c, 'bump', k);
  return k;
}
