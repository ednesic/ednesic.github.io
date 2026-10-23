// The sea: wind and the sum of waves for one race. Pure functions of position and time, shared by the
// physics and the renderer so what you see is exactly what pushes the canoe.
import { G, KN, clamp, deg, range } from './utils.js';
import { WEATHER, rollWeather } from './weather.js';

// Rolls wind, waves and weather for one start. The wind sea always follows the wind's direction and grows with its speed
// and with the track's fetch.
// force.weather picks the weather ('sol', 'nublado', 'chuva') instead of rolling it.
// gust patches: strength (share of the wind) and wavenumbers along and across the wind (rad/m)
export const GUST_PATCH = 0.25, GUST_K = [0.025, 0.03];

// force: { weather, wind, sea } picked on the start screen; anything left out is rolled.
// wind: 'sem' | 'fraco' | 'forte'; sea: 'liso' | 'calmo' | 'grande'.
export const WIND_PICK = { sem: () => 0, fraco: kn => Math.max(3, kn[0] * 0.6), forte: kn => kn[1] * 1.25 };
export const SEA_PICK = { liso: 0, calmo: 0.35, grande: 1.4 };

// The wind sea is built from the JONSWAP spectrum: the wind's speed and the fetch (the stretch of open
// water it has blown over) set how big the sea is and its peak period, and the sea is the sum of
// SEA_PARTS waves drawn from that spectrum, each with its real speed (long waves run faster). Sets
// are not imposed: they come from these waves adding up and cancelling as they run at different speeds.
export const SEA_PARTS = 7;

// Significant wave height (m) and peak angular frequency (rad/s) for wind U (m/s) over fetch F (m):
// the fetch-limited JONSWAP fit, capped by the fully developed sea (Pierson-Moskowitz).
export function seaState(U, F) {
  if (U <= 0) return { Hs: 0, wp: 2 };
  const Hs = Math.min(1.6e-3 * U * Math.sqrt(F / G), 0.22 * U * U / G);
  const wp = Math.max(22 * Math.cbrt(G * G / (U * F)), 0.877 * G / U);
  return { Hs, wp };
}

// JONSWAP spectral shape (unscaled) at angular frequency w for peak wp.
function jonswap(w, wp) {
  const sg = w <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - wp) ** 2) / (2 * sg * sg * wp * wp));
  return Math.pow(w, -5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * Math.pow(3.3, r);
}

export function makeConditions(track, rng, force = {}) {
  const rolledKn = range(rng, track.wind.kn[0], track.wind.kn[1]);
  const windKn = WIND_PICK[force.wind] ? WIND_PICK[force.wind](track.wind.kn) : rolledKn;
  const windDir = range(rng, track.wind.dir[0], track.wind.dir[1]);
  const waves = [];
  // deep water: w² = g k, so a wave's speed is set by its length (c = 1.25 √L m/s)
  const add = (dirDeg, w, A, shoal) => {
    const k = w * w / G, c = w / k, L = 2 * Math.PI / k;
    waves.push({ dx: Math.sin(deg(dirDeg)), dy: Math.cos(deg(dirDeg)), k, c, w, A, ph: rng() * 6.28, shoal, L, dirDeg });
  };
  // with the wind dropped the sea it raised is still there, a little smaller
  const seaU = (windKn > 0 ? windKn : track.wind.kn[0] * 0.8) * KN;
  const { Hs, wp } = seaState(seaU, track.sea.fetch * 1000);
  // frequencies from just under the peak to well above it, one per band, jittered inside it so
  // the sum never repeats; amplitudes follow the spectrum and are scaled to the sea's height
  const lo = 0.8 * wp, hi = 2.6 * wp, parts = [];
  for (let i = 0; i < SEA_PARTS; i++) {
    const a = lo * Math.pow(hi / lo, i / SEA_PARTS), b = lo * Math.pow(hi / lo, (i + 1) / SEA_PARTS);
    const w = a + (b - a) * range(rng, 0.25, 0.75);
    parts.push({ w, e: jonswap(w, wp) * (b - a) });
  }
  const m0 = parts.reduce((s, p) => s + p.e, 0);
  // Hs = 4 √m0 and each wave holds m0 share e: its amplitude is √(2 e)
  const scale = (Hs / 4) ** 2 / m0;
  parts.sort((p, q) => q.e - p.e);
  // the waves spread around the wind, the shorter ones more: ±10° for the biggest, up to ±45°
  parts.forEach((p, i) => {
    const spread = i === 0 ? 8 : 18 + 27 * clamp((p.w / wp - 1) / 1.5, 0, 1);
    add(windDir + (rng() + rng() - 1) * spread, p.w, Math.sqrt(2 * p.e * scale), false);
  });
  let swell = null;
  if (track.swell) {
    swell = { A: range(rng, track.swell.A[0], track.swell.A[1]), L: range(rng, track.swell.L[0], track.swell.L[1]), dir: range(rng, track.swell.dir[0], track.swell.dir[1]) };
    // a swell from far away is a narrow band: three close periods, so it arrives in sets
    const w0 = Math.sqrt(G * 2 * Math.PI / swell.L);
    [[1, 0.64], [1.06, 0.55], [0.95, 0.45]].forEach(([f, s]) => add(swell.dir + range(rng, -4, 4), w0 * f, swell.A * s * 1.15, true));
  }
  const main = waves[track.swell ? SEA_PARTS : 0];
  const gustPh = rng() * 10;

  // rain stirs up the wind sea and adds a short, confused chop from all sides
  const rolled = rollWeather(track.weather, rng);
  const weather = WEATHER[force.weather] || rolled;
  for (const w of waves) if (!w.shoal) w.A *= weather.sea;
  if (weather.chop) {
    for (let i = 0; i < 2; i++) add(windDir + range(rng, -110, 110), wp * range(rng, 2.2, 2.8), Hs * 0.1, false);
    waves[waves.length - 1].chop = waves[waves.length - 2].chop = true;
  }
  if (force.sea in SEA_PICK) for (const w of waves) w.A *= SEA_PICK[force.sea];

  const sum = Math.sqrt(waves.filter(w => !w.shoal).reduce((s, w) => s + w.A * w.A / 2, 0));
  return {
    windKn, windDir,
    wx: Math.sin(deg(windDir)) * windKn * KN, wy: Math.cos(deg(windDir)) * windKn * KN,
    waves, swell, main, weather, groups: null,
    heightM: track.swell ? main.A * 2 * 1.1 : 4 * sum,
    // the biggest of a few hundred waves is about 1.6 times the significant height
    setM: (track.swell ? main.A * 2 * 1.1 : 4 * sum) * 1.6,
    period: 2 * Math.PI / main.w,
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

  // over: a hull length (m) to see only the waves long enough to swing a hull that long; shorter
  // ones lift one part and drop another under it, and their pushes cancel along it
  height(x, y, t, over = 0) {
    const env = this.envelope(x, y, t);
    let h = 0;
    for (const w of this.cond.waves) {
      const th = w.k * (w.dx * x + w.dy * y) - w.w * t + w.ph;
      let a = w.shoal ? w.A * this.shoal(x) : w.A;
      if (over) a *= clamp(w.L / over - 1, 0, 1);
      if (!w.chop) a *= env;
      // second-order Stokes wave: the steeper it is, the sharper its crests and the flatter its troughs
      h += a * (Math.sin(th) - Math.min(0.3, 0.5 * w.k * a) * Math.cos(2 * th));
    }
    return h;
  }

  // Velocity (m/s) of the water at the surface: each wave turns the water in circles of its own
  // amplitude, forward under the crest and back in the trough, at a × ω.
  flow(x, y, t, over = 0) {
    const env = this.envelope(x, y, t);
    let ux = 0, uy = 0;
    for (const w of this.cond.waves) {
      const th = w.k * (w.dx * x + w.dy * y) - w.w * t + w.ph;
      let a = w.shoal ? w.A * this.shoal(x) : w.A;
      if (over) a *= clamp(w.L / over - 1, 0, 1);
      if (!w.chop) a *= env;
      const s = a * w.w * Math.sin(th);
      ux += s * w.dx; uy += s * w.dy;
    }
    return [ux, uy];
  }

  grad(x, y, t, over = 0) {
    const e = 0.4;
    return [
      (this.height(x + e, y, t, over) - this.height(x - e, y, t, over)) / (2 * e),
      (this.height(x, y + e, t, over) - this.height(x, y - e, t, over)) / (2 * e),
    ];
  }

  // Wind at (x, y): the whole course breathes in and out, and on top of that gust patches about
  // a hundred metres across sweep downwind at the wind's speed. The water shader draws the same patches.
  wind(t, x = 0, y = 0) {
    const C = this.cond;
    const gust = C.weather ? C.weather.gust : 1;
    let g = 1 + gust * (0.15 * Math.sin(t * 0.37 + C.gustPh) + 0.08 * Math.sin(t * 1.3 + C.gustPh * 2));
    g += gust * GUST_PATCH * this.gustPatch(x, y, t);
    return { x: C.wx * g, y: C.wy * g, kn: C.windKn * g };
  }

  // -1..1: where the gust patches are, travelling with the wind
  gustPatch(x, y, t) {
    const C = this.cond, s = Math.hypot(C.wx, C.wy) || 1, ux = C.wx / s, uy = C.wy / s;
    const a = x * ux + y * uy, c = -x * uy + y * ux;
    return Math.sin((a - s * t) * GUST_K[0] + C.gustPh) * Math.sin(c * GUST_K[1] + C.gustPh * 3);
  }

  describe() {
    const C = this.cond, dir = C.windDir;
    const rel = Math.abs(dir) < 45 ? 'de popa' : Math.abs(dir) > 135 ? 'de proa' : dir > 0 ? 'de través, pelo lado do ama' : 'de través, pela direita';
    let s = C.weather.label + '. ' + (C.windKn < 0.5 ? 'Sem vento. ' : 'Vento de ' + Math.round(C.windKn) + ' nós ' + rel + '. ');
    if (C.heightM < 0.05) return s + 'Mar liso.';
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
    return C.weather.icon + ' ' + C.weather.label.toLowerCase() + ' · ' + (C.heightM < 0.05 ? 'mar liso' : C.swell ? 'ondulação ' + (C.swell.A * 2.2).toFixed(1) + ' m p/ praia' : 'mar ' + C.heightM.toFixed(1) + ' m · ' + C.period.toFixed(1) + ' s');
  }
}
