import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/tracks/index.js';
import { startStroke, stepCanoe, setPlant, HULI_ROLL, bump, contact, AMA_X } from '../src/canoe.js';
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

test('remada média alternada chega a 11–16 km/h', () => {
  const c = run('media');
  assert.ok(speed(c) > 3.0 && speed(c) < 4.5, `velocidade ${speed(c)}`);
});

test('o arrasto do ama puxa a proa para a esquerda; remando mais do lado do ama ela segue reta', () => {
  const even = run('media');
  assert.ok(even.psi < -0.3, `alternando igual, abre para a esquerda: rumo ${even.psi.toFixed(2)}`);
  const c = newCanoe(0, 0);
  paddle(c, makeEnv(kaiwi, calmSea(kaiwi)), 30, steer('media'));
  assert.ok(Math.abs(c.psi) < 0.2, `corrigindo, segue reta: rumo ${c.psi.toFixed(2)}`);
});

test('o ama freia mais apoiado na água e quase nada quando levanta', () => {
  const glide = roll => {
    const c = newCanoe(0, 0); c.vy = 4;
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    for (let t = 0; t < 0.5; t += 1 / 60) { c.roll = roll; c.rollV = 0; stepCanoe(c, 1 / 60, t, env); }
    return c.y;
  };
  assert.ok(glide(0.3) > glide(0) && glide(0) > glide(-0.1));
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

test('em velocidade de cruzeiro uma remada só corrige uns poucos graus; parada, vira mais', () => {
  // heading after one extra stroke on the left, against the same run without it (the ama keeps pulling)
  const heading = (cruise, extra) => {
    const c = newCanoe(0, 0);
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    let t = 0;
    if (cruise) for (let i = 0; i < 12; i++) { startStroke(c, i % 2 ? 1 : -1, 'media', t); for (let k = 0; k < 51; k++, t += 1 / 60) stepCanoe(c, 1 / 60, t, env); }
    if (extra) startStroke(c, -1, 'media', t);
    // the canoe keeps swinging after the stroke, so measure once the swing has died out
    for (let k = 0; k < 300; k++, t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.psi * 180 / Math.PI;
  };
  const turn = cruise => heading(cruise, true) - heading(cruise, false);
  const cruise = turn(true), still = turn(false);
  assert.ok(cruise > 2 && cruise < 9, `uma remada a 14 km/h vira ${cruise.toFixed(1)}°`);
  assert.ok(still > cruise * 1.5, `parada vira ${still.toFixed(1)}° x ${cruise.toFixed(1)}° andando`);
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
  assert.equal(startStroke(c, 1, 'longa', 1.15), true);
});

test('remada um pouco adiantada entra na fila e sai na hora certa', () => {
  const c = newCanoe(0, 0);
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  const events = [];
  env.emit = (cc, name, d) => events.push(name);
  assert.equal(startStroke(c, -1, 'media', 0), true);
  assert.equal(startStroke(c, 1, 'media', 0.7), 'queued');
  let t = 0.7;
  while (t < 0.84) { stepCanoe(c, 1 / 120, t, env); t += 1 / 120; }
  assert.equal(c.lastSide, -1, 'ainda não saiu');
  while (t < 0.9) { stepCanoe(c, 1 / 120, t, env); t += 1 / 120; }
  assert.equal(c.lastSide, 1, 'saiu quando a anterior liberou');
  assert.ok(events.includes('stroke'));
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

test('espetada trava o giro: a onda empurrando a proa é segurada pela pá do lado oposto e freia', () => {
  for (const side of [-1, 1]) {
    // a swing toward `side`, like a wave on the stern, held by planting on the other side
    const run = plant => {
      const c = newCanoe(0, 0); c.vy = 5; c.r = side * 0.3;
      const env = makeEnv(kaiwi, calmSea(kaiwi));
      if (plant) setPlant(c, -side);
      for (let t = 0; t < 1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
      return c;
    };
    const free = run(false), held = run(true);
    // rápido, a pá segura o giro e pode até trazer a proa de volta
    assert.ok(held.psi * side < free.psi * side * 0.6, `giro com espetada ${held.psi.toFixed(2)} x sem ${free.psi.toFixed(2)}`);
    assert.ok(held.y < free.y, 'freia, não empurra');
  }
});

test('a pá cravada de um lado puxa a proa para aquele lado, mais forte com mais velocidade', () => {
  const turn = (side, v0) => {
    const c = newCanoe(0, 0); c.vy = v0;
    setPlant(c, side);
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    for (let t = 0; t < 1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.psi;
  };
  assert.ok(turn(-1, 5) < -0.05, `esquerda puxa para a esquerda: ${turn(-1, 5).toFixed(3)}`);
  assert.ok(turn(1, 5) > 0.05, `direita puxa para a direita: ${turn(1, 5).toFixed(3)}`);
  assert.ok(Math.abs(turn(1, 6)) > Math.abs(turn(1, 2)) * 2, 'rápido puxa mais que devagar');
});

test('espetar do lado errado piora o giro: a pá puxa para o mesmo lado da onda', () => {
  const run = plant => {
    const c = newCanoe(0, 0); c.vy = 5; c.r = -0.3;
    if (plant) setPlant(c, -1);
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    for (let t = 0; t < 1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.psi;
  };
  assert.ok(run(true) < run(false), `com a pá ${run(true).toFixed(3)} x sem ${run(false).toFixed(3)}`);
});

test('remar cancela a espetada e o huli também', () => {
  const c = newCanoe(0, 0);
  setPlant(c, -1);
  startStroke(c, 1, 'media', 0);
  assert.equal(c.plant, 0);
  c.huliT = 2; setPlant(c, 1);
  assert.equal(c.plant, 0);
});

test('no Ka\'iwi, só remando a onda atravessa a canoa; com espetada ela fica bem mais alinhada e anda mais', () => {
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
  // a espetada dá uma boa travada mas não trava tudo, então a canoa ainda abre um pouco
  assert.ok(esp.ang < only.ang * 0.7, `ângulo médio na onda: espetada ${esp.ang.toFixed(2)} x remada ${only.ang.toFixed(2)}`);
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
    for (let seed = 1; seed <= 10; seed++) {
      const events = [];
      const c = newCanoe(0, 0);
      paddle(c, makeEnv(track, new Sea(track, makeConditions(track, makeRng(seed), { weather: 'nublado' })), events), 90, steer('media'), { gapScale: 1.05 });
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

test('devagar a diagonal vira mais que a espetada; rápido a espetada direciona mais e a diagonal perde força', () => {
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  const turn = (v0, how) => {
    const c = newCanoe(0, 0); c.vy = v0;
    if (how === 'diagonal') startStroke(c, -1, 'diagonal', 0); else setPlant(c, 1);
    for (let t = 0; t < 0.8; t += 1 / 60) { if (how !== 'diagonal') c.vy = Math.max(c.vy, v0 * 0.9); stepCanoe(c, 1 / 60, t, env); }
    return c.psi;
  };
  assert.ok(turn(2, 'diagonal') > turn(2, 'espetada') * 2, `devagar: diagonal ${turn(2, 'diagonal').toFixed(3)} x espetada ${turn(2, 'espetada').toFixed(3)}`);
  assert.ok(turn(6.5, 'espetada') > turn(6.5, 'diagonal'), `rápido: espetada ${turn(6.5, 'espetada').toFixed(3)} x diagonal ${turn(6.5, 'diagonal').toFixed(3)}`);
  assert.ok(turn(6.5, 'diagonal') < turn(2, 'diagonal') * 0.6, 'a diagonal perde força com velocidade');
});

test('vento de través com a canoa andando puxa a proa para o vento; parada, não', () => {
  // wind from the left: blowing toward +x
  const windy = () => { const s = calmSea(kaiwi); s.cond.wx = 8; s.cond.windKn = 15; return s; };
  const run = v0 => {
    const c = newCanoe(0, 0); c.vy = v0;
    const env = makeEnv(kaiwi, windy());
    for (let t = 0; t < 2; t += 1 / 60) { c.vy = Math.max(c.vy, v0 * 0.9); stepCanoe(c, 1 / 60, t, env); }
    return c.psi;
  };
  assert.ok(run(4) < -0.03, `andando vira para a esquerda (contra o vento): ${run(4).toFixed(3)}`);
  assert.ok(Math.abs(run(0)) < Math.abs(run(4)) * 0.3, 'parada quase não gira');
});

test('rajadas: o vento muda de um ponto do mar para outro e as manchas andam com o vento', () => {
  const sea = new Sea(kaiwi, makeConditions(kaiwi, makeRng(3)));
  const kn = [];
  for (let x = -200; x <= 200; x += 25) for (let y = 0; y <= 400; y += 25) kn.push(sea.wind(10, x, y).kn);
  assert.ok(Math.max(...kn) - Math.min(...kn) > sea.cond.windKn * 0.3, 'há manchas mais fortes e mais fracas');
  const C = sea.cond, s = Math.hypot(C.wx, C.wy), ux = C.wx / s, uy = C.wy / s;
  // the patch that was at the origin is downwind 20 s later
  assert.ok(Math.abs(sea.gustPatch(0, 0, 0) - sea.gustPatch(ux * s * 20, uy * s * 20, 20)) < 1e-6);
});

test('batida por trás: a canoa de trás perde velocidade e a da frente ganha, e as duas se separam', () => {
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  const front = newCanoe(0, 7.3), back = newCanoe(0, 0.1);
  front.vy = 2; back.vy = 5;
  const k = bump(back, front, env);
  assert.ok(k, 'encostaram');
  assert.ok(back.vy < 5 && front.vy > 2, `velocidades ${back.vy.toFixed(2)} / ${front.vy.toFixed(2)}`);
  assert.ok(Math.abs(back.vy + front.vy - 7) < 1e-6, 'a quantidade de movimento se conserva');
  assert.equal(contact(back, front), null, 'não ficam uma dentro da outra');
});

test('canoas longe não batem; casco no ama de lado, devagar, só empurra e gira', () => {
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  assert.equal(bump(newCanoe(0, 0), newCanoe(14, 0), env), null);
  // a canoe on the left, its nose poking into this one's ama
  const me = newCanoe(0, 0), other = newCanoe(AMA_X - 0.2, -4);
  other.vx = 1.2;
  const k = bump(other, me, env);
  assert.ok(k && (k.partB === 'ama' || k.partB === 'iako'), 'bateu no ama');
  assert.ok(me.huliT <= 0, 'batida leve não vira');
  assert.ok(me.r !== 0, 'a batida gira a canoa');
});

test('batida forte no ama vira a canoa', () => {
  const events = [];
  const env = makeEnv(kaiwi, calmSea(kaiwi), events);
  const me = newCanoe(0, 0), other = newCanoe(AMA_X - 0.2, -4);
  other.vx = 3.5;
  bump(other, me, env);
  assert.ok(me.huliT > 0, 'huli');
  assert.ok(events.some(e => e.name === 'huli'));
});

test('a stamina da remada depende da velocidade: sair do parado custa mais, na onda quase nada', () => {
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  const cost = (vy, type = 'media') => { const c = newCanoe(0, 0); c.vy = vy; startStroke(c, -1, type, 0); return 100 - c.st; };
  assert.ok(cost(0) > cost(3.7) * 1.3, `parado ${cost(0).toFixed(1)} x cruzeiro ${cost(3.7).toFixed(1)}`);
  assert.ok(cost(6.5) < cost(3.7) * 0.5, `na onda ${cost(6.5).toFixed(1)} x cruzeiro ${cost(3.7).toFixed(1)}`);
  assert.ok(cost(3.7, 'diagonal') > cost(3.7, 'media'), 'a diagonal gasta mais que a média');
  // above the speed the arms can pull at, a stroke no longer pushes the canoe
  const push = vy => { const c = newCanoe(0, 0); c.vy = vy; startStroke(c, -1, 'media', 0); c.stroke.t = 0.15;
    const d = newCanoe(0, 0); d.vy = vy; stepCanoe(c, 1 / 120, 0, env); stepCanoe(d, 1 / 120, 0, env); return (c.vy - d.vy) * 120; };
  assert.ok(push(6.8) < 0.05 && push(3) > 2, `empurrão rápido ${push(6.8).toFixed(2)} x devagar ${push(3).toFixed(2)} m/s²`);
});

test('espetar não gasta stamina', () => {
  const c = newCanoe(0, 0); c.vy = 5; c.st = 50;
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  setPlant(c, 1);
  for (let t = 0; t < 2; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(c.st > 50, `stamina ${c.st.toFixed(1)}`);
});

test('cansado não sai remada forte: com stamina baixa vira média e, quase sem, tudo vira longa e mais espaçada', () => {
  const take = (st, type) => { const c = newCanoe(0, 0); c.st = st; startStroke(c, -1, type, 0); return c.stroke; };
  assert.equal(take(60, 'forte').type, 'forte');
  assert.equal(take(20, 'forte').type, 'media');
  assert.equal(take(8, 'forte').type, 'longa');
  assert.equal(take(8, 'media').type, 'longa');
  assert.equal(take(8, 'diagonal').type, 'diagonal');
  assert.ok(take(5, 'media').gap > take(60, 'media').gap * 1.3, 'cadência mais lenta');
  // paddling flat out with no rest, the canoe ends up slower than at the start
  const c = newCanoe(0, 0), env = makeEnv(kaiwi, calmSea(kaiwi));
  paddle(c, env, 8, alternate('forte'));
  const fresh = speed(c);
  paddle(c, env, 25, alternate('forte'), { t0: 8 });
  assert.ok(speed(c) < fresh - 0.3, `descansado ${fresh.toFixed(2)} x exausto ${speed(c).toFixed(2)} m/s`);
});

test('a canoa continua girando depois que a pá sai da água e vai parando aos poucos', () => {
  const c = newCanoe(0, 0); c.vy = 4;
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  startStroke(c, -1, 'diagonal', 0);
  let peak = 0, t = 0;
  for (; t < 0.6; t += 1 / 60) { stepCanoe(c, 1 / 60, t, env); peak = Math.max(peak, c.r); }
  for (; t < 1.2; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(c.r > peak * 0.3, `meio segundo depois da remada ainda gira: ${c.r.toFixed(3)} de ${peak.toFixed(3)} rad/s`);
  for (; t < 5; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(Math.abs(c.r) < peak * 0.1, `depois para: ${c.r.toFixed(3)} rad/s`);
});

test('parada, a canoa gira solta por mais tempo do que andando', () => {
  const spin = v0 => {
    const c = newCanoe(0, 0); c.vy = v0; c.r = 0.5;
    const env = makeEnv(kaiwi, calmSea(kaiwi));
    for (let t = 0; t < 1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
    return c.r;
  };
  assert.ok(spin(0) > 0.25, `parada, depois de 1 s ainda gira ${spin(0).toFixed(2)} rad/s`);
  assert.ok(spin(0) > spin(4) * 1.5, `parada ${spin(0).toFixed(2)} x andando ${spin(4).toFixed(2)}`);
});

test('virar a proa não vira a velocidade na hora: a canoa escorrega de lado e depois segue a proa', () => {
  const c = newCanoe(0, 0); c.vy = 4; c.psi = 0.3;
  const env = makeEnv(kaiwi, calmSea(kaiwi));
  const slip = () => Math.abs(Math.atan2(c.vx, c.vy) - c.psi);
  let t = 0;
  for (; t < 0.1; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(slip() > 0.2, `logo depois ainda vai para onde ia: deriva ${slip().toFixed(2)} rad`);
  for (; t < 1.5; t += 1 / 60) stepCanoe(c, 1 / 60, t, env);
  assert.ok(slip() < 0.06, `depois segue a proa: deriva ${slip().toFixed(2)} rad`);
});
