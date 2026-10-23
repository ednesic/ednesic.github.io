// Weather for one start. Sun drains the paddler; rain brings a rougher, confused sea and gustier wind.
// cost scales the stamina each stroke spends, regen how fast it comes back.
export const WEATHER = {
  sol: { id: 'sol', label: 'Sol forte', icon: '☀', cost: 1.12, regen: 0.85, sea: 1, chop: 0, gust: 1 },
  nublado: { id: 'nublado', label: 'Nublado', icon: '☁', cost: 1, regen: 1, sea: 1, chop: 0, gust: 1 },
  chuva: { id: 'chuva', label: 'Chuva', icon: '☂', cost: 1, regen: 1, sea: 1.35, chop: 1, gust: 1.8 },
};

// odds: { sol, nublado, chuva } weights from the track
export function rollWeather(odds, rng) {
  const total = odds.sol + odds.nublado + odds.chuva;
  let r = rng() * total;
  for (const id of ['sol', 'nublado', 'chuva']) {
    if ((r -= odds[id]) < 0) return WEATHER[id];
  }
  return WEATHER.chuva;
}
