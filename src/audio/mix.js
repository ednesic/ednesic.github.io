// What the race should sound like at one moment: target levels (0..1) and filter frequencies for each
// looping layer of the soundscape. No Web Audio here, so the tests run it in Node.
import { clamp, axes } from '../utils.js';
import { HULI_ROLL } from '../canoe.js';

// The player's canoe and its surroundings, as the ear hears them.
// mode: 'menu' | 'race' | 'done' (on the menu the canoe only floats behind the screens).
export function listen(race, mode = 'race') {
  const c = race.me, sea = race.sea, t = race.t;
  const { fx, fy, rx, ry } = axes(c.psi);
  const speed = Math.max(0, c.vx * fx + c.vy * fy);
  const w = sea.wind(t, c.x, c.y);
  const wm = Math.hypot(w.x, w.y);
  // the wind blows toward (w.x, w.y), so it comes from the other way: > 0 means from the right
  const windPan = wm > 0.01 ? clamp(-(w.x * rx + w.y * ry) / wm, -1, 1) : 0;
  // how fast the water rises and falls under the hull: the swells passing
  const dt = 0.15;
  const rise = (sea.height(c.x, c.y, t) - sea.height(c.x, c.y, t - dt)) / dt;
  return {
    mode, speed, surf: c.surf, kn: w.kn, windPan,
    seaM: sea.cond.heightM || 0, rise,
    plant: mode === 'race' ? c.plant : 0, st: c.st, huli: c.huliT > 0, tilt: clamp(Math.abs(c.roll) / HULI_ROLL, 0, 1),
    rain: sea.cond.weather && sea.cond.weather.id === 'chuva',
    shoreM: sea.distToShore(c.x), reef: !!race.track.coral, place: race.track.id,
  };
}

const lin = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

export function mix(s) {
  const sea = lin(s.seaM, 0, 2.5), motion = lin(Math.abs(s.rise), 0, 1.2), sp = lin(s.speed, 0, 6.5);
  const wind = lin(s.kn, 2, 28);
  return {
    // the open sea all around: a low wash that grows with the waves and swells as each one passes
    sea: { gain: (0.05 + 0.13 * sea) * (0.7 + 0.6 * motion), freq: 320 + 520 * sea },
    // water slapping against the hull and the ama as the canoe rides up and down
    lap: { gain: 0.03 + 0.09 * motion + 0.03 * sp, freq: 1100 + 500 * motion },
    // the hull cutting through the water: a hiss that rises in pitch and level with speed
    rush: { gain: 0.2 * Math.pow(sp, 1.6) + 0.12 * s.surf * sp, freq: 900 + 1700 * sp },
    // the low rumble of a wave carrying the canoe
    roar: { gain: 0.26 * s.surf * sp, freq: 140 + 160 * sp },
    // wind in the ears, from the side it blows from; a whistle joins in when it is strong
    wind: { gain: 0.28 * Math.pow(wind, 1.3), freq: 300 + 900 * wind, pan: s.windPan * 0.7 },
    whistle: { gain: 0.05 * lin(s.kn, 14, 30), freq: 900 + 600 * wind },
    rain: { gain: s.rain ? 0.14 : 0 },
    // the planted blade tearing the water, louder the faster the canoe runs past it
    plant: { gain: s.plant ? 0.05 + 0.3 * sp : 0, freq: 600 + 900 * sp, pan: s.plant * 0.55 },
    // surf on the beach (Copacabana) or on the reef (the lagoon), far off
    shore: { gain: s.shoreM < Infinity ? 0.16 * (1 - lin(s.shoreM, 40, 320)) : s.reef ? 0.06 : 0 },
    // under the canoe after a huli everything goes dull
    muffle: s.huli ? 450 : 20000,
    // the menu keeps the sea quiet behind the screens
    amb: s.mode === 'menu' ? 0.55 : 1,
    // seconds between breaths, or 0 for none: heavy and fast as the tank runs dry
    breath: s.mode === 'race' && !s.huli && s.st < 40 ? 0.9 + 1.3 * (s.st / 40) : 0,
    breathGain: 0.03 + 0.07 * (1 - lin(s.st, 0, 40)),
    // chance per second of a creak from the iako as the ama lifts
    creak: s.mode === 'race' && !s.huli ? 3 * lin(s.tilt, 0.55, 1) : 0,
  };
}
