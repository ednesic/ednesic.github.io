import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/utils.js';
import { makeConditions, Sea, seaState } from '../src/sea.js';
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

test('a onda não é uniforme: as ondas se somam em séries, com pontos bem maiores que outros', () => {
  for (const track of TRACKS) {
    const sea = new Sea(track, makeConditions(track, makeRng(9), { weather: 'nublado' }));
    // the highest crest in each 40 m stretch down a long line
    const peaks = [];
    for (let y0 = 0; y0 < 2000; y0 += 40) {
      let p = 0;
      for (let y = y0; y < y0 + 40; y++) p = Math.max(p, sea.height(0, y, 0));
      peaks.push(p);
    }
    const hi = Math.max(...peaks), lo = Math.min(...peaks);
    assert.ok(hi / lo > 1.8, `${track.id} cristas de ${lo.toFixed(2)} a ${hi.toFixed(2)} m`);
  }
});

test('onda comprida anda mais rápido: velocidade real de água funda', () => {
  const c = makeConditions(byId('kaiwi'), makeRng(2));
  for (const w of c.waves) assert.ok(Math.abs(w.c - 1.249 * Math.sqrt(w.L)) < 0.01, `L ${w.L.toFixed(1)} c ${w.c.toFixed(2)}`);
});

test('a água anda em círculos: para frente na crista, para trás no cavado', () => {
  const track = byId('kaiwi');
  const cond = makeConditions(track, makeRng(1), { weather: 'nublado' });
  const w = cond.waves[0];
  cond.waves = [{ ...w, dx: 0, dy: 1, ph: 0 }];
  const sea = new Sea(track, cond);
  const crest = Math.PI / 2 / w.k, trough = 3 * Math.PI / 2 / w.k;
  assert.ok(sea.flow(0, crest, 0)[1] > 0.9 * w.A * w.w, 'na crista vai com a onda');
  assert.ok(sea.flow(0, trough, 0)[1] < -0.9 * w.A * w.w, 'no cavado volta');
});

test('mais pista de vento (fetch) faz mar maior e mais comprido', () => {
  const short = seaState(10, 20e3), long = seaState(10, 150e3);
  assert.ok(long.Hs > short.Hs * 1.5 && long.wp < short.wp);
  assert.ok(seaState(10, 1e9).Hs <= 0.22 * 100 / 9.81 + 1e-9, 'nunca passa do mar totalmente formado');
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
