import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/utils.js';
import { makeConditions, Sea } from '../src/sea.js';
import { TRACKS } from '../src/tracks/index.js';
import { WEATHER } from '../src/weather.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const byId = id => TRACKS.find(t => t.id === id);

test('vento sorteado fica dentro da faixa de cada pista', () => {
  for (const track of TRACKS) for (const seed of SEEDS) {
    const c = makeConditions(track, makeRng(seed));
    assert.ok(c.windKn >= track.wind.kn[0] && c.windKn <= track.wind.kn[1], `${track.id} vento ${c.windKn}`);
    assert.ok(c.windDir >= track.wind.dir[0] && c.windDir <= track.wind.dir[1], `${track.id} direção ${c.windDir}`);
  }
});

test('o mar de vento segue a direção do vento', () => {
  for (const track of TRACKS) for (const seed of SEEDS) {
    const c = makeConditions(track, makeRng(seed));
    assert.ok(Math.abs(c.waves[0].dirDeg - c.windDir) <= 10, `${track.id} onda ${c.waves[0].dirDeg} vento ${c.windDir}`);
  }
});

test('mais vento faz mar maior', () => {
  const track = byId('kaiwi');
  const all = SEEDS.map(s => makeConditions(track, makeRng(s))).sort((a, b) => a.windKn - b.windKn);
  const avg = list => list.reduce((s, c) => s + c.waves[0].A, 0) / list.length;
  assert.ok(avg(all.slice(-10)) > avg(all.slice(0, 10)) * 1.2);
});

test('pistas mais difíceis têm mais vento e mar maior', () => {
  const mean = (track, f) => SEEDS.reduce((s, seed) => s + f(makeConditions(track, makeRng(seed))), 0) / SEEDS.length;
  const [copa, hawaiki, kaiwi] = ['copa', 'hawaiki', 'kaiwi'].map(byId);
  assert.ok(mean(kaiwi, c => c.windKn) > mean(hawaiki, c => c.windKn));
  assert.ok(mean(hawaiki, c => c.windKn) > mean(copa, c => c.windKn));
  assert.ok(mean(kaiwi, c => c.waves[0].A) > mean(copa, c => c.waves[0].A));
});

test('em Copacabana a ondulação anda em direção à praia e cresce perto dela', () => {
  const track = byId('copa');
  for (const seed of SEEDS) {
    const c = makeConditions(track, makeRng(seed));
    assert.ok(c.swell, 'tem ondulação');
    const swell = c.waves.find(w => w.shoal);
    assert.equal(Math.sign(swell.dx), track.shore.side, 'anda para o lado da praia');
  }
  const sea = new Sea(track, makeConditions(track, makeRng(3)));
  assert.equal(sea.shoal(100), 1);
  assert.ok(sea.shoal(track.shore.x + 20) > 2);
});

test('pistas sem praia não têm ondulação de fundo', () => {
  for (const id of ['hawaiki', 'kaiwi']) {
    const c = makeConditions(byId(id), makeRng(5));
    assert.equal(c.swell, null);
    assert.ok(c.waves.every(w => !w.shoal));
  }
});

test('a mesma semente gera o mesmo mar', () => {
  const track = byId('kaiwi');
  const a = new Sea(track, makeConditions(track, makeRng(42)));
  const b = new Sea(track, makeConditions(track, makeRng(42)));
  for (const [x, y, t] of [[0, 0, 0], [12.5, 300, 17.2], [-40, 800, 99]]) assert.equal(a.height(x, y, t), b.height(x, y, t));
});

test('o gradiente bate com a diferença de alturas', () => {
  const track = byId('kaiwi');
  const sea = new Sea(track, makeConditions(track, makeRng(9)));
  const [gx, gy] = sea.grad(3, 50, 10);
  const e = 0.01;
  assert.ok(Math.abs(gx - (sea.height(3 + e, 50, 10) - sea.height(3 - e, 50, 10)) / (2 * e)) < 0.02);
  assert.ok(Math.abs(gy - (sea.height(3, 50 + e, 10) - sea.height(3, 50 - e, 10)) / (2 * e)) < 0.02);
});

test('o tempo é sorteado e às vezes chove, às vezes faz sol', () => {
  for (const track of TRACKS) {
    const seen = new Set(SEEDS.map(s => makeConditions(track, makeRng(s)).weather.id));
    for (const id of Object.keys(WEATHER)) assert.ok(seen.has(id), `${track.id} sem ${id}`);
  }
});

test('a chuva deixa o mar maior e mais mexido', () => {
  const track = byId('hawaiki');
  for (const seed of SEEDS.slice(0, 10)) {
    const dry = makeConditions(track, makeRng(seed), { weather: 'sol' });
    const wet = makeConditions(track, makeRng(seed), { weather: 'chuva' });
    assert.ok(wet.waves[0].A > dry.waves[0].A * 1.25, 'mar de vento maior');
    assert.ok(wet.waves.length > dry.waves.length, 'marola cruzada');
  }
});

test('a onda não é uniforme: há pontos e séries com ondas bem maiores que outras', () => {
  for (const track of TRACKS) {
    const sea = new Sea(track, makeConditions(track, makeRng(9), { weather: 'nublado' }));
    let lo = Infinity, hi = 0;
    for (let x = -80; x <= 80; x += 10) for (let y = 0; y <= 600; y += 10) {
      const e = sea.envelope(x, y, 0);
      lo = Math.min(lo, e); hi = Math.max(hi, e);
    }
    assert.ok(hi / lo > 1.8, `${track.id} envelope ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  }
});

test('condições escolhidas na largada: sem vento e mar liso ficam paradas; forte e grande passam do sorteado', () => {
  const kaiwi = TRACKS.find(t => t.id === 'kaiwi');
  const calm = makeConditions(kaiwi, makeRng(4), { wind: 'sem', sea: 'liso', weather: 'nublado' });
  assert.equal(calm.windKn, 0);
  assert.ok(calm.waves.every(w => w.A === 0));
  const sea = new Sea(kaiwi, calm);
  assert.equal(sea.height(10, 30, 5), 0);
  assert.equal(sea.wind(5, 10, 30).kn, 0);
  assert.match(sea.describe(), /Sem vento.*Mar liso/);
  const rolled = makeConditions(kaiwi, makeRng(4));
  const big = makeConditions(kaiwi, makeRng(4), { wind: 'forte', sea: 'grande' });
  assert.ok(big.windKn > kaiwi.wind.kn[1] && big.heightM > rolled.heightM);
  const calmo = makeConditions(kaiwi, makeRng(4), { sea: 'calmo' });
  assert.ok(calmo.heightM < rolled.heightM * 0.5);
});
