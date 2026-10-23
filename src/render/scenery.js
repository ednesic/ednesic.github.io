// Landmarks and shoreline for each track. Positions are in metres in physics coordinates (see models.P).
import { P, flatMat, labelSprite, calcadaoTexture } from './models.js';
import { terrain, granite, palm, building } from './terrain.js';

const THREE = window.THREE;

// Decorative placement uses Math.random on purpose: it never affects the race.
const rnd = (a, b) => a + Math.random() * (b - a);

function copacabana(world, track) {
  // beach, calçadão and buildings on the left; Morro do Leme and Pão de Açúcar ahead
  const sx = track.shore.x, L = track.len, len = L + 1600;
  const strip = (w, x, h, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
    m.rotation.x = -Math.PI / 2; m.position.copy(P(x, L / 2, h)); world.add(m);
  };
  strip(70, sx - 30, 0.3, flatMat(0xead39b));
  const tex = calcadaoTexture(); tex.repeat.set(1, len / 12);
  strip(10, sx - 70, 0.35, new THREE.MeshLambertMaterial({ map: tex }));
  strip(22, sx - 86, 0.3, flatMat(0x4a4a4f));
  const bcol = [0xe8e0d0, 0xd9cbb4, 0xf2e6d8, 0xc9d3d6, 0xe3c9a8];
  for (let y = -600; y < L + 800; y += rnd(14, 22)) {
    const h = rnd(18, 45);
    const b = building(rnd(12, 16), Math.round(h / 3) * 3, rnd(10, 16), bcol[Math.floor(Math.random() * bcol.length)]);
    b.position.copy(P(sx - 106 - rnd(0, 4), y)); world.add(b);
  }
  for (let y = -300; y < L + 400; y += 40) { const p = palm(rnd(7, 10)); p.position.copy(P(sx - 62, y + rnd(-5, 5), 0)); world.add(p); }
  const leme = terrain(150, 150, 0x3e7a4a, 3, { rocky: 0.6 }); leme.position.copy(P(-120, L + 330)); world.add(leme);
  const pao = granite(85, 300, 95, 0x3f6b3e, 1); pao.position.copy(P(-40, L + 1150)); pao.rotation.y = 0.4; world.add(pao);
  const urca = granite(130, 150, 115, 0x41703f, 2); urca.position.copy(P(-230, L + 1000)); world.add(urca);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 260, 4), flatMat(0x333333));
  cable.position.copy(P(-135, L + 1075, 200)); cable.rotation.z = Math.PI / 2 - 0.45; cable.rotation.y = 0.3; world.add(cable);
  const forte = terrain(100, 55, 0x5f7a4c, 9, { rocky: 0.5 }); forte.position.copy(P(-60, -260)); world.add(forte);
  const lp = labelSprite('Pão de Açúcar', '#f5b841'); lp.position.copy(P(-40, L + 1150, 320)); lp.scale.set(120, 30, 1); world.add(lp);
}

function hawaikiNui(world, track, objs) {
  // reef surf lines and motus on both sides, Taha'a ahead
  const L = track.len;
  for (const side of [-1, 1]) {
    const xr = side < 0 ? track.bounds[0] - 6 : track.bounds[1] + 6;
    const reef = new THREE.Mesh(new THREE.PlaneGeometry(14, L + 2000), new THREE.MeshStandardMaterial({ color: 0x8fe3d2, roughness: 0.9 }));
    reef.rotation.x = -Math.PI / 2; reef.position.copy(P(xr, L / 2, 0.15)); world.add(reef);
    const foam = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, L + 2000), flatMat(0xffffff));
    foam.position.copy(P(xr + side * 6, L / 2, 0.3)); world.add(foam);
    for (let y = -400; y < L + 900; y += rnd(60, 160)) {
      const len = rnd(40, 110);
      const mx = xr + side * rnd(40, 70);
      const motu = terrain(len * 0.6, 7, 0x4f8a4a, y * 0.01, { rocky: 0, res: 36 });
      motu.scale.set(rnd(30, 60) / len, 1, 1);
      motu.position.copy(P(mx, y)); world.add(motu);
      for (let i = 0; i < len / 8; i++) { const p = palm(rnd(8, 13)); p.position.copy(P(mx + rnd(-8, 8), y + rnd(-len / 3, len / 3), 1.5)); world.add(p); }
    }
  }
  const tahaa = terrain(750, 400, 0x2f6e46, 5); tahaa.position.copy(P(80, L + 1500)); world.add(tahaa);
  const t2 = terrain(420, 270, 0x3a7a50, 8); t2.position.copy(P(-500, L + 1300)); world.add(t2);
  const lt = labelSprite('Taha\'a', '#f5b841'); lt.position.copy(P(80, L + 1500, 430)); lt.scale.set(110, 28, 1); world.add(lt);
  // coral heads show as pale patches ringed by white water
  for (const o of objs) if (o.k === 'coral') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.3, 0.8, 7), flatMat(0xc98e7a));
    m.position.copy(P(o.x, o.y, -0.05)); world.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(o.r * 1.05, o.r * 1.6, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(P(o.x, o.y, 0.1)); world.add(ring);
  }
}

function kaiwi(world, track) {
  // Oahu ahead (Koko Head, Diamond Head), Molokai behind
  const L = track.len;
  const oahu = terrain(950, 430, 0x4c6b4a, 2); oahu.position.copy(P(250, L + 2400)); world.add(oahu);
  const koko = terrain(280, 200, 0x7a6b52, 4, { rocky: 0.8, crater: 0.25 }); koko.position.copy(P(-350, L + 1700)); world.add(koko);
  const dh = terrain(300, 230, 0x8a7a5a, 6, { crater: 0.55, rocky: 0.9 });
  dh.position.copy(P(-30, L + 2100)); world.add(dh);
  const ld = labelSprite('Diamond Head', '#f5b841'); ld.position.copy(P(-30, L + 2100, 220)); ld.scale.set(130, 32, 1); world.add(ld);
  const molo = terrain(1250, 520, 0x3f5d44, 7); molo.position.copy(P(-200, -2600)); world.add(molo);
}

export const SCENERY = { copa: copacabana, hawaiki: hawaikiNui, kaiwi };
