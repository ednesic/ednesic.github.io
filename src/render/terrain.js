// Scenery meshes shaped by noise instead of plain primitives: hills with ridges and gullies coloured
// by height and slope, granite domes, palms with drooping fronds and buildings with windows.
// Everything here is decoration and only ever built once per race.
const THREE = window.THREE;

function hash(x, y, s) { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 5) {
  let a = 0.5, t = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise(x, y, s + i * 17); x *= 2.03; y *= 2.03; a *= 0.5; }
  return t;
}
// sharp crests where the noise folds over: ridgelines and the gullies between them
function ridged(x, y, s, oct = 5) {
  let a = 0.5, t = 0;
  for (let i = 0; i < oct; i++) { t += a * (1 - Math.abs(2 * vnoise(x, y, s + i * 31) - 1)); x *= 2.1; y *= 2.1; a *= 0.5; }
  return t;
}

const SAND = new THREE.Color(0xd9c79a), ROCK = new THREE.Color(0x857a6a), DARK = new THREE.Color(0x4d4a42);
const c1 = new THREE.Color(), c2 = new THREE.Color();

// A hill or island: radius and height in metres, `green` the vegetation colour.
// crater: depth of a summit bowl as a share of the height (Diamond Head). Built on a flat grid,
// so its base runs out under the water.
export function terrain(radius, height, green, seed, { crater = 0, rocky = 0.3, res = 110 } = {}) {
  const N = res, size = radius * 2.3;
  const g = new THREE.PlaneGeometry(size, size, N, N);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const veg = new THREE.Color(green), vegDark = veg.clone().multiplyScalar(0.62);
  const hs = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // warp the outline so it is not a circle
    const wx = x / radius, wz = z / radius;
    const d = Math.hypot(wx, wz) * (0.85 + 0.35 * fbm(wx * 1.3 + 4, wz * 1.3, seed, 3));
    let prof = Math.pow(Math.max(0, 1 - d), 1.25);
    prof *= 0.55 + 0.6 * ridged(wx * 2.2, wz * 2.2, seed);
    if (crater) prof -= crater * Math.pow(Math.max(0, 1 - d / 0.38), 2);
    const h = height * prof + fbm(wx * 9, wz * 9, seed + 5, 3) * height * 0.03 * Math.min(1, prof * 6) - 4;
    hs[i] = h;
    p.setY(i, h);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const h = hs[i], slope = 1 - nrm.getY(i), x = p.getX(i), z = p.getZ(i);
    const n = fbm(x / radius * 6, z / radius * 6, seed + 9, 3);
    // vegetation, darker in the gullies; bare rock on cliffs and high up; a sand rim at the water
    c1.copy(vegDark).lerp(veg, Math.min(1, n * 1.4));
    const rock = Math.min(1, Math.max(0, (slope - 0.35 + rocky * 0.3) * 3 + (h / height - 0.75) * 2 * rocky));
    c2.copy(DARK).lerp(ROCK, n);
    c1.lerp(c2, rock);
    if (h < 3) c1.lerp(SAND, Math.min(1, (3 - h) / 3));
    col[i * 3] = c1.r; col[i * 3 + 1] = c1.g; col[i * 3 + 2] = c1.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

// A bare granite dome (Pão de Açúcar, Urca): steep streaked rock with a skirt of forest at the foot.
export function granite(rx, ry, rz, green, seed) {
  const g = new THREE.SphereGeometry(1, 72, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const veg = new THREE.Color(green), stone = new THREE.Color(0x8b8478), streak = new THREE.Color(0x55524b);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    // the sugarloaf is steeper at the sides than a sphere and slightly lumpy
    const r = 1 + (fbm(a * 3, y * 4, seed, 4) - 0.5) * 0.16;
    const pinch = 1 - 0.25 * Math.pow(y, 3);
    x *= r * pinch; z *= r * pinch; y = Math.pow(y, 0.8) * (1 + (fbm(a * 2, 3, seed + 3, 2) - 0.5) * 0.1);
    p.setXYZ(i, x, y, z);
    // rain streaks run down the rock; trees cling only to the lower slopes
    const st = vnoise(a * 40, y * 1.5, seed + 7);
    c1.copy(stone).lerp(streak, Math.max(0, st - 0.45) * 1.6 + y * 0.15);
    const forest = Math.min(1, Math.max(0, (0.32 - y) * 6 + (fbm(a * 9, y * 9, seed + 11, 3) - 0.5) * 2));
    c1.lerp(veg.clone().multiplyScalar(0.7 + 0.5 * st), forest);
    col[i * 3] = c1.r; col[i * 3 + 1] = c1.g; col[i * 3 + 2] = c1.b;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  m.scale.set(rx, ry, rz);
  return m;
}

// --- palms: one shared trunk and crown geometry, scaled per tree ---
let PALM = null;
function frondTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const x = cv.getContext('2d');
  // the frond outline filled solid, then cut into leaflets slanting back from the rib
  const gr = x.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, '#2f6b2c'); gr.addColorStop(0.5, '#5c9a3a'); gr.addColorStop(1, '#2f6b2c');
  x.fillStyle = gr;
  x.beginPath(); x.moveTo(32, 0);
  for (let yy = 0; yy <= 256; yy += 8) x.lineTo(32 + 31 * Math.sin(yy / 256 * Math.PI), yy);
  for (let yy = 256; yy >= 0; yy -= 8) x.lineTo(32 - 31 * Math.sin(yy / 256 * Math.PI), yy);
  x.fill();
  x.globalCompositeOperation = 'destination-out'; x.lineWidth = 1.6;
  for (let yy = -20; yy < 256; yy += 6) { x.beginPath(); x.moveTo(30, yy); x.lineTo(0, yy + 22); x.moveTo(34, yy); x.lineTo(64, yy + 22); x.stroke(); }
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = '#7a6a3a'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
  return new THREE.CanvasTexture(cv);
}
function palmParts() {
  if (PALM) return PALM;
  // trunk: a gently curving tube 1 m tall, scaled to the tree
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.5, 0), new THREE.Vector3(0.1, 1, 0));
  const trunk = new THREE.TubeGeometry(curve, 10, 0.022, 7, false);
  // crown: nine fronds, each a bent strip that arches out and droops
  const pos = [], uv = [], idx = [];
  const F = 9, S = 8;
  for (let f = 0; f < F; f++) {
    const a = f / F * Math.PI * 2 + (f % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a);
    const lift = 0.35 - (f % 3) * 0.18;
    const base = pos.length / 3;
    for (let s = 0; s <= S; s++) {
      const k = s / S, r = k * 0.42, y = 1 + lift * k * 0.4 - k * k * 0.32;
      const w = 0.11 * Math.sin(Math.PI * Math.min(1, k * 1.1 + 0.05));
      for (const e of [-1, 1]) {
        pos.push(0.1 + ca * r - sa * w * e, y - Math.abs(e) * 0.01 * k, sa * r + ca * w * e);
        uv.push(e < 0 ? 0 : 1, k);
      }
      if (s < S) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  crown.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  crown.setIndex(idx); crown.computeVertexNormals();
  PALM = {
    trunk, crown,
    bark: new THREE.MeshStandardMaterial({ color: 0x7d6347, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.8 }),
  };
  return PALM;
}
export function palm(h) {
  const P = palmParts(), grp = new THREE.Group();
  grp.add(new THREE.Mesh(P.trunk, P.bark), new THREE.Mesh(P.crown, P.leaf));
  grp.scale.setScalar(h);
  grp.rotation.y = Math.random() * Math.PI * 2;
  return grp;
}

// --- buildings: facades with rows of windows and balconies ---
let FACADE = null;
function facadeTexture() {
  if (FACADE) return FACADE;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  // one storey, two bays: windows with a dark glass gradient and a balcony slab under them
  for (const bx of [8, 72]) {
    const gr = x.createLinearGradient(0, 20, 0, 92);
    gr.addColorStop(0, '#3d4f5c'); gr.addColorStop(1, '#7e95a3');
    x.fillStyle = gr; x.fillRect(bx, 22, 48, 70);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(bx + 24, 22, 2, 70);
    x.fillStyle = '#c9c2b6'; x.fillRect(bx - 4, 96, 56, 8);
  }
  x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, 120, 128, 8);
  FACADE = new THREE.CanvasTexture(cv);
  FACADE.wrapS = FACADE.wrapT = THREE.RepeatWrapping;
  return FACADE;
}
// w wide (along the beach), h tall, d deep; storeys about 3 m, bays about 6 m
export function building(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.abs(nrm.getX(i)) > 0.5 ? d : w;
    if (Math.abs(nrm.getY(i)) > 0.5) uv.setXY(i, 0, 0);   // roof: plain colour from the white corner
    else uv.setXY(i, uv.getX(i) * side / 6, uv.getY(i) * h / 3);
  }
  const mat = new THREE.MeshStandardMaterial({ color, map: facadeTexture(), roughness: 0.75 });
  const m = new THREE.Mesh(g, mat);
  m.position.y = h / 2;
  const grp = new THREE.Group(); grp.add(m);
  // a rooftop box for the lift and water tank
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 2.4, d * 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 }));
  top.position.set((Math.random() - 0.5) * w * 0.4, h + 1.2, 0); grp.add(top);
  return grp;
}
