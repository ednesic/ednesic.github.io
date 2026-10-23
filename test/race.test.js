import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/tracks/index.js';
import { Race } from '../src/race.js';
import { startStroke } from '../src/canoe.js';
import { STROKES } from '../src/strokes.js';

// Plays the player's canoe with plain alternating medium strokes, steering back to the centre line.
function drive(race, maxSeconds = 600) {
  const me = race.me;
  let next = 0;
  for (let i = 0; i < maxSeconds * 60 && race.finishT === null; i++) {
    if (race.count <= 0 && race.t >= next) {
      const err = me.psi - Math.max(-0.4, Math.min(0.4, -me.x * 0.03));
      let side = -me.lastSide || 1, type = 'media';
      if (err > 0.06) side = 1; else if (err < -0.06) side = -1;
      if (Math.abs(err) > 0.35) type = 'diagonal';
      next = race.t + (startStroke(me, side, type, race.t) ? STROKES[type].gap * 1.08 : 0.03);
    }
    race.update(1 / 60);
  }
}

for (const track of TRACKS) {
  test(`${track.name}: a corrida termina e os rivais chegam num tempo plausível`, () => {
    const events = [];
    const race = new Race(track, { seed: 11, weather: 'nublado', onEvent: name => events.push(name) });
    drive(race);
    assert.notEqual(race.finishT, null, 'jogador chegou');
    assert.ok(events.includes('go') && events.includes('finish'));
    const avgKmh = track.len / race.finishT * 3.6;
    assert.ok(avgKmh > 9 && avgKmh < 18, `média ${avgKmh.toFixed(1)} km/h`);
    for (const r of race.rivals) {
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), `${r.name} sem NaN`);
      assert.ok(r.y > track.len * 0.75, `${r.name} perto da chegada (${r.y.toFixed(0)} m)`);
    }
  });
}

test('a mesma semente repete a mesma corrida', () => {
  const run = () => { const r = new Race(TRACKS[1], { seed: 5 }); drive(r, 60); return r.rivals.map(c => c.y.toFixed(6)).join(','); };
  assert.equal(run(), run());
});

test('a contagem segura todo mundo na largada', () => {
  const race = new Race(TRACKS[0], { seed: 2 });
  assert.equal(startStroke(race.me, -1, 'media', 0) && race.count > 0, true);
  for (let i = 0; i < 60 * 3; i++) race.update(1 / 60);
  assert.ok(race.canoes.every(c => c.y <= 0.01), 'ninguém sai antes do Imua');
});

test('sol forte cansa: a mesma largada fica mais lenta que no nublado', () => {
  const time = weather => { const r = new Race(TRACKS[1], { seed: 5, weather }); drive(r); return r.finishT; };
  const sun = time('sol'), cloud = time('nublado');
  assert.ok(sun > cloud * 1.05, `sol ${sun.toFixed(1)} s, nublado ${cloud.toFixed(1)} s`);
});

// Same seed and same inputs give exactly the same race, every canoe to the last bit. Replays and a
// future online race (each player simulating the same start) depend on it.
test('a seeded race replays exactly', () => {
  const run = () => {
    const race = new Race(TRACKS[2], { seed: 42 });
    for (let i = 0; i < 60 * 40; i++) {
      if (i % 50 === 0) startStroke(race.me, i % 100 ? 1 : -1, i % 300 ? 'media' : 'forte', race.t);
      race.update(1 / 60);
    }
    return race.canoes.map(c => [c.x, c.y, c.psi, c.vx, c.vy, c.roll, c.st, c.hulis]);
  };
  assert.deepEqual(run(), run());
});

test('o trajeto de cada canoa fica gravado da largada à chegada, com a velocidade máxima', () => {
  const race = new Race(TRACKS[0], { seed: 11, weather: 'nublado' });
  drive(race);
  for (let i = 0; i < 60 * 120; i++) race.coast(1 / 60);
  for (const a of race.standings()) {
    const { pts, top, topAt } = a.trail;
    assert.ok(pts.length > 100, `${a.name}: ${pts.length} pontos`);
    assert.ok(pts[0][0] < 5 && pts.at(-1)[0] >= TRACKS[0].len - 0.5, `${a.name} vai da largada à chegada`);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] > pts[i - 1][0] - 2, `${a.name} anda para a frente`);
    assert.ok(top >= Math.max(...pts.map(p => p[2])) && top < 12, `${a.name}: máx ${top.toFixed(2)} m/s`);
    assert.ok(topAt[0] > 0 && topAt[0] <= TRACKS[0].len + 5);
  }
});
