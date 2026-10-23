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

// Lofted hull: stations from stern (s = 0) to bow (s = 1), each an ellipse that is deep below the
// sheer line and only slightly domed above it. Vertex colours paint the hull below and the deck above.
function loft({ len, halfW, depth, deck, rocker = 0.1, bowSharp = 0.45, stations = 48, ring = 20, hull, top }) {
  const pos = [], col = [], idx = [];
  const ch = new THREE.Color(hull), ct = new THREE.Color(top);
  for (let i = 0; i < stations; i++) {
    const s = i / (stations - 1);
    const w = Math.max(0.004, Math.pow(Math.sin(Math.PI * s), s > 0.5 ? bowSharp : 0.7));
    const z = (0.5 - s) * len;
    const keelLift = rocker * Math.pow(2 * s - 1, 2);
    for (let j = 0; j < ring; j++) {
      const th = j / ring * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const below = sn < 0;
      pos.push(c * halfW * w, (below ? sn * depth * Math.pow(w, 0.6) : sn * deck * w) + keelLift, z);
      const k = below ? ch : ct;
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

const gloss = (color, extra) => new THREE.MeshPhongMaterial(Object.assign({ color, shininess: 60, specular: 0x444444 }, extra || {}));
const matte = color => new THREE.MeshLambertMaterial({ color });

// A unit cylinder (height 1 along y) stretched between two points each frame: arms and legs.
function limb(r1, r2, color) {
  const g = new THREE.CylinderGeometry(r2, r1, 1, 10);
  g.translate(0, 0.5, 0);
  return new THREE.Mesh(g, matte(color));
}
const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
function placeLimb(mesh, a, b) {
  mesh.position.copy(a);
  tmp.subVectors(b, a);
  const len = tmp.length();
  mesh.quaternion.setFromUnitVectors(UP, tmp.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

// Two-bone arm: shoulder S to hand H with the elbow pushed toward pole.
const UPPER = 0.3, FORE = 0.29;
function solveElbow(S, H, pole, out) {
  const d = Math.min(S.distanceTo(H), UPPER + FORE - 0.001);
  const dir = new THREE.Vector3().subVectors(H, S).normalize();
  const cosA = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return out.copy(S).addScaledVector(dir, UPPER * cosA).addScaledVector(perp, UPPER * sinA);
}

const SKIN = 0x9a6440, SHIRT = 0x1f2d36, SHORTS = 0x2a2a30;
const PADDLE_LEN = 1.3, BLADE_LEN = 0.46;

// V1 with the ama on the left (local -x); forward is local -z. The paddler sits at z = SEAT.
const SEAT = 0.55;
export function buildCanoe(color) {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  tilt.rotation.order = 'YXZ';

  const hullMat = gloss(0xffffff, { vertexColors: true, shininess: 80 });
  const hull = new THREE.Mesh(loft({ len: HULL, halfW: 0.24, depth: 0.3, deck: 0.1, rocker: 0.12, hull: 0xf3f1ea, top: color }), hullMat);
  hull.position.y = 0.16; tilt.add(hull);
  // cockpit opening
  const cockpit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 20), matte(0x1a1d20));
  cockpit.scale.set(0.17, 1, 0.42); cockpit.position.set(0, 0.25, SEAT - 0.05); tilt.add(cockpit);

  const ama = new THREE.Mesh(loft({ len: 3.0, halfW: 0.1, depth: 0.12, deck: 0.09, rocker: 0.18, bowSharp: 0.5, stations: 28, ring: 14, hull: 0xe9e2d0, top: 0xf5f1e6 }), gloss(0xffffff, { vertexColors: true }));
  ama.position.set(AMA_X, 0.04, 0.45); tilt.add(ama);
  // iako: two curved booms from the hull out to the ama, each with a short stanchion
  for (const z of [-0.55, 1.55]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, 0.27, z), new THREE.Vector3(-0.6, 0.42, z), new THREE.Vector3(-1.4, 0.38, z), new THREE.Vector3(AMA_X + 0.05, 0.3, z),
    ]);
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.03, 6), gloss(0x2b2b2b, { shininess: 90 })));
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), gloss(0x2b2b2b));
    st.position.set(AMA_X + 0.05, 0.2, z); tilt.add(st);
  }

  // paddler: pelvis at the seat, torso twists and leans, arms are solved to the paddle each frame
  const body = new THREE.Group(); body.position.set(0, 0.28, SEAT); tilt.add(body);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), matte(SHORTS));
  hips.scale.set(1, 0.6, 0.9); body.add(hips);
  for (const sx of [-1, 1]) {
    // legs stretched forward inside the hull, knees just above the deck
    const thigh = limb(0.065, 0.05, SHORTS);
    placeLimb(thigh, new THREE.Vector3(sx * 0.08, 0, 0), new THREE.Vector3(sx * 0.1, 0.07, -0.42)); body.add(thigh);
    const shin = limb(0.045, 0.035, SHIRT);
    placeLimb(shin, new THREE.Vector3(sx * 0.1, 0.07, -0.42), new THREE.Vector3(sx * 0.08, -0.14, -0.82)); body.add(shin);
  }
  const torso = new THREE.Group(); torso.rotation.order = 'YXZ'; body.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.5, 14), matte(SHIRT));
  chest.scale.set(1, 1, 0.68); chest.position.y = 0.27; torso.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), matte(SKIN)); neck.position.y = 0.56; torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), matte(SKIN));
  head.scale.set(0.92, 1.08, 1); head.position.y = 0.7; torso.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.117, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), matte(color));
  cap.position.y = 0.72; torso.add(cap);
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), matte(color));
  visor.scale.set(1, 1, 1.25); visor.position.set(0, 0.73, -0.06); torso.add(visor);
  const arms = [];
  for (const sx of [-1, 1]) {
    const upper = limb(0.048, 0.042, SHIRT), fore = limb(0.042, 0.035, SKIN);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), matte(SKIN));
    tilt.add(upper, fore, hand);
    arms.push({ sx, upper, fore, hand });
  }

  // paddle: grip at the origin, shaft down local -y, blade face in the local xy plane
  const paddle = new THREE.Group(); tilt.add(paddle);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, PADDLE_LEN - BLADE_LEN * 0.6, 8), gloss(0x222222, { shininess: 90 }));
  shaft.position.y = -(PADDLE_LEN - BLADE_LEN * 0.6) / 2; paddle.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), gloss(0x222222));
  grip.rotation.z = Math.PI / 2; paddle.add(grip);
  const bs = new THREE.Shape();
  bs.moveTo(0, 0); bs.quadraticCurveTo(0.12, -0.06, 0.11, -0.3); bs.quadraticCurveTo(0.1, -0.44, 0, -BLADE_LEN);
  bs.quadraticCurveTo(-0.1, -0.44, -0.11, -0.3); bs.quadraticCurveTo(-0.12, -0.06, 0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bs, { depth: 0.012, bevelEnabled: false, curveSegments: 8 }), gloss(0xf5b841, { side: THREE.DoubleSide }));
  blade.position.set(0, -(PADDLE_LEN - BLADE_LEN), -0.006); paddle.add(blade);

  const bladeMid = new THREE.Object3D(); bladeMid.position.y = -(PADDLE_LEN - BLADE_LEN / 2); paddle.add(bladeMid);

  return { root, tilt, body, torso, paddle, arms, bladeMid, pose: null, fx: [], seen: { stroke: null, exited: false, plant: 0, plantT: 0 } };
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
// espetada: the paddle is raised and stabbed in upright beside the hip, face along the hull
const STAB = [
  { at: 0, G: V(0.3, 1.55, zs + 0.15), B: V(0.55, 0.45, zs + 0.5), lean: 0, twist: -0.35, roll: -0.05, face: 1 },
  { at: 1, G: V(0.36, 1.05, zs + 0.42), B: V(0.56, -0.48, zs + 0.82), lean: 0.08, twist: -0.55, roll: -0.12, face: 1 },
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
    shoulder.set(a.sx * 0.2, 0.47, 0).applyEuler(m.torso.rotation).add(m.body.position);
    const H = a.sx === tgt.side ? lowHand : p.G;
    pole.set(a.sx, -0.6, 0.4);
    solveElbow(shoulder, H, pole, elbow);
    placeLimb(a.upper, shoulder, elbow);
    placeLimb(a.fore, elbow, H);
    a.hand.position.copy(H);
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
