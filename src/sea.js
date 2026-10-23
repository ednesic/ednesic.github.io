// The sea: wind and the sum of waves for one race. Pure functions of position and time, shared by the
// physics and the renderer so what you see is exactly what pushes the canoe.
import { G, KN, clamp, deg, range } from './utils.js';

// Rolls wind and waves for one start. The wind sea always follows the wind's direction and grows with its speed.
export function makeConditions(track, rng) {
  const windKn = range(rng, track.wind.kn[0], track.wind.kn[1]);
  const windDir = range(rng, track.wind.dir[0], track.wind.dir[1]);
  const windFrac = (windKn - track.wind.kn[0]) / (track.wind.kn[1] - track.wind.kn[0]);
  const waves = [];
  const add = (dirDeg, L, A, shoal) => {
    const k = 2 * Math.PI / L;
    // game waves travel at 75% of deep-water speed so a fast canoe can actually stay on a bump
    const c = Math.sqrt(G / k) * 0.75;
    waves.push({ dx: Math.sin(deg(dirDeg)), dy: Math.cos(deg(dirDeg)), k, c, w: k * c, A, ph: rng() * 6.28, shoal, L, dirDeg });
  };
  const seaA = track.sea.A * (0.7 + windFrac * 0.7) * range(rng, 0.9, 1.1);
  const seaL = range(rng, track.sea.L[0], track.sea.L[1]) * (0.85 + windFrac * 0.3);
  add(windDir + range(rng, -10, 10), seaL, seaA, false);
  add(windDir + range(rng, 18, 32) * (rng() < 0.5 ? -1 : 1), seaL * 0.62, seaA * 0.4, false);
  add(windDir + range(rng, -40, 40), seaL * 0.3, seaA * 0.18, false);
  let swell = null;
  if (track.swell) {
    swell = { A: range(rng, track.swell.A[0], track.swell.A[1]), L: range(rng, track.swell.L[0], track.swell.L[1]), dir: range(rng, track.swell.dir[0], track.swell.dir[1]) };
    add(swell.dir, swell.L, swell.A, true);
  }
  const main = waves[track.swell ? 3 : 0];
  return {
    windKn, windDir,
    wx: Math.sin(deg(windDir)) * windKn * KN, wy: Math.cos(deg(windDir)) * windKn * KN,
    waves, swell, main,
    heightM: main.A * 2 * 1.1,
    period: main.L / main.c,
    gustPh: rng() * 10,
  };
}

export class Sea {
  constructor(track, cond) {
    this.track = track;
    this.cond = cond;
  }

  // Waves grow as they reach the beach (only on tracks with a shore).
  shoal(x) {
    const s = this.track.shore;
    if (!s) return 1;
    return 1 + clamp((90 - this.distToShore(x)) / 60, 0, 1) * 1.4;
  }

  distToShore(x) {
    const s = this.track.shore;
    return s ? (x - s.x) * -s.side : Infinity;
  }

  height(x, y, t) {
    let h = 0;
    for (const w of this.cond.waves) {
      const th = w.k * (w.dx * x + w.dy * y) - w.w * t + w.ph;
      const a = w.shoal ? w.A * this.shoal(x) : w.A;
      // Stokes-like profile: sharper crests, flatter troughs
      h += a * (Math.sin(th) - 0.22 * Math.cos(2 * th));
    }
    return h;
  }

  grad(x, y, t) {
    const e = 0.4;
    return [
      (this.height(x + e, y, t) - this.height(x - e, y, t)) / (2 * e),
      (this.height(x, y + e, t) - this.height(x, y - e, t)) / (2 * e),
    ];
  }

  wind(t) {
    const C = this.cond;
    const g = 1 + 0.22 * Math.sin(t * 0.37 + C.gustPh) + 0.12 * Math.sin(t * 1.3 + C.gustPh * 2);
    return { x: C.wx * g, y: C.wy * g, kn: C.windKn * g };
  }

  describe() {
    const C = this.cond, dir = C.windDir;
    const rel = Math.abs(dir) < 45 ? 'de popa' : Math.abs(dir) > 135 ? 'de proa' : dir > 0 ? 'de través, pelo lado do ama' : 'de través, pela direita';
    let s = 'Vento de ' + Math.round(C.windKn) + ' nós ' + rel + '. ';
    s += C.swell
      ? 'Ondulação de ' + (C.swell.A * 2.2).toFixed(1) + ' m indo para a praia, com mar de vento por cima.'
      : 'Mar de vento de ' + C.heightM.toFixed(1) + ' m a cada ' + C.period.toFixed(1) + ' s.';
    return s;
  }

  shortSwell() {
    const C = this.cond;
    return C.swell ? 'ondulação ' + (C.swell.A * 2.2).toFixed(1) + ' m p/ praia' : 'mar ' + C.heightM.toFixed(1) + ' m · ' + C.period.toFixed(1) + ' s';
  }
}
