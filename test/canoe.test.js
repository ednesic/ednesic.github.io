import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/tracks/index.js';
import { startStroke, stepCanoe, setPlant, HULI_ROLL } from '../src/canoe.js';
import { makeRng } from '../src/utils.js';
import { makeConditions, Sea } from '../src/sea.js';
import { calmSea, makeEnv, paddle, alternate, steer, ride, newCanoe } from './helpers.js';

const kaiwi = TRACKS.find(t => t.id === 'kaiwi');
const speed = c => Math.hypot(c.vx, c.vy);

function run(type, seconds = 30) {
  const sea = calmSea(kaiwi);
  const c = newCanoe(0, 0);
  paddle(c, makeEnv(kaiwi, sea), seconds, alternate(type));
  return c;
}

// One clean wave train travelling down the course.
function followingSea(A, L) {
  const sea = calmSea(kaiwi);
  const w = sea.cond.waves[0];
  const k = 2 * Math.PI / L, c = Math.sqrt(9.81 / k) * 0.75;
  sea.cond.waves = [{ ...w, dx: 0, dy: 1, k, c, w: k * c, A, L, ph: 0, dirDeg: 0 }];
  sea.cond.main = sea.cond.waves[0];
  return sea;
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

test('a onda por trás empurra a canoa: surfando passa da velocidade de remada', () => {
  const calm = ride(newCanoe(0, 0), makeEnv(kaiwi, calmSea(kaiwi)), 60, 'media');
  const wavy = ride(newCanoe(0, 0), makeEnv(kaiwi, followingSea(0.7, 28)), 60, 'media');
  assert.ok(wavy.maxSpeed > calm.maxSpeed + 0.5, `com onda ${wavy.maxSpeed} x sem ${calm.maxSpeed}`);
});

test('espetada na esquerda vira a proa para a esquerda, na direita para a direita, e freia', () => {
  for (const side of [-1, 1]) {
    const c = newCanoe(0, 0); c.vy = 5;
    const glide = newCanoe(0, 0); glide.vy = 5;
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    setPlant(c, side);
    for (let t = 0; t < 1; t += 1 / 60) { stepCanoe(c, 1 / 60, t, env); stepCanoe(glide, 1 / 60, t, env); }
    assert.equal(Math.sign(c.psi), side);
    assert.ok(c.y < glide.y, 'anda menos que deslizando');
  }
});

test('a espetada morde mais rápido do que devagar', () => {
  const turn = v0 => {
    const c = newCanoe(0, 0); c.vy = v0;
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    setPlant(c, 1);
    for (let t = 0; t < 0.5; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.psi;
  };
  assert.ok(turn(6) > turn(2) * 3);
});

test('remar cancela a espetada e o huli também', () => {
  const c = newCanoe(0, 0);
  setPlant(c, -1);
  startStroke(c, 1, 'media', 0);
  assert.equal(c.plant, 0);
  c.huliT = 2; setPlant(c, 1);
  assert.equal(c.plant, 0);
});

test('no Ka\'iwi, só remando a onda atravessa a canoa; com espetada ela fica alinhada e anda mais', () => {
  const run = espetada => {
    let ang = 0, y = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const c = newCanoe(0, 0);
      ang += ride(c, makeEnv(kaiwi, new Sea(kaiwi, makeConditions(kaiwi, makeRng(seed)))), 90, 'media', { espetada }).meanSurfAngle;
      y += c.y;
    }
    return { ang: ang / 6, y: y / 6 };
  };
  const only = run(false), esp = run(true);
  assert.ok(only.ang > 0.3, `só remando fica torta: ${only.ang.toFixed(2)} rad`);
  assert.ok(esp.ang < only.ang * 0.6, `ângulo médio na onda: espetada ${esp.ang.toFixed(2)} x remada ${only.ang.toFixed(2)}`);
  assert.ok(esp.y > only.y, `distância: espetada ${esp.y.toFixed(0)} x remada ${only.y.toFixed(0)}`);
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

test('no Ka\'iwi a proa enterra às vezes e em Copacabana não', () => {
  const count = track => {
    let n = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const events = [];
      const c = newCanoe(0, 0);
      paddle(c, makeEnv(track, new Sea(track, makeConditions(track, makeRng(seed))), events), 90, steer('media'), { gapScale: 1.05 });
      assert.equal(events.filter(e => e.name === 'pearl').length, c.pearls);
      n += c.pearls;
    }
    return n;
  };
  assert.ok(count(kaiwi) > 0, 'Ka\'iwi tem proa enterrada');
  assert.equal(count(TRACKS.find(t => t.id === 'copa')), 0, 'Copacabana não tem');
});

test('a stroke refused for coming too early keeps the espetada', () => {
  const c = newCanoe(0, 0);
  assert.equal(startStroke(c, 1, 'media', 0), true);
  setPlant(c, -1);
  assert.equal(startStroke(c, -1, 'media', 0.1), false);
  assert.equal(c.plant, -1);
});
