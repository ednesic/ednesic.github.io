// Paddle stroke types.
// dur: seconds the blade is in the water. F: peak forward push (m/s²). cost: stamina per stroke.
// yaw: how hard it turns the canoe. brace: how much a stroke on the right side holds the ama down.
// gap: shortest time before the next stroke can start.
export const STROKES = {
  media:    { dur: 0.36, F: 3.0, cost: 2.4, yaw: 0.9, brace: 0.5,  gap: 0.36, name: 'Média' },
  forte:    { dur: 0.28, F: 4.8, cost: 5.2, yaw: 1.0, brace: 0.35, gap: 0.26, name: 'Forte' },
  longa:    { dur: 0.55, F: 2.4, cost: 1.3, yaw: 0.7, brace: 0.9,  gap: 0.5,  name: 'Longa' },
  diagonal: { dur: 0.42, F: 1.3, cost: 2.0, yaw: 3.4, brace: 0.25, gap: 0.4,  name: 'Diagonal' },
};
