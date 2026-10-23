// Low-poly meshes built from primitives. three.js comes from the CDN script tag as a global.
import { HULL, HALF, AMA_X } from '../canoe.js';
import { STROKES } from '../strokes.js';

const THREE = window.THREE;

// Physics (x, y, height) to three.js coordinates: the course runs toward -z.
export const P = (x, y, h) => new THREE.Vector3(x, h || 0, -y);

export function flatMat(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {}));
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

// OC1 with the ama on the left (local -x); forward is local -z.
export function buildCanoe(color) {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  tilt.rotation.order = 'YXZ';
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), flatMat(color));
  hull.scale.set(0.3, 0.28, HALF); hull.position.y = 0.05; tilt.add(hull);
  const deck = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(0xeeeeee));
  deck.scale.set(0.26, 0.08, HALF * 0.97); deck.position.y = 0.2; tilt.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, HULL * 0.55), flatMat(0xf5b841));
  stripe.position.set(0, 0.29, -1.1); tilt.add(stripe);
  const ama = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), flatMat(0xe9e2d0));
  ama.scale.set(0.12, 0.13, 1.5); ama.position.set(AMA_X, 0.0, -0.1); tilt.add(ama);
  for (const z of [-0.9, 0.9]) {
    const iako = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(AMA_X) + 0.2, 0.07, 0.09), flatMat(0x7a4a2b));
    iako.position.set(AMA_X / 2, 0.42, z); iako.rotation.z = -0.1; tilt.add(iako);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), flatMat(0x7a4a2b));
    strut.position.set(AMA_X + 0.05, 0.2, z); tilt.add(strut);
  }
  const body = new THREE.Group(); body.position.set(0, 0.3, 0.6); tilt.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), flatMat(0x22313a));
  torso.position.y = 0.42; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flatMat(0x7b4a2f));
  head.position.y = 0.88; body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(color));
  cap.position.y = 0.9; body.add(cap);
  const paddle = new THREE.Group(); paddle.position.set(0, 0.6, 0); body.add(paddle);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), flatMat(0x2b1a10));
  shaft.position.y = -0.3; paddle.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.48, 0.03), flatMat(0xf5b841));
  blade.position.y = -1.05; paddle.add(blade);
  return { root, tilt, paddle, body };
}

// Copies the canoe's physics state onto its mesh and animates the paddle.
export function poseCanoe(m, c) {
  m.root.position.set(c.x, c.heave, -c.y);
  m.root.rotation.y = -c.psi;
  let roll = c.roll;
  if (c.huliT > 0) roll = Math.min(Math.PI * 0.95, (3 - c.huliT) * 4) * (c.huliT > 0.4 ? 1 : c.huliT / 0.4);
  m.tilt.rotation.x = c.pitch;
  m.tilt.rotation.z = -roll;
  // reach forward, pull back past the hip, recover on the same side
  const s = c.stroke;
  const side = s ? s.side : (c.lastSide || 1);
  const ph = s ? s.t / STROKES[s.type].dur : 2;
  const diag = s && s.type === 'diagonal';
  m.paddle.position.x = side * (diag ? 0.5 : 0.3);
  if (ph < 1) {
    m.paddle.rotation.x = 0.9 - ph * 1.6;
    m.paddle.rotation.z = side * (diag ? 0.55 + ph * 0.6 : 0.25);
  } else {
    const rec = Math.min(1, (ph - 1) * 2);
    m.paddle.rotation.x = -0.7 + rec * 1.4;
    m.paddle.rotation.z = side * (0.6 - rec * 0.35);
  }
  m.body.rotation.y = side * (ph < 1 ? 0.35 - ph * 0.5 : 0.1);
}
