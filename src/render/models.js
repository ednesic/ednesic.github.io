// Low-poly meshes built from primitives. three.js comes from the CDN script tag as a global.
import { HULL, HALF, AMA_X } from '../canoe.js';
import { STROKES } from '../strokes.js';
import { hasHuman, makeHuman, seatHuman, bendSpine, shoulderOf, aimArm, armLen } from './human.js';
import { hasBoat, makeBoat } from './boat.js';

const THREE = window.THREE;

// Physics (x, y, height) to three.js coordinates: the course runs toward -z.
export const P = (x, y, h) => new THREE.Vector3(x, h || 0, -y);

export function flatMat(color, extra) {
  return new THREE.MeshPhongMaterial(Object.assign({ color, flatShading: true, shininess: 8, specular: 0x111111 }, extra || {}));
}

export function dome(rx, ry, rz, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(color));
  m.scale.set(rx, ry, rz);
  return m;
}

export function labelSprite(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const x = cv.getContext('2d');
  x.font = '700 34px Figtree, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(6,32,47,0.85)'; x.strokeText(text, 128, 32);
  x.fillStyle = color; x.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set(4, 1, 1);
  return sp;
}

// calçadão: the Burle Marx wave pavement as a canvas texture
export function calcadaoTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#f2eee6'; x.fillRect(0, 0, 128, 256);
  x.fillStyle = '#1d1b1b';
  for (let band = 1; band < 4; band += 2) {
    x.beginPath();
    x.moveTo(0, band * 64);
    for (let yy = 0; yy <= 64; yy++) x.lineTo(64 + Math.sin(yy / 64 * Math.PI * 2) * 38, band * 64 + yy);
    for (let yy = 64; yy >= 0; yy--) x.lineTo(0, band * 64 + yy);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function checkerBanner(width, label) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#06202f' : '#eef7f1'; g.fillRect(i * 16, j * 16, 16, 16); }
  if (label) {
    g.fillStyle = 'rgba(6,32,47,0.85)'; g.fillRect(150, 8, 212, 48);
    g.fillStyle = '#f5b841'; g.font = '700 30px Figtree, sans-serif'; g.textAlign = 'center'; g.fillText(label, 256, 43);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(width, 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
}

// The finish arch: an inflatable tube in stripes over the middle of the course, standing on two
// floats, with the CHEGADA banner hung under its top and a feather flag beside each foot.
// span and height in metres; the arch faces the canoes coming up the course (+z is toward the start).
// userData.flags are the flag cloths to wave and userData.mouths where confetti shoots from.
export function finishArch(span, height) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#e8432e'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#f5b841'; x.fillRect(0, 0, 32, 64);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 20, 64, 10);   // a sheen along the tube
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(26, 1);
  // a squared-off half superellipse, so the arch stands tall at the sides instead of a flat rainbow
  class Arc extends THREE.Curve {
    getPoint(u, out = new THREE.Vector3()) {
      const a = Math.PI * (1 - u), c = Math.cos(a), s = Math.sin(a);
      return out.set(Math.sign(c) * Math.pow(Math.abs(c), 0.45) * span / 2, Math.pow(s, 0.3) * height - 0.6, 0);
    }
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new Arc(), 120, 1.5, 14, false),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0 }));
  g.add(tube);
  // the banner: chequered edges and the word, on both faces so it reads from either side
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 160;
  const b = bc.getContext('2d');
  b.fillStyle = '#06202f'; b.fillRect(0, 0, 1024, 160);
  for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) {
    b.fillStyle = (i + j) % 2 ? '#06202f' : '#eef7f1';
    b.fillRect(i * 16, j * 16, 16, 16); b.fillRect(i * 16, 128 + j * 16, 16, 16);
  }
  b.fillStyle = '#f5b841'; b.font = '400 92px Shrikhand, Georgia, serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
  b.fillText('CHEGADA', 512, 84);
  const bw = Math.min(span * 0.55, 46), banner = new THREE.Group();
  for (const back of [0, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw * 160 / 1024), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc) }));
    pl.rotation.y = back * Math.PI; banner.add(pl);
  }
  banner.position.y = height - 1.6 - bw * 80 / 1024; g.add(banner);
  // ropes from the banner's corners up to the tube
  const rope = new THREE.MeshBasicMaterial({ color: 0x15171a });
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), rope);
    r.position.set(sx * bw * 0.48, height - 1.4, 0); g.add(r);
  }
  const flags = [], mouths = [];
  const flagMat = [0xe8432e, 0x2f7fd1];
  for (const sx of [-1, 1]) {
    // a float under each foot, and a confetti cannon on it
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.2, 20), new THREE.MeshStandardMaterial({ color: 0xeef7f1, roughness: 0.5 }));
    fl.position.set(sx * span / 2, -0.2, 0); g.add(fl);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.4 }));
    can.position.set(sx * (span / 2 - 1.6), 0.9, 1.2); can.rotation.z = sx * 0.45; g.add(can);
    mouths.push(new THREE.Vector3(sx * (span / 2 - 1.85), 1.4, 1.2));
    // a tall feather flag on a bent pole, a little ahead of the foot
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(sx * (span / 2 + 4.5), 4.3, 3); g.add(pole);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1.6, 0.6); shape.quadraticCurveTo(2.2, 5.5, 0.2, 7.6); shape.lineTo(0, 7.6);
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), new THREE.MeshStandardMaterial({ color: flagMat[sx < 0 ? 0 : 1], side: THREE.DoubleSide, roughness: 0.8 }));
    const fg = new THREE.Group(); fg.position.set(sx * (span / 2 + 4.5), 1, 3); fg.add(cloth); g.add(fg);
    flags.push(fg);
  }
  mouths.push(new THREE.Vector3(0, height, 0));   // and a burst from the top of the arch
  g.userData = { flags, mouths };
  return g;
}

export function honu() {
  const g = new THREE.Group();
  g.add(dome(0.6, 0.25, 0.75, 0x3f6b45));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), flatMat(0x6fae7a));
  head.position.set(0, 0, -0.85); g.add(head);
  return g;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Lofted hull, stern (s = 0) to bow (s = 1). Each station is a V-bottomed section below the sheer
// and a peaked deck above it; the sheer sweeps up at the bow like a racing V1.
// cockpit: { front, back, floor, ramp, hump } in metres along the hull (z, bow is -z) sinks the deck
// between front and back into a narrow tub down to `floor`, so the paddler sits inside the hull,
// and raises the deck and sides around it by `hump`; ahead of and behind it the deck is a low ridge.
// paint(s, up, j, inside) returns the colour of each vertex (up: true on the deck, inside: in the tub).
// The rim of the tub is returned in geometry.userData.rim, stern to bow on each side.
const RIM_C = Math.cos(Math.PI / 6);   // the tub opens at this fraction of the half width (a ring vertex)
function loft({ len, halfW, depth, deck, rocker = 0.1, bowRise = 0.16, stations = 64, ring = 24, cockpit, paint }) {
  const pos = [], col = [], idx = [];
  const rim = { r: [], l: [] };
  for (let i = 0; i < stations; i++) {
    const s = i / (stations - 1);
    const sw = Math.pow(s, 0.92);
    const w = Math.max(0.003, Math.pow(Math.sin(Math.PI * sw), (s > 0.5 ? 0.62 : 0.78) * (cockpit ? 1.25 : 1)));
    const z = (0.5 - s) * len;
    const hump = cockpit ? cockpit.hump * smooth(cockpit.front - 0.8, cockpit.front - 0.1, z) * smooth(cockpit.back + 0.6, cockpit.back + 0.05, z) : 0;
    const sheer = bowRise * smooth(0.72, 1, s) + bowRise * 0.35 * smooth(0.2, 0, s) + hump;
    const keel = rocker * Math.pow(2 * s - 1, 2) + bowRise * 0.6 * smooth(0.8, 1, s);
    const k = cockpit ? smooth(cockpit.back, cockpit.back - cockpit.ramp, z) * smooth(cockpit.front, cockpit.front + cockpit.ramp, z) : 0;
    // deck height across the beam: half round crown, half ridge down the middle
    const deckY = (sn, c) => sheer + deck * w * (0.5 * sn + 0.5 * (1 - Math.abs(c)));
    const rimY = deckY(Math.sqrt(1 - RIM_C * RIM_C), RIM_C);
    for (let j = 0; j < ring; j++) {
      const th = j / ring * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const up = sn >= 0;
      // a soft V below, a crowned deck above
      let y = up ? deckY(sn, c) : Math.max(-1, sn) * Math.pow(Math.abs(sn), 0.15) * depth * Math.pow(w, 0.55) + keel * (1 - Math.abs(c)) + sheer * Math.abs(c);
      const inside = up && k > 0.5 && Math.abs(c) < RIM_C - 0.01;
      if (k > 0 && up && Math.abs(c) < RIM_C - 0.01) {
        // the tub: steep walls from the rim down to a rounded floor
        const tub = cockpit.floor + (rimY - cockpit.floor) * Math.pow(Math.abs(c) / RIM_C, 4);
        y += (tub - y) * k;
      }
      pos.push(c * halfW * w, y, z);
      if (k > 0.02 && Math.abs(Math.abs(c) - RIM_C) < 0.01 && up) rim[c > 0 ? 'r' : 'l'].push(new THREE.Vector3(c * halfW * w, y, z));
      const kc = paint(s, up, Math.abs(sn), inside);
      col.push(kc.r, kc.g, kc.b);
    }
  }
  for (let i = 0; i < stations - 1; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.rim = rim;
  return g;
}

const std = (color, rough = 0.6, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));
const gloss = (color, extra) => std(color, 0.25, extra);

// A rounded limb segment of fixed length from its base (origin) up local +y.
function capsule(r1, r2, len, mat) {
  const pts = [];
  const N = 6;
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1)); }
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r2, len + Math.sin(a) * r2)); }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat);
}
const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
function aim(mesh, a, b) {
  mesh.position.copy(a);
  tmp.subVectors(b, a).normalize();
  mesh.quaternion.setFromUnitVectors(UP, tmp);
}

// Two-bone arm: shoulder S to hand H with the elbow pushed toward pole.
const UPPER = 0.3, FORE = 0.28;
function solveElbow(S, H, pole, out, upper = UPPER, fore = FORE) {
  const UPPER = upper, FORE = fore;
  const d = Math.max(0.05, Math.min(S.distanceTo(H), UPPER + FORE - 0.001));
  const dir = new THREE.Vector3().subVectors(H, S).normalize();
  const cosA = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return out.copy(S).addScaledVector(dir, UPPER * cosA).addScaledVector(perp, UPPER * sinA);
}

const PADDLE_LEN = 1.3, BLADE_LEN = 0.46;

// Builds a seated paddler: lathe-shaped torso with a life vest, a head with cap and sunglasses,
// rounded arms and hands. Returns the pieces poseCanoe drives.
function buildPaddler(tilt, o) {
  const skin = std(o.skin, 0.62), shirt = std(o.shirt, 0.8), vest = std(0x16191c, 0.55), tights = std(0x15171a, 0.7);
  const body = new THREE.Group(); body.position.set(0, HIP_Y, SEAT); tilt.add(body);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), tights);
  hips.scale.set(1.05, 0.62, 0.95); body.add(hips);
  // legs forward inside the hull, knees just under the front of the cockpit, feet on the foot bar
  for (const sx of [-1, 1]) {
    const knee = new THREE.Vector3(sx * 0.08, 0.06, -0.43), foot = new THREE.Vector3(sx * 0.07, -0.1, -0.86);
    const thigh = capsule(0.075, 0.06, 0.44, tights); aim(thigh, new THREE.Vector3(sx * 0.08, 0, -0.02), knee); body.add(thigh);
    const shin = capsule(0.055, 0.045, 0.44, tights); aim(shin, knee, foot); body.add(shin);
  }
  const torso = new THREE.Group(); torso.rotation.order = 'YXZ'; body.add(torso);
  // waist to shoulders, flattened front to back
  const prof = [[0, 0.0], [0.14, 0.02], [0.15, 0.1], [0.145, 0.2], [0.17, 0.32], [0.19, 0.42], [0.17, 0.5], [0.08, 0.55], [0.0, 0.56]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const chest = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), shirt);
  chest.scale.set(1, 1, 0.66); chest.position.y = 0.04; torso.add(chest);
  const vprof = [[0.0, 0.1], [0.165, 0.1], [0.165, 0.2], [0.185, 0.32], [0.2, 0.42], [0.15, 0.5], [0.0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const vestM = new THREE.Mesh(new THREE.LatheGeometry(vprof, 20), vest);
  vestM.scale.set(1, 1, 0.74); vestM.position.y = 0.04; torso.add(vestM);
  for (const sx of [-1, 1]) {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), shirt);
    delt.position.set(sx * 0.2, 0.49, 0); torso.add(delt);
  }
  const neck = capsule(0.048, 0.048, 0.08, skin); neck.position.y = 0.55; torso.add(neck);
  // head: skull, jaw, nose, ears, sunglasses and a cap with its brim forward
  const head = new THREE.Group(); head.position.y = 0.7; torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), skin); skull.scale.set(0.86, 1.04, 0.98); head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), o.beard ? std(0x2a1d15, 0.9) : skin);
  jaw.scale.set(1, 0.85, 1); jaw.position.set(0, -0.06, -0.025); head.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 8), skin);
  nose.rotation.x = -Math.PI / 2; nose.position.set(0, -0.012, -0.1); head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
    ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.087, -0.005, 0.005); head.add(ear);
  }
  const glasses = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.035, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76), std(0x0b0e12, 0.15, { side: THREE.DoubleSide }));
  glasses.position.set(0, 0.015, 0.005); head.add(glasses);
  const capM = std(o.cap, 0.75);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.104, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  cap.scale.set(0.9, 0.8, 1); cap.position.y = 0.03; head.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20, 1, false, Math.PI / 2, Math.PI), capM);
  brim.scale.set(1, 1, 0.85); brim.position.set(0, 0.035, -0.06); brim.rotation.x = 0.12; head.add(brim);

  const arms = [];
  for (const sx of [-1, 1]) {
    const upper = capsule(0.05, 0.044, UPPER, shirt), fore = capsule(0.043, 0.035, FORE, shirt);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8), skin);
    hand.scale.set(0.8, 1.15, 0.7);
    tilt.add(upper, fore, hand);
    arms.push({ sx, upper, fore, hand });
  }
  return { body, torso, head, arms };
}

// The same paddler with a real body (see human.js): cap and sunglasses ride on the head bone.
const BODY_SCALE = 1.06;
function buildHumanPaddler(tilt, o) {
  const h = makeHuman({ shirt: o.shirt, shorts: 0x15171a, skin: o.skin, hair: o.beard ? 0x1d140e : 0x2a1d15 });
  tilt.add(h.root);
  h.root.scale.setScalar(BODY_SCALE);   // a tall paddler, about 1.85 m
  h.root.updateMatrixWorld(true);
  const hips = h.bone.root.getWorldPosition(new THREE.Vector3()).sub(tilt.getWorldPosition(new THREE.Vector3()));
  h.root.position.sub(hips).add(new THREE.Vector3(0, HIP_Y, SEAT));
  seatHuman(h);
  const head = h.bone.head;
  // wraparound sunglasses: an open band in front of the eyes, wider than the face front to back
  const glasses = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.032, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), std(0x0b0e12, 0.12, { side: THREE.DoubleSide }));
  glasses.scale.set(1, 1, 1.24); glasses.position.set(0, 0.046, 0.012); head.add(glasses);
  const capM = std(o.cap, 0.75);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  cap.scale.set(0.93, 0.85, 1.12); cap.position.set(0, 0.078, -0.008); head.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20, 1, false, Math.PI / 2, Math.PI), capM);
  brim.scale.set(1, 1, 0.9); brim.position.set(0, 0.084, -0.085); brim.rotation.x = 0.1; head.add(brim);
  const l = armLen(h), lens = { upper: l.upper * BODY_SCALE, fore: l.fore * BODY_SCALE };
  return { human: h, lens, palms: { top: new THREE.Vector3(), low: new THREE.Vector3() } };
}

// The built-in hull, ama and iakos, used when assets/canoe.glb cannot load.
function buildHull(tilt, acc) {
  // hull in the paddler's colour with a white deck, like most racing V1s.
  // Like a real V1 the deck is closed bow to stern except for a narrow cockpit: the paddler sits
  // low in it, below the rim, with the legs forward under the front deck.
  const hullGeo = loft({
    len: HULL, halfW: 0.2, depth: 0.31, deck: 0.1, rocker: 0.1, bowRise: 0.17,
    cockpit: { front: COCKPIT_FRONT, back: COCKPIT_BACK, floor: SEAT_Y - HULL_Y, ramp: 0.14, hump: 0.08 },
    paint: (s, up, j, inside) => inside ? WELL : up && s > 0.08 && s < 0.9 ? WHITE : acc,
  });
  const hull = new THREE.Mesh(hullGeo, gloss(0xffffff, { vertexColors: true }));
  hull.position.y = HULL_Y; tilt.add(hull);
  // coaming: a lip around the cockpit, rounded at both ends
  const { r, l } = hullGeo.userData.rim;
  const lift = p => p.clone().add(new THREE.Vector3(0, HULL_Y + 0.008, 0));
  const ends = (a, b, dz) => new THREE.Vector3(0, (a.y + b.y) / 2, a.z + dz);
  const loop = [...r.map(lift), lift(ends(r[r.length - 1], l[l.length - 1], -0.07)), ...l.reverse().map(lift), lift(ends(l[l.length - 1], r[0], 0.07))];
  const rimM = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), 96, 0.016, 6, true), gloss(acc));
  tilt.add(rimM);
  // the seat pad at the bottom of the tub
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.03, 20), std(0x2b3036, 0.9));
  seat.scale.set(0.12, 1, 0.16); seat.position.set(0, SEAT_Y + 0.015, SEAT + 0.05); tilt.add(seat);

  // ama: long and slim, upswept at the front, painted like the hull
  const amaGeo = loft({
    len: 3.1, halfW: 0.095, depth: 0.12, deck: 0.08, rocker: 0.14, bowRise: 0.14, stations: 40, ring: 16,
    paint: (s, up) => up && s > 0.1 && s < 0.88 ? WHITE : acc,
  });
  const ama = new THREE.Mesh(amaGeo, gloss(0xffffff, { vertexColors: true }));
  ama.position.set(AMA_X, 0.03, 0.4); tilt.add(ama);
  // iako: carbon booms across the deck, arching out and down to pegs on the ama
  const carbon = std(0x1c1d20, 0.3);
  for (const z of [COCKPIT_FRONT - 0.35, COCKPIT_BACK + 0.7]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.16, 0.33, z), new THREE.Vector3(-0.3, 0.42, z), new THREE.Vector3(-1.0, 0.5, z),
      new THREE.Vector3(-1.6, 0.4, z), new THREE.Vector3(AMA_X + 0.02, 0.26, z),
    ]);
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.026, 8), carbon));
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.18, 8), carbon);
    peg.position.set(AMA_X + 0.02, 0.17, z); tilt.add(peg);
  }
}

// V1 with the ama on the left (local -x); forward is local -z. The paddler sits at z = SEAT.
// opts: { shirt, cap, skin, beard } for the paddler and { deck, trim } for the canoe; accent paints the hull.
const SEAT = 0.55;
const HULL_Y = 0.17, SEAT_Y = 0.07, HIP_Y = 0.18;   // sheer line, seat pad and hip joints above the waterline
const COCKPIT_FRONT = SEAT - 1.0, COCKPIT_BACK = SEAT + 0.26;
const WHITE = new THREE.Color(0xf4f4f1), WELL = new THREE.Color(0x24282d);
export function buildCanoe(accent, opts = {}) {
  const o = Object.assign({ shirt: 0x2aa6e0, cap: 0xf26a1b, skin: 0xb07a55, beard: false, deck: 0xf4f4f1, trim: 0x15171a }, opts);
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  tilt.rotation.order = 'YXZ';
  if (hasBoat()) tilt.add(makeBoat({ hull: accent, deck: o.deck, trim: o.trim }));
  else buildHull(tilt, new THREE.Color(accent));

  const { body, torso, head, arms, human, lens, palms } = hasHuman() ? buildHumanPaddler(tilt, o) : buildPaddler(tilt, o);

  // paddle: grip at the origin, shaft down local -y, blade face in the local xy plane
  const paddle = new THREE.Group(); tilt.add(paddle);
  const wood = std(0xc79b62, 0.55);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, PADDLE_LEN - BLADE_LEN * 0.6, 10), wood);
  shaft.position.y = -(PADDLE_LEN - BLADE_LEN * 0.6) / 2; paddle.add(shaft);
  const grip = capsule(0.02, 0.02, 0.12, wood); grip.rotation.z = Math.PI / 2; grip.position.x = 0.06; paddle.add(grip);
  const bs = new THREE.Shape();
  bs.moveTo(0, 0); bs.quadraticCurveTo(0.12, -0.06, 0.11, -0.3); bs.quadraticCurveTo(0.1, -0.44, 0, -BLADE_LEN);
  bs.quadraticCurveTo(-0.1, -0.44, -0.11, -0.3); bs.quadraticCurveTo(-0.12, -0.06, 0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bs, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 }), std(0x15171a, 0.3, { side: THREE.DoubleSide }));
  blade.position.set(0, -(PADDLE_LEN - BLADE_LEN), -0.005); paddle.add(blade);

  const bladeMid = new THREE.Object3D(); bladeMid.position.y = -(PADDLE_LEN - BLADE_LEN / 2); paddle.add(bladeMid);

  return { root, tilt, body, torso, head, paddle, arms, human, lens, palms, bladeMid, pose: null, fx: [], seen: { stroke: null, exited: false, plant: 0, plantT: 0 } };
}

// Paddle poses in the canoe's frame (x right, y up, z back): G is the top hand on the grip,
// B the middle of the blade. Keyframes follow a real V1 stroke: the paddler leans forward with
// the top hand reaching out at eye height and the lower arm long, plants the blade ahead, pulls
// with the torso unwinding while the shaft stands upright, exits at the hip with the top hand at
// the chin, then swings the paddle forward low and flat. With no stroke for a while the paddle
// rests across the lap.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = x => x * x * (3 - 2 * x);
const mix = (a, b, k) => a + (b - a) * k;

// keys: [{ at, G, B, lean, twist, roll, feather }], ph in [0, 1]
function keyed(keys, ph) {
  let i = 0;
  while (i < keys.length - 2 && ph > keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1];
  const k = ease(Math.min(1, Math.max(0, (ph - a.at) / (b.at - a.at))));
  return {
    G: a.G.clone().lerp(b.G, k), B: a.B.clone().lerp(b.B, k),
    lean: mix(a.lean, b.lean, k), twist: mix(a.twist, b.twist, k), roll: mix(a.roll || 0, b.roll || 0, k),
    feather: mix(a.feather || 0, b.feather || 0, k), face: mix(a.face || 0, b.face || 0, k),
  };
}

const zs = SEAT;
// one side's keyframes, built for the right side (+1) and mirrored by side
const PULL = [
  { at: 0, G: V(0.12, 1.1, zs - 1.0), B: V(0.45, -0.2, zs - 1.15), lean: -0.55, twist: 0.5 },
  { at: 0.45, G: V(0.2, 1.0, zs - 0.74), B: V(0.45, -0.32, zs - 0.45), lean: -0.3, twist: 0.15, roll: -0.08 },
  { at: 1, G: V(0.24, 0.7, zs - 0.48), B: V(0.42, -0.1, zs + 0.12), lean: -0.1, twist: -0.25, roll: -0.04 },
];
// sweep (diagonal): blade planted near the bow, swept wide out to the side and back to the hip,
// the top hand low in front of the chest
const SWEEP = [
  { at: 0, G: V(0.05, 0.84, zs - 0.92), B: V(0.55, -0.15, zs - 1.15), lean: -0.5, twist: 0.7, roll: -0.1 },
  { at: 0.5, G: V(0.12, 0.8, zs - 0.66), B: V(1.5, -0.15, zs - 0.3), lean: -0.3, twist: 0.15, roll: -0.25 },
  { at: 1, G: V(0.16, 0.78, zs - 0.48), B: V(0.75, -0.1, zs + 0.6), lean: -0.15, twist: -0.45, roll: -0.12 },
];
// recovery after the exit: lift, swing forward low with the blade feathered, then reach for the catch
const RECOVER = [
  { at: 0, G: V(0.24, 0.7, zs - 0.48), B: V(0.46, 0.25, zs + 0.12), lean: -0.1, twist: -0.25 },
  { at: 0.5, G: V(0.12, 0.76, zs - 0.6), B: V(0.6, 0.2, zs - 0.75), lean: -0.35, twist: 0.25, feather: 1 },
  { at: 1, G: V(0.12, 1.1, zs - 1.0), B: V(0.5, 0.1, zs - 1.12), lean: -0.55, twist: 0.5, feather: 0.2 },
];
const RECOVER_T = 0.45;   // seconds from the exit to ready for the next catch
// resting: sat up, the paddle across the lap with the blade lying flat out on the stroke side
const REST = { G: V(-0.3, 0.56, zs - 0.42), B: V(0.75, 0.32, zs - 0.42), lean: -0.12, twist: 0, roll: 0, feather: 1, face: 0 };
const REST_AFTER = 1.2, REST_T = 0.6;   // idle seconds before settling, and how long that takes
// espetada: the torso turns toward the stern and the paddle is stabbed in behind the hip, blade
// face along the hull and the shaft raked back, so it drags aft like a rudder; both hands stay low
const STAB = [
  { at: 0, G: V(0.15, 0.88, zs - 0.25), B: V(0.55, 0.4, zs + 0.75), lean: -0.05, twist: -0.4, roll: -0.05, face: 1 },
  { at: 1, G: V(0.08, 0.76, zs - 0.12), B: V(0.62, -0.42, zs + 1.55), lean: 0.05, twist: -0.7, roll: -0.12, face: 1 },
];
const STAB_T = 0.18;
// past the line: the paddle goes up overhead in both hands and is pumped at the sky, then rests
const CHEER = { G: V(-0.3, 1.42, zs - 0.28), B: V(1.05, 1.5, zs - 0.28), lean: 0.12, twist: 0, roll: 0, feather: 1, face: 0 };
const CHEER_T = 5.5;

function mirror(p, side) {
  p.G.x *= side; p.B.x *= side; p.twist *= side; p.roll *= side;
  p.side = side;
  return p;
}

function targetPose(c, m, t) {
  const s = c.stroke;
  const P = s && STROKES[s.type];
  if (c.plant && !(s && s.t < P.dur)) {
    const p = mirror(keyed(STAB, Math.min(1, (t - m.seen.plantT) / STAB_T)), c.plant);
    // the water tugs at the planted blade, harder the faster the canoe runs
    const sp = Math.hypot(c.vx, c.vy);
    p.B.x += Math.sin(t * 31) * 0.006 * sp; p.G.x += Math.sin(t * 23) * 0.004 * sp;
    return p;
  }
  const side = s ? s.side : (c.lastSide || 1);
  const cheer = m.seen.finT !== undefined ? t - m.seen.finT : -1;
  if (cheer >= 0 && cheer < CHEER_T && !(s && s.t < P.dur)) {
    const p = { G: CHEER.G.clone(), B: CHEER.B.clone(), lean: CHEER.lean, twist: CHEER.twist, roll: CHEER.roll, feather: CHEER.feather, face: CHEER.face };
    // a few pumps up at the sky, the shaft rocking side to side, the body swaying with it
    const pump = Math.max(0, Math.sin(cheer * 7)) * 0.14 * Math.min(1, cheer * 2), rock = Math.sin(cheer * 3.5) * 0.1;
    p.G.y += pump - rock; p.B.y += pump + rock;
    p.roll = rock * 0.6; p.lean += pump * 0.4;
    return mirror(p, side);
  }
  if (s && s.t < P.dur) return mirror(keyed(s.type === 'diagonal' ? SWEEP : PULL, s.t / P.dur), side);
  const since = s ? s.t - P.dur : Infinity;
  const p = keyed(RECOVER, Math.min(1, since / RECOVER_T));
  const r = Math.min(1, Math.max(0, (since - RECOVER_T - REST_AFTER) / REST_T));
  if (r > 0) {
    const k = ease(r);
    p.G.lerp(REST.G, k); p.B.lerp(REST.B, k);
    for (const key of ['lean', 'twist', 'roll', 'feather', 'face']) p[key] = mix(p[key], REST[key], k);
  }
  return mirror(p, side);
}

const basis = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), lowHand = new THREE.Vector3(), pole = new THREE.Vector3();
const blade = new THREE.Vector3();

// Real body: bend the spine, then reach each arm from its shoulder to its hand on the shaft.
const wq = new THREE.Quaternion(), hand = new THREE.Vector3(), wpole = new THREE.Vector3(), grip = new THREE.Vector3();
const wr = new THREE.Vector3(), fg = new THREE.Vector3();
function poseHumanArms(m, p, side) {
  const h = m.human;
  m.root.updateMatrixWorld(true);
  bendSpine(h, p.lean, p.twist, p.roll);
  m.tilt.getWorldQuaternion(wq);
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? 'L' : 'R';
    shoulderOf(h, s, shoulder);
    hand.copy(sx === side ? lowHand : p.G);
    m.tilt.localToWorld(hand);
    wpole.set(sx, -0.6, 0.4).applyQuaternion(wq);
    // the wrist aims short of the target so the palm, not the wrist, lands on the shaft
    hand.lerp(shoulder, Math.min(0.5, PALM / Math.max(0.1, hand.distanceTo(shoulder))));
    solveElbow(shoulder, hand, wpole, elbow, m.lens.upper, m.lens.fore);
    aimArm(h, s, elbow, hand, shoulder);
    // where the palm ended up, back in the canoe's frame
    h.bone['wrist_' + s].getWorldPosition(wr);
    h.bone['finger3-1_' + s].getWorldPosition(fg);
    const palm = m.palms[sx === side ? 'low' : 'top'];
    m.tilt.worldToLocal(palm.copy(wr).lerp(fg, 0.7));
  }
}
const PALM = 0.08;

// Copies the canoe's physics state onto its mesh and animates the paddler.
// Splashes it starts are left in m.fx as { at: world position, n, up } for the view to spray.
export function poseCanoe(m, c, dt = 1 / 60, t = 0) {
  m.root.position.set(c.x, c.heave, -c.y);
  m.root.rotation.y = -c.psi;
  let roll = c.roll;
  if (c.huliT > 0) roll = Math.min(Math.PI * 0.95, (3 - c.huliT) * 4) * (c.huliT > 0.4 ? 1 : c.huliT / 0.4);
  m.tilt.rotation.x = c.pitch;
  m.tilt.rotation.z = -roll;

  const seen = m.seen;
  if (c.plant && !seen.plant) seen.plantT = t;
  if (c.finish !== null && seen.finT === undefined) seen.finT = t;
  const tgt = targetPose(c, m, t);
  const first = !m.pose;
  if (first) m.pose = { G: tgt.G.clone(), B: tgt.B.clone(), lean: tgt.lean, twist: tgt.twist, roll: tgt.roll, feather: tgt.feather, face: tgt.face };
  const p = m.pose;
  // switching sides, the blade travels up and over the deck instead of through it
  if (Math.sign(p.B.x) !== Math.sign(tgt.B.x)) tgt.B.y = Math.max(tgt.B.y, 0.55);
  const k = 1 - Math.exp(-dt * (c.plant ? 40 : 24));
  p.G.lerp(tgt.G, k); p.B.lerp(tgt.B, k);
  for (const key of ['lean', 'twist', 'roll', 'feather', 'face']) p[key] += (tgt[key] - p[key]) * k;

  if (!m.human) {
    m.torso.rotation.y = p.twist;
    m.torso.rotation.x = p.lean;
    m.torso.rotation.z = p.roll;
  }

  // shaft from the grip toward the blade; the blade faces fore and aft while pulling, lies flat
  // (feathered) on the recovery and turns along the hull for the espetada
  ay.subVectors(p.G, p.B).normalize();
  // top hand on the grip, the stroke-side hand low on the shaft; elbows point out and down
  lowHand.copy(p.G).addScaledVector(ay, -0.6);
  grip.copy(p.G);
  if (m.human) {
    // a real arm may fall short of the target, so the paddle goes where the hands actually are
    poseHumanArms(m, p, tgt.side);
    grip.copy(m.palms.top);
    ay.subVectors(m.palms.top, m.palms.low).normalize();
  }
  az.set(p.face, p.feather * 1.5, (1 - p.face) * (1 - p.feather * 0.6)).normalize();
  az.addScaledVector(ay, -az.dot(ay));
  if (az.lengthSq() < 1e-6) az.set(0, 0, 1);
  az.normalize();
  ax.crossVectors(ay, az);
  basis.makeBasis(ax, ay, az);
  m.paddle.position.copy(grip);
  m.paddle.quaternion.setFromRotationMatrix(basis);

  if (!m.human) for (const a of m.arms) {
    shoulder.set(a.sx * 0.2, 0.49, 0).applyEuler(m.torso.rotation).add(m.body.position);
    const H = a.sx === tgt.side ? lowHand : p.G;
    pole.set(a.sx, -0.6, 0.4);
    solveElbow(shoulder, H, pole, elbow);
    aim(a.upper, shoulder, elbow);
    aim(a.fore, elbow, H);
    a.hand.position.copy(H);
    a.hand.quaternion.copy(a.fore.quaternion);
  }

  // splashes: a little at the catch, water thrown up as the blade leaves, a burst on the stab
  // and spray off a planted blade at speed
  const s = c.stroke;
  const P = s && STROKES[s.type];
  let spray = null;
  if (s && s !== seen.stroke) { seen.stroke = s; seen.exited = false; spray = { n: 5, up: 0.8 }; }
  if (s && !seen.exited && s.t >= P.dur * 0.92) { seen.exited = true; spray = { n: s.type === 'forte' ? 22 : 15, up: 2.4 }; }
  if (c.plant && !seen.plant) spray = { n: 16, up: 1.6 };
  if (c.plant && !(s && s.t < P.dur) && Math.hypot(c.vx, c.vy) > 3 && Math.random() < dt * 30) spray = { n: 2, up: 1.2 };
  seen.plant = c.plant;
  if (spray && !first) {
    m.root.updateMatrixWorld(true);
    m.bladeMid.getWorldPosition(blade);
    m.fx.push({ at: blade.clone(), n: spray.n, up: spray.up, vx: c.vx, vy: c.vy });
  }
}
