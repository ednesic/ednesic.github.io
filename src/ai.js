// Rival paddlers. They use the same canoe physics as the player and only choose when, where and how to stroke.
import { clamp } from './utils.js';
import { STROKES } from './strokes.js';
import { startStroke, setPlant, plantSideFor, headingAhead } from './canoe.js';

// Aim for the rival's lane, swerving around coral heads seen ahead.
function aimX(r, objs) {
  let aim = r.lane;
  for (const o of objs) {
    if (o.k !== 'coral' || o.y < r.y + 2 || o.y > r.y + 40) continue;
    if (Math.abs(o.x - aim) < o.r + 4) aim = o.x + (r.x > o.x ? 1 : -1) * (o.r + 6);
  }
  return aim;
}

export function aiStep(r, t, objs, rng) {
  if (r.huliT > 0 || r.finish !== null) return;
  const err = clamp(headingAhead(r) - clamp((aimX(r, objs) - r.x) * 0.03, -0.4, 0.4), -1, 1);   // > 0: pointing right of the target
  // on a wave that keeps swinging the canoe off line, plant the paddle on the other side: it grips
  // and its drag pulls the bow back; once the swing stops, strokes take over. The pull overshoots the
  // swing, so a plant is kept until the bow is clearly swinging back rather than lifted the moment it reverses.
  const fix = plantSideFor(err);
  const big = r.surf > 0.4 && Math.abs(err) > 0.12 * (2.1 - r.skill);
  if (big && r.r * err > (r.plant === fix ? -0.08 : 0)) { setPlant(r, fix); return; }
  if (r.plant) setPlant(r, 0);
  if (t < r.nextT) return;
  let side = -r.lastSide || 1, type = 'media';
  if (err > 0.06) side = 1; else if (err < -0.06) side = -1;
  if (Math.abs(err) > 0.35) type = 'diagonal';
  else if (r.roll > 0.3) { side = 1; type = 'longa'; }
  else if (r.waveCatch && r.st > 25) type = 'forte';
  else if (r.st < 30) type = 'longa';
  else if (r.surf > 0.6) type = 'longa';
  if (startStroke(r, side, type, t)) {
    r.nextT = t + STROKES[type].gap * (1.12 + (1.05 - r.skill) * 1.2) + rng() * 0.06;
  } else r.nextT = t + 0.05;
}
