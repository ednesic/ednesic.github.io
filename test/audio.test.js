import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mix, listen } from '../src/audio/mix.js';
import { Race } from '../src/race.js';
import { TRACKS } from '../src/tracks/index.js';

const base = { mode: 'race', speed: 0, surf: 0, kn: 10, windPan: 0, seaM: 1, rise: 0, plant: 0, st: 100, huli: false, tilt: 0, rain: false, shoreM: Infinity, reef: false };

test('the hull rushes louder and higher the faster the canoe runs, and roars on a wave', () => {
  const slow = mix({ ...base, speed: 2 }), fast = mix({ ...base, speed: 6 }), surf = mix({ ...base, speed: 6, surf: 1 });
  assert.ok(fast.rush.gain > slow.rush.gain && fast.rush.freq > slow.rush.freq);
  assert.equal(slow.roar.gain, 0);
  assert.ok(surf.roar.gain > 0.15 && surf.rush.gain > fast.rush.gain);
});

test('the wind grows with its speed and comes from its side', () => {
  assert.ok(mix({ ...base, kn: 25 }).wind.gain > mix({ ...base, kn: 8 }).wind.gain);
  assert.equal(mix({ ...base, kn: 10 }).whistle.gain, 0);
  assert.ok(mix({ ...base, windPan: 1 }).wind.pan > 0);
});

test('the espetada is heard only while planted, on its side, louder with speed', () => {
  assert.equal(mix(base).plant.gain, 0);
  const l = mix({ ...base, plant: -1, speed: 2 }), r = mix({ ...base, plant: 1, speed: 6 });
  assert.ok(l.plant.pan < 0 && r.plant.pan > 0 && r.plant.gain > l.plant.gain);
  assert.equal(mix({ ...base, plant: 1, mode: 'menu' }).plant.gain, mix({ ...base, plant: 1 }).plant.gain);
});

test('a huli muffles everything, rain and shore come and go, breathing starts when tired', () => {
  assert.ok(mix({ ...base, huli: true }).muffle < 1000 && mix(base).muffle > 10000);
  assert.equal(mix(base).rain.gain, 0);
  assert.ok(mix({ ...base, rain: true }).rain.gain > 0);
  assert.equal(mix(base).shore.gain, 0);
  assert.ok(mix({ ...base, shoreM: 50 }).shore.gain > mix({ ...base, shoreM: 250 }).shore.gain);
  assert.equal(mix(base).breath, 0);
  const tired = mix({ ...base, st: 5 }), puffing = mix({ ...base, st: 30 });
  assert.ok(tired.breath > 0 && tired.breath < puffing.breath && tired.breathGain > puffing.breathGain);
});

test('listen reads a real race on every track', () => {
  for (const t of TRACKS) {
    const race = new Race(t, { seed: 3 });
    race.update(0.5);
    const s = listen(race);
    assert.ok(Number.isFinite(s.speed) && Number.isFinite(s.kn) && Number.isFinite(s.rise) && Math.abs(s.windPan) <= 1);
    const m = mix(s);
    for (const k of ['sea', 'lap', 'rush', 'roar', 'wind', 'whistle', 'rain', 'plant', 'shore']) assert.ok(Number.isFinite(m[k].gain) && m[k].gain >= 0, k);
  }
});
