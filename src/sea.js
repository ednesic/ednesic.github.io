// The sea: wind and the sum of waves for one race. Pure functions of position and time, shared by the
// physics and the renderer so what you see is exactly what pushes the canoe.
import { G, KN, clamp, deg, range } from './utils.js';
import { WEATHER, rollWeather } from './weather.js';

// Rolls wind, waves and weather for one start. The wind sea always follows the wind's direction and grows with its speed.
// force.weather picks the weather ('sol', 'nublado', 'chuva') instead of rolling it.
export function makeConditions(track, rng, force = {}) {
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
  const gustPh = rng() * 10;

  // rain stirs up the wind sea and adds a short, confused chop from all sides
  const rolled = rollWeather(track.weather, rng);
  const weather = WEATHER[force.weather] || rolled;
  for (const w of waves) if (!w.shoal) w.A *= weather.sea;
  if (weather.chop) {
    for (let i = 0; i < 2; i++) add(windDir + range(rng, -110, 110), seaL * range(rng, 0.18, 0.3), seaA * 0.22, false);
    waves[waves.length - 1].chop = waves[waves.length - 2].chop = true;
  }

  // Waves come in sets and the crests are not the same height all along: a slow envelope
  // travels with the main wave at its group speed (half the wave speed) and varies across the crest.
  const groups = {
    k: 2 * Math.PI / (main.L * range(rng, 5, 8)), ph: rng() * 6.28, A: range(rng, 0.3, 0.45),
    kc: 2 * Math.PI / range(rng, 70, 130), phc: rng() * 6.28, Ac: range(rng, 0.25, 0.4),
    dx: main.dx, dy: main.dy, cg: main.c / 2,
  };

  return {
    windKn, windDir,
    wx: Math.sin(deg(windDir)) * windKn * KN, wy: Math.cos(deg(windDir)) * windKn * KN,
    waves, swell, main, weather, groups,
    heightM: main.A * 2 * 1.1,
    setM: main.A * 2 * 1.1 * (1 + groups.A + groups.Ac),
    period: main.L / main.c,
    gustPh,
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

  // How big the waves are here compared with the average: above 1 inside a set or a peak, below in a lull.
  envelope(x, y, t) {
    const g = this.cond.groups;
    if (!g) return 1;
    const along = g.dx * x + g.dy * y, across = g.dy * x - g.dx * y;
    const e = 1 + g.A * Math.sin(g.k * (along - g.cg * t) + g.ph) + g.Ac * Math.sin(g.kc * across + g.phc);
    return Math.max(0.3, e);
  }

  height(x, y, t) {
    const env = this.envelope(x, y, t);
    let h = 0;
    for (const w of this.cond.waves) {
      const th = w.k * (w.dx * x + w.dy * y) - w.w * t + w.ph;
      let a = w.shoal ? w.A * this.shoal(x) : w.A;
      if (!w.chop) a *= env;
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
    const gust = C.weather ? C.weather.gust : 1;
    const g = 1 + gust * (0.22 * Math.sin(t * 0.37 + C.gustPh) + 0.12 * Math.sin(t * 1.3 + C.gustPh * 2));
    return { x: C.wx * g, y: C.wy * g, kn: C.windKn * g };
  }

  describe() {
    const C = this.cond, dir = C.windDir;
    const rel = Math.abs(dir) < 45 ? 'de popa' : Math.abs(dir) > 135 ? 'de proa' : dir > 0 ? 'de través, pelo lado do ama' : 'de través, pela direita';
    let s = C.weather.label + '. Vento de ' + Math.round(C.windKn) + ' nós ' + rel + '. ';
    s += C.swell
      ? 'Ondulação de ' + (C.swell.A * 2.2).toFixed(1) + ' m indo para a praia, com mar de vento por cima.'
      : 'Mar de vento de ' + C.heightM.toFixed(1) + ' m a cada ' + C.period.toFixed(1) + ' s.';
    s += ' Nas séries, ondas de até ' + C.setM.toFixed(1) + ' m.';
    if (C.weather.id === 'sol') s += ' O sol cansa mais.';
    if (C.weather.id === 'chuva') s += ' A chuva deixa o mar mexido e o vento com rajadas.';
    return s;
  }

  shortSwell() {
    const C = this.cond;
    return C.weather.icon + ' ' + C.weather.label.toLowerCase() + ' · ' + (C.swell ? 'ondulação ' + (C.swell.A * 2.2).toFixed(1) + ' m p/ praia' : 'mar ' + C.heightM.toFixed(1) + ' m · ' + C.period.toFixed(1) + ' s');
  }
}
