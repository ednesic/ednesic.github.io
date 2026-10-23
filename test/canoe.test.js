import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/tracks/index.js';
import { startStroke, stepCanoe, HULI_ROLL } from '../src/canoe.js';
import { makeRng } from '../src/utils.js';
import { makeConditions, Sea } from '../src/sea.js';
import { calmSea, makeEnv, paddle, alternate, steer, newCanoe } from './helpers.js';

const kaiwi = TRACKS.find(t => t.id === 'kaiwi');
const speed = c => Math.hypot(c.vx, c.vy);

function run(type, seconds = 30) {
  const sea = calmSea(kaiwi);
  const c = newCanoe(0, 0);
  paddle(c, makeEnv(kaiwi, sea), seconds, alternate(type));
  return c;
}

test('remada média alternada chega a 11–16 km/h e segue reta', () => {
  const c = run('media');
  assert.ok(speed(c) > 3.0 && speed(c) < 4.5, `velocidade ${speed(c)}`);
  assert.ok(Math.abs(c.psi) < 0.2, `rumo ${c.psi}`);
});

test('a forte é mais rápida e cansa; a longa é mais lenta e economiza', () => {
  const media = run('media', 12), forte = run('forte', 12), longa = run('longa', 12);
  assert.ok(forte.y > media.y, 'forte anda mais');
  assert.ok(media.y > longa.y, 'longa anda menos');
  assert.ok(forte.st < media.st - 20, `stamina forte ${forte.st} x média ${media.st}`);
  assert.ok(longa.st > media.st, `stamina longa ${longa.st} x média ${media.st}`);
});

test('sem stamina a remada perde força', () => {
  const fresh = run('forte', 4);
  const tired = newCanoe(0, 0); tired.st = 0;
  paddle(tired, makeEnv(kaiwi, calmSea(kaiwi)), 4, alternate('forte'));
  assert.ok(tired.y < fresh.y * 0.85, `cansado ${tired.y} x descansado ${fresh.y}`);
  assert.ok(tired.st >= 0);
});

test('remada na esquerda vira a proa para a direita e vice-versa', () => {
  for (const [side, sign] of [[-1, 1], [1, -1]]) {
    const c = newCanoe(0, 0);
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    startStroke(c, side, 'media', 0);
    for (let t = 0; t < 1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    assert.equal(Math.sign(c.psi), sign);
  }
});

test('a diagonal vira bem mais que a média', () => {
  const turn = type => {
    const c = newCanoe(0, 0);
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    startStroke(c, -1, type, 0);
    for (let t = 0; t < 1.5; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.psi;
  };
  assert.ok(turn('diagonal') > turn('media') * 2.5);
});

test('não dá para remar antes de a pá sair da água', () => {
  const c = newCanoe(0, 0);
  assert.equal(startStroke(c, -1, 'longa', 0), true);
  assert.equal(startStroke(c, 1, 'longa', 0.2), false);
  assert.equal(startStroke(c, 1, 'longa', 0.6), true);
});

test('durante o huli a remada é recusada', () => {
  const c = newCanoe(0, 0);
  c.huliT = 2;
  assert.equal(startStroke(c, -1, 'media', 0), false);
});

test('vento vindo do lado do ama levanta o ama; vindo da direita, afunda', () => {
  const roll = wx => {
    const sea = calmSea(kaiwi);
    sea.cond.wx = wx; sea.cond.windKn = Math.abs(wx) / 0.5144;
    const c = newCanoe(0, 0);
    const env = makeEnv(kaiwi, sea);
    for (let t = 0; t < 5; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.roll;
  };
  assert.ok(roll(10) > 0.05, 'vento da esquerda levanta');
  assert.ok(roll(-10) < 0, 'vento da direita afunda');
});

test('passar do limite de inclinação dá huli', () => {
  const events = [];
  const c = newCanoe(0, 0);
  const env = makeEnv(kaiwi, calmSea(kaiwi), events);
  c.roll = HULI_ROLL; c.rollV = 1;
  stepCanoe(c, 1 / 60, 0, env);
  assert.equal(c.hulis, 1);
  assert.ok(events.some(e => e.name === 'huli'));
  for (let t = 0; t < 4; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(events.some(e => e.name === 'recovered'));
  assert.equal(c.huliT <= 0, true);
});

// One clean wave train travelling down the course.
function followingSea(A, L) {
  const sea = calmSea(kaiwi);
  const w = sea.cond.waves[0];
  const k = 2 * Math.PI / L, c = Math.sqrt(9.81 / k) * 0.75;
  sea.cond.waves = [{ ...w, dx: 0, dy: 1, k, c, w: k * c, A, L, ph: 0, dirDeg: 0 }];
  sea.cond.main = sea.cond.waves[0];
  return sea;
}

test('a onda por trás empurra a canoa: surfando passa da velocidade de remada', () => {
  const calm = newCanoe(0, 0);
  let maxCalm = 0, maxWave = 0;
  const envCalm = makeEnv(kaiwi, calmSea(kaiwi));
  const wavy = newCanoe(0, 0);
  const envWave = makeEnv(kaiwi, followingSea(0.7, 28));
  for (let t = 0, next = 0, i = 0; t < 60; t += 1 / 60) {
    if (t >= next) {
      const side = i % 2 ? 1 : -1;
      if (startStroke(calm, side, 'media', t)) { startStroke(wavy, side, 'media', t); i++; next = t + 0.38; }
    }
    stepCanoe(calm, 1 / 60, t, envCalm); stepCanoe(wavy, 1 / 60, t, envWave);
    maxCalm = Math.max(maxCalm, speed(calm)); maxWave = Math.max(maxWave, speed(wavy));
  }
  assert.ok(maxWave > maxCalm + 0.8, `com onda ${maxWave} x sem ${maxCalm}`);
});

test('a onda empurrando a popa de lado gira a canoa', () => {
  const sea = followingSea(0.7, 28);
  const c = newCanoe(0, 0);
  c.psi = 0.5; c.vx = Math.sin(0.5) * 4; c.vy = Math.cos(0.5) * 4;
  const env = makeEnv(kaiwi, sea);
  let maxR = 0;
  for (let t = 0; t < 10; t += 1 / 60) { stepCanoe(c, 1 / 60, t, env); maxR = Math.max(maxR, Math.abs(c.r)); }
  assert.ok(maxR > 0.05, `giro máximo ${maxR}`);
});

test('no Ka\'iwi acontece espetada e em Copacabana não', () => {
  const count = track => {
    let n = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const events = [];
      const c = newCanoe(0, 0);
      paddle(c, makeEnv(track, new Sea(track, makeConditions(track, makeRng(seed))), events), 90, steer('media'), { gapScale: 1.05 });
      assert.equal(events.filter(e => e.name === 'espetada').length, c.espetadas);
      n += c.espetadas;
    }
    return n;
  };
  assert.ok(count(kaiwi) > 0, 'Ka\'iwi tem espetada');
  assert.equal(count(TRACKS.find(t => t.id === 'copa')), 0, 'Copacabana não tem');
});
