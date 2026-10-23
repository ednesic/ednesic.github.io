// Small helpers shared by the simulation and the UI. Nothing here touches the DOM or three.js.

export const G = 9.81;
export const KN = 0.5144;  // knots to m/s

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const deg = d => d * Math.PI / 180;

export function fmt(s) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}

// Seeded generator (mulberry32) so tests and replays are repeatable. Without a seed it uses Math.random.
export function makeRng(seed) {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng, a, b) => a + rng() * (b - a);
