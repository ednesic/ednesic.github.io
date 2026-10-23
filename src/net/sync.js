// Online races: what one canoe tells the others about itself, and how a canoe paddled on another
// screen moves here between those messages. Each player simulates only their own canoe (the host
// also its rivals); the sea is the same everywhere because it comes from the race's seed.
// No DOM or three.js here, so this runs in Node for the tests.
import { STROKES } from '../strokes.js';
import { float } from '../canoe.js';
import { RIVALS } from '../tracks/index.js';

// Every canoe of an online race by slot: the room's players in their own slots (the host in the
// player's red, the others in the colours of the rival that would start there) and, if asked,
// rivals in the free slots.
export function makeRoster(players, withRivals) {
  const roster = players.map(p => Object.assign({ slot: p.slot, name: p.name, human: true },
    p.slot ? { color: RIVALS[p.slot - 1].color, css: RIVALS[p.slot - 1].css, outfit: RIVALS[p.slot - 1].outfit }
      : { color: 0xd33a2c, css: '#c2462c', outfit: 0 }));
  if (withRivals) RIVALS.forEach((r, i) => { if (!players.some(p => p.slot === i + 1)) roster.push(Object.assign({ slot: i + 1 }, r)); });
  return roster.sort((a, b) => a.slot - b.slot);
}

const r3 = v => Math.round(v * 1000) / 1000;

// A small, JSON-friendly picture of a canoe.
export function snapshot(c) {
  const s = c.stroke;
  return {
    x: r3(c.x), y: r3(c.y), vx: r3(c.vx), vy: r3(c.vy), psi: r3(c.psi), r: r3(c.r), roll: r3(c.roll),
    surf: r3(c.surf), plant: c.plant, huliT: r3(c.huliT), st: Math.round(c.st), side: c.lastSide,
    // the stroke under way: its side, type, how far in, and when it started (tells one stroke from the next)
    k: s ? [s.side, s.type, r3(s.t), r3(c.lastStroke)] : null,
    finish: c.finish, quit: c.quit || undefined,
  };
}

// Takes in a message about canoe c. Where it is goes to a target the canoe glides to (see stepRemote);
// the rest is shown as it comes.
export function applySnapshot(c, s) {
  c.net = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, psi: s.psi, r: s.r, roll: s.roll, age: 0 };
  if (!c.netSeen) { c.netSeen = true; c.x = s.x; c.y = s.y; c.psi = s.psi; }
  c.surf = s.surf; c.plant = s.plant; c.huliT = s.huliT; c.st = s.st; c.lastSide = s.side;
  if (s.finish !== null && s.finish !== undefined) c.finish = s.finish;
  if (s.quit) c.quit = true;
  if (s.k) {
    const [side, type, t, start] = s.k;
    // a new stroke gets a new object so the paddler's animation starts it from the catch
    if (!c.stroke || c.netStroke !== start) { c.stroke = { side, type, t, gap: STROKES[type].gap, power: 1 }; c.netStroke = start; }
  } else c.stroke = null;
}

// Moves a remote canoe one step: carries its last known state forward at its speed and eases the
// shown canoe onto it, so it neither stops between messages nor jumps when one arrives.
export function stepRemote(c, dt, t, sea) {
  const n = c.net;
  if (n && !c.quit) {
    // when messages stop coming (the player left the race, or the link hiccups) it glides to a stop
    n.age += dt;
    if (n.age > 0.5) { const f = Math.exp(-2 * dt); n.vx *= f; n.vy *= f; n.r *= f; }
    n.x += n.vx * dt; n.y += n.vy * dt; n.psi += n.r * dt;
    const far = Math.hypot(n.x - c.x, n.y - c.y) > 12;
    const k = far ? 1 : 1 - Math.exp(-dt * 8);
    c.x += (n.x - c.x) * k; c.y += (n.y - c.y) * k;
    c.psi += (n.psi - c.psi) * k; c.roll += (n.roll - c.roll) * k;
    c.vx = n.vx; c.vy = n.vy; c.r = n.r;
  } else { c.vx *= Math.exp(-dt); c.vy *= Math.exp(-dt); }
  if (c.stroke) {
    c.stroke.t += dt;
    if (c.stroke.t > STROKES[c.stroke.type].dur + 0.4) c.stroke = null;
  }
  if (c.huliT > 0) c.huliT = Math.max(0, c.huliT - dt);
  float(c, sea, t);   // sits on this screen's water
}
