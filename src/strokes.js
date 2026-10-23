// Paddle stroke types, at a real V1 race cadence (about 55 to 95 strokes a minute).
// dur: seconds the blade is in the water. F: peak forward push (m/s²). cost: stamina per stroke.
// yaw: how hard it turns the canoe. brace: how much a stroke on the right side holds the ama down.
// gap: shortest time before the next stroke can start (catch to catch).
// vfull, vmax: canoe speeds (m/s) up to which the blade pushes fully, and past which the paddler's
// arms can no longer pull it faster than the water already runs by (no push at all).
export const STROKES = {
  media:    { dur: 0.55, F: 4.6, cost: 5.6,  yaw: 1.4, brace: 0.5,  gap: 0.85, vfull: 4.0, vmax: 6.5, name: 'Média' },
  forte:    { dur: 0.45, F: 7.1, cost: 12.4, yaw: 1.5, brace: 0.35, gap: 0.62, vfull: 4.6, vmax: 7.2, name: 'Forte' },
  longa:    { dur: 0.8,  F: 3.6, cost: 2.9,  yaw: 1.05, brace: 0.9, gap: 1.1,  vfull: 4.0, vmax: 6.2, name: 'Longa' },
  diagonal: { dur: 0.6,  F: 1.8, cost: 7.0,  yaw: 4.8, brace: 0.25, gap: 0.8,  vfull: 3.5, vmax: 6.0, name: 'Diagonal' },
};

// Share of the stroke's push that still bites at forward speed u: 1 up to vfull, 0 from vmax.
export const strokeBite = (P, u) => Math.min(1, Math.max(0, (P.vmax - u) / (P.vmax - P.vfull)));

// Stamina a stroke takes at forward speed u, as a share of its cost: getting a still canoe moving
// is heavy (up to 1.5x), at cruise it is the listed cost, and on a fast wave the blade just passes
// through the water and takes little (down to 0.3x).
export const strokeEffort = (P, u) => (1 + 0.5 * Math.max(0, 1 - u / 3)) * (0.3 + 0.7 * strokeBite(P, u));

// A stroke pressed this early (seconds before the last one allows the next) waits for its turn
// instead of being refused, so a steady rhythm never drops a stroke.
export const QUEUE_WINDOW = 0.3;

// Force over the stroke, ph from 0 (catch) to 1 (exit): a quick bite at the catch,
// the peak in the first half and a long taper as the blade passes the hip.
export const strokeProfile = ph => Math.sin(Math.PI * Math.pow(ph, 0.7));
