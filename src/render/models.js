// Low-poly meshes built from primitives. three.js comes from the CDN script tag as a global.
import { HULL, HALF, AMA_X } from '../canoe.js';
import { STROKES } from '../strokes.js';

const THREE = window.THREE;

// Physics (x, y, height) to three.js coordinates: the course runs toward -z.
export const P = (x, y, h) => new THREE.Vector3(x, h || 0, -y);

export function flatMat(color, extra) {
  return new THREE.MeshPhongMaterial(Object.assign({ color, flatShading: true, shininess: 8, specular: 0x111111 }, extra || {}));
}

export function mountain(radius, height, color, seg, seed) {
  const g = new THREE.ConeGeometry(radius, height, seg || 9, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < height / 2 - 0.1) {
      const n = Math.sin(i * 12.9898 + seed) * 43758.5453;
      const j = (n - Math.floor(n) - 0.5) * radius * 0.25;
      p.setX(i, p.getX(i) + j); p.setZ(i, p.getZ(i) + j * 0.7);
      p.setY(i, y + j * 0.3);
    }
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, flatMat(color));
  m.position.y = height / 2 - 2;
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

export function dome(rx, ry, rz, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(color));
  m.scale.set(rx, ry, rz);
  return m;
}

export function palm(h) {
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 5), flatMat(0x8a6a44));
  trunk.position.y = h / 2; trunk.rotation.z = 0.12;
  grp.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4, 4), flatMat(0x2f8a4b));
    leaf.position.set(0.12 * h, h, 0);
    leaf.rotation.z = Math.PI / 2 + 0.5;
    const pivot = new THREE.Group(); pivot.rotation.y = i / 6 * Math.PI * 2; pivot.add(leaf);
    grp.add(pivot);
  }
  return grp;
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

export function honu() {
  const g = new THREE.Group();
  g.add(dome(0.6, 0.25, 0.75, 0x3f6b45));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), flatMat(0x6fae7a));
  head.position.set(0, 0, -0.85); g.add(head);
  return g;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Lofted hull, stern (s = 0) to bow (s = 1). Each station is a V-bottomed section below the sheer
// and a low crowned deck above it; the sheer sweeps up at the bow like a racing V1.
// paint(s, up, j) returns the colour of each vertex (up: true on the deck).
function loft({ len, halfW, depth, deck, rocker = 0.1, bowRise = 0.16, stations = 64, ring = 24, paint }) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < stations; i++) {
    const s = i / (stations - 1);
    const sw = Math.pow(s, 0.92);
    const w = Math.max(0.003, Math.pow(Math.sin(Math.PI * sw), s > 0.5 ? 0.62 : 0.78));
    const z = (0.5 - s) * len;
    const sheer = bowRise * smooth(0.72, 1, s) + bowRise * 0.35 * smooth(0.2, 0, s);
    const keel = rocker * Math.pow(2 * s - 1, 2) + bowRise * 0.6 * smooth(0.8, 1, s);
    for (let j = 0; j < ring; j++) {
      const th = j / ring * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const up = sn >= 0;
      // a soft V below, a gentle crown above
      const y = up ? sheer + sn * deck * w : Math.max(-1, sn) * Math.pow(Math.abs(sn), 0.15) * depth * Math.pow(w, 0.55) + keel * (1 - Math.abs(c)) + sheer * Math.abs(c);
      pos.push(c * halfW * w, y, z);
      const k = paint(s, up, Math.abs(sn));
      col.push(k.r, k.g, k.b);
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
function solveElbow(S, H, pole, out) {
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
  const body = new THREE.Group(); body.position.set(0, 0.26, SEAT); tilt.add(body);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), tights);
  hips.scale.set(1.05, 0.62, 0.95); body.add(hips);
  // legs out in front, knees slightly up, feet on the foot well
  for (const sx of [-1, 1]) {
    const knee = new THREE.Vector3(sx * 0.11, 0.12, -0.44), foot = new THREE.Vector3(sx * 0.09, -0.08, -0.86);
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

// V1 with the ama on the left (local -x); forward is local -z. The paddler sits at z = SEAT.
// opts: { shirt, cap, skin, beard } for the paddler; accent paints the hull ends and cockpit trim.
const SEAT = 0.55;
const WHITE = new THREE.Color(0xf4f4f1);
export function buildCanoe(accent, opts = {}) {
  const o = Object.assign({ shirt: 0x2aa6e0, cap: 0xf26a1b, skin: 0xb07a55, beard: false }, opts);
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  tilt.rotation.order = 'YXZ';
  const acc = new THREE.Color(accent);

  // white hull with coloured bow and stern caps and a coloured deck panel around the cockpit
  const hullGeo = loft({
    len: HULL, halfW: 0.22, depth: 0.28, deck: 0.09, rocker: 0.1, bowRise: 0.17,
    paint: (s, up) => (s > 0.9 || s < 0.06 || (up && s > 0.38 && s < 0.62)) ? acc : WHITE,
  });
  const hull = new THREE.Mesh(hullGeo, gloss(0xffffff, { vertexColors: true }));
  hull.position.y = 0.14; tilt.add(hull);
  // cockpit: a dark well with a raised rim and the seat
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 28), std(0x1b1e22, 0.8));
  well.scale.set(0.16, 1, 0.55); well.position.set(0, 0.235, SEAT - 0.2); tilt.add(well);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 32), gloss(accent));
  rim.rotation.x = Math.PI / 2; rim.scale.set(0.165, 0.56, 0.35); rim.position.set(0, 0.25, SEAT - 0.2); tilt.add(rim);

  // ama: long and slim, upswept at the front, white with coloured tips
  const amaGeo = loft({
    len: 3.1, halfW: 0.095, depth: 0.12, deck: 0.08, rocker: 0.14, bowRise: 0.14, stations: 40, ring: 16,
    paint: s => (s > 0.88 || s < 0.06) ? acc : WHITE,
  });
  const ama = new THREE.Mesh(amaGeo, gloss(0xffffff, { vertexColors: true }));
  ama.position.set(AMA_X, 0.03, 0.4); tilt.add(ama);
  // iako: carbon booms across the deck, arching out and down to pegs on the ama
  const carbon = std(0x1c1d20, 0.3);
  for (const z of [-0.5, 1.55]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 0.24, z), new THREE.Vector3(-0.3, 0.33, z), new THREE.Vector3(-1.0, 0.44, z),
      new THREE.Vector3(-1.6, 0.36, z), new THREE.Vector3(AMA_X + 0.02, 0.26, z),
    ]);
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.026, 8), carbon));
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.18, 8), carbon);
    peg.position.set(AMA_X + 0.02, 0.17, z); tilt.add(peg);
  }

  const { body, torso, head, arms } = buildPaddler(tilt, o);

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

  return { root, tilt, body, torso, head, paddle, arms, bladeMid, pose: null, fx: [], seen: { stroke: null, exited: false, plant: 0, plantT: 0 } };
}

// Paddle poses in the canoe's frame (x right, y up, z back): G is the top hand on the grip,
// B the middle of the blade. Keyframes follow a real V1 stroke: the paddler leans well forward
// with the top hand high to plant the blade by the feet, pulls with the torso unwinding until
// the shaft is upright, exits at the hip, then swings the paddle forward low and flat.
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
  { at: 0, G: V(0.02, 1.38, zs - 0.6), B: V(0.42, -0.12, zs - 1.05), lean: -0.62, twist: 0.55 },
  { at: 0.45, G: V(0.12, 1.22, zs - 0.42), B: V(0.45, -0.34, zs - 0.38), lean: -0.36, twist: 0.18, roll: -0.08 },
  { at: 1, G: V(0.2, 1.02, zs - 0.12), B: V(0.4, -0.1, zs + 0.38), lean: -0.12, twist: -0.2, roll: -0.04 },
];
// sweep (diagonal): blade planted near the bow, swept wide out to the side and back to the hip
const SWEEP = [
  { at: 0, G: V(-0.05, 0.85, zs - 0.4), B: V(0.55, -0.15, zs - 1.15), lean: -0.5, twist: 0.8, roll: -0.1 },
  { at: 0.5, G: V(0.05, 0.75, zs - 0.12), B: V(1.5, -0.15, zs - 0.3), lean: -0.3, twist: 0.15, roll: -0.25 },
  { at: 1, G: V(0.12, 0.8, zs + 0.0), B: V(0.75, -0.1, zs + 0.6), lean: -0.15, twist: -0.55, roll: -0.12 },
];
// recovery after the exit: lift, swing forward low with the blade feathered, then rise to the catch
const RECOVER = [
  { at: 0, G: V(0.2, 1.02, zs - 0.12), B: V(0.42, 0.3, zs + 0.4), lean: -0.12, twist: -0.2 },
  { at: 0.5, G: V(0.12, 0.88, zs - 0.18), B: V(0.55, 0.18, zs - 0.8), lean: -0.32, twist: 0.2, feather: 1 },
  { at: 1, G: V(0.05, 1.3, zs - 0.5), B: V(0.45, 0.12, zs - 1.0), lean: -0.55, twist: 0.45, feather: 0.2 },
];
const RECOVER_T = 0.45;   // seconds from the exit to ready for the next catch
// espetada: the torso turns toward the stern and the paddle is stabbed in behind the hip, blade
// face along the hull and the shaft raked back, so it drags aft like a rudder
const STAB = [
  { at: 0, G: V(0.28, 1.5, zs + 0.1), B: V(0.55, 0.4, zs + 0.75), lean: 0.02, twist: -0.5, roll: -0.05, face: 1 },
  { at: 1, G: V(0.3, 1.08, zs + 0.3), B: V(0.62, -0.42, zs + 1.55), lean: 0.15, twist: -0.9, roll: -0.12, face: 1 },
];
const STAB_T = 0.18;

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
  if (s && s.t < P.dur) return mirror(keyed(s.type === 'diagonal' ? SWEEP : PULL, s.t / P.dur), side);
  const since = s ? s.t - P.dur : RECOVER_T;
  return mirror(keyed(RECOVER, Math.min(1, since / RECOVER_T)), side);
}

const basis = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), lowHand = new THREE.Vector3(), pole = new THREE.Vector3();
const blade = new THREE.Vector3();

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
  const tgt = targetPose(c, m, t);
  const first = !m.pose;
  if (first) m.pose = { G: tgt.G.clone(), B: tgt.B.clone(), lean: tgt.lean, twist: tgt.twist, roll: tgt.roll, feather: tgt.feather, face: tgt.face };
  const p = m.pose;
  // switching sides, the blade travels up and over the deck instead of through it
  if (Math.sign(p.B.x) !== Math.sign(tgt.B.x)) tgt.B.y = Math.max(tgt.B.y, 0.55);
  const k = 1 - Math.exp(-dt * (c.plant ? 40 : 24));
  p.G.lerp(tgt.G, k); p.B.lerp(tgt.B, k);
  for (const key of ['lean', 'twist', 'roll', 'feather', 'face']) p[key] += (tgt[key] - p[key]) * k;

  m.torso.rotation.y = p.twist;
  m.torso.rotation.x = p.lean;
  m.torso.rotation.z = p.roll;

  // shaft from the grip toward the blade; the blade faces fore and aft while pulling, lies flat
  // (feathered) on the recovery and turns along the hull for the espetada
  ay.subVectors(p.G, p.B).normalize();
  az.set(p.face, p.feather * 1.5, (1 - p.face) * (1 - p.feather * 0.6)).normalize();
  az.addScaledVector(ay, -az.dot(ay));
  if (az.lengthSq() < 1e-6) az.set(0, 0, 1);
  az.normalize();
  ax.crossVectors(ay, az);
  basis.makeBasis(ax, ay, az);
  m.paddle.position.copy(p.G);
  m.paddle.quaternion.setFromRotationMatrix(basis);

  // top hand on the grip, the stroke-side hand low on the shaft; elbows point out and down
  lowHand.copy(p.G).addScaledVector(ay, -0.6);
  for (const a of m.arms) {
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
