// three.js view of a race: water mesh, scenery, canoes, wake and the chase camera.
import { clamp, axes } from '../utils.js';
import { HALF } from '../canoe.js';
import { P, flatMat, labelSprite, finishArch, honu, buildCanoe, poseCanoe } from './models.js';
import { SCENERY } from './scenery.js';
import { Ocean } from './water.js';

const THREE = window.THREE;

const MAX_WAKE = 600;
const MAX_SPRAY = 700;
const RAIN_DROPS = 1400, RAIN_BOX = 60;
const GUSTS = 220, GUST_BOX = 70;
const CONFETTI = 900;
const CONFETTI_COLS = [0xf5b841, 0xe8432e, 0x2aa6e0, 0xeef7f1, 0x2f8f5b, 0xd9455f, 0x7b5cc4];

// how each weather tints the sky and the light: grey is the share of storm grey mixed in
const LOOK = {
  sol: { grey: 0, sun: 1.1, hemi: 0.75, fog: 1, glint: 1, cloud: 0.25, cloudCol: 0xffffff },
  nublado: { grey: 0.4, sun: 0.55, hemi: 0.75, fog: 0.75, glint: 0.25, cloud: 0.75, cloudCol: 0xc9d0d6 },
  chuva: { grey: 0.65, sun: 0.35, hemi: 0.65, fog: 0.4, glint: 0.05, cloud: 0.95, cloudCol: 0x8a949c },
};
// paddler outfits and canoe paint (the hull takes the racer's colour): the player first, rivals take the rest in turn
const OUTFITS = [
  { shirt: 0x2aa6e0, cap: 0xf26a1b, skin: 0xb07a55, beard: true, deck: 0xf4f4f1, trim: 0x15171a },
  { shirt: 0xf4f1e8, cap: 0x1f2a36, skin: 0x8a5a3c, beard: false, deck: 0x1c1d20, trim: 0xf4f4f1 },
  { shirt: 0xe4c23a, cap: 0xffffff, skin: 0xd8a580, beard: false, deck: 0xf4f4f1, trim: 0x2f7fd1 },
  { shirt: 0x2f8f5b, cap: 0x2f8f5b, skin: 0x6e4630, beard: true, deck: 0xe9e4d6, trim: 0x15171a },
  { shirt: 0xd9455f, cap: 0x101418, skin: 0xc48e66, beard: false, deck: 0x15171a, trim: 0xe9b730 },
  { shirt: 0x3b4a8c, cap: 0xe8e2d4, skin: 0x9c6a48, beard: true, deck: 0xf4f4f1, trim: 0x7b5cc4 },
  { shirt: 0x1fa3a0, cap: 0xf4f1e8, skin: 0xc8956c, beard: false, deck: 0xd8dde0, trim: 0x15171a },
];

// A blurred sky-and-sea dome for reflections on the hull, paddle and sunglasses.
function envMap(renderer, top, hor, sea) {
  const geo = new THREE.SphereGeometry(10, 32, 16), col = [], c = new THREE.Color();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    if (h > 0) c.copy(hor).lerp(top, Math.pow(h, 0.6)); else c.copy(hor).lerp(sea, Math.min(1, -h * 4));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose(); geo.dispose();
  return rt.texture;
}
const SUN_DIR = new THREE.Vector3(-0.42, 0.42, -0.8).normalize();   // ahead and to the left, low enough to glint
const ZENITH = new THREE.Color(0x2f6fb3);
const STORM = new THREE.Color(0x76848e);

// a round, soft-edged dot for foam and spray
function softDot() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export class View {
  constructor(stage) {
    this.stage = stage;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    stage.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 6000);

    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.copy(SUN_DIR).multiplyScalar(200);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x335566, 0.75);
    this.scene.add(this.hemi, this.sun);

    // rain: short streaks in a box that follows the camera
    this.rainPos = new Float32Array(RAIN_DROPS * 6);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc8d6e0, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rainDrops = Array.from({ length: RAIN_DROPS }, () => ({ x: (Math.random() - 0.5) * RAIN_BOX, y: Math.random() * 30, z: (Math.random() - 0.5) * RAIN_BOX }));
    this.scene.add(this.rain);

    // wind made visible: faint streaks of spray and air blowing downwind around the canoe
    this.gustPos = new Float32Array(GUSTS * 6);
    const gustGeo = new THREE.BufferGeometry();
    gustGeo.setAttribute('position', new THREE.BufferAttribute(this.gustPos, 3));
    this.gusts = new THREE.LineSegments(gustGeo, new THREE.LineBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.3, depthWrite: false }));
    this.gusts.frustumCulled = false;
    this.gustDrops = Array.from({ length: GUSTS }, () => ({ x: (Math.random() - 0.5) * GUST_BOX, y: 0.3 + Math.random() * 4, z: (Math.random() - 0.5) * GUST_BOX, l: 0.5 + Math.random() }));
    this.scene.add(this.gusts);

    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.ocean = new Ocean(this.scene, { segments: small ? 220 : 300 });

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.camPos = new THREE.Vector3(0, 6, 14);
    this.camPsi = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.baseFov = W < H ? 72 : 58;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // Rebuilds everything that depends on the track and the race.
  build(race) {
    const T = race.track, col = T.colors;
    this.race = race;
    this.scene.remove(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const world = this.world;
    const weather = race.cond.weather, look = LOOK[weather.id];
    const tint = hex => new THREE.Color(hex).lerp(STORM, look.grey);
    const horizon = tint(col.fog);
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, 260 * look.fog, T.fogFar * look.fog);
    this.sun.color.setHex(col.sun);
    this.sun.intensity = look.sun;
    this.hemi.intensity = look.hemi;
    this.hemi.color.copy(tint(col.sky));
    this.ocean.setSea(race.sea, {
      deep: new THREE.Color(col.deep).lerp(STORM, look.grey * 0.3).multiplyScalar(0.85),
      shallow: new THREE.Color(col.shallow).lerp(STORM, look.grey * 0.4),
      skyTop: new THREE.Color(col.sky).lerp(ZENITH, 0.45).lerp(STORM, look.grey),
      skyHor: horizon, fog: horizon,
      sunDir: SUN_DIR, sunCol: new THREE.Color(col.sun), sun: look.glint,
      fogNear: 260 * look.fog, fogFar: T.fogFar * look.fog,
      cloud: look.cloud, cloudCol: new THREE.Color(look.cloudCol).lerp(new THREE.Color(col.sun), 0.15),
    });
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = envMap(this.renderer,
      new THREE.Color(col.sky).lerp(ZENITH, 0.45).lerp(STORM, look.grey), horizon,
      new THREE.Color(col.deep).lerp(STORM, look.grey * 0.3));
    this.rain.visible = weather.id === 'chuva';

    // start line is just two poles: a banner there would fill the camera at the gun
    const poles = y => {
      for (const x of [T.bounds[0] + 6, T.bounds[1] - 6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), flatMat(0xf5b841));
        pole.position.copy(P(x, y, 4)); world.add(pole);
      }
    };
    poles(0); poles(T.len);
    // the finish: an inflatable arch over the lanes, and a line of floats across the whole course
    this.arch = finishArch(104, 17);
    this.arch.position.copy(P(0, T.len, 0)); world.add(this.arch);
    this.lineFloats = [];
    const floatGeo = new THREE.SphereGeometry(0.32, 10, 8);
    const floatMats = [0xe8432e, 0xeef7f1].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    for (let x = T.bounds[0] + 4, i = 0; x <= T.bounds[1] - 4; x += 3, i++) {
      const f = new THREE.Mesh(floatGeo, floatMats[i % 2]);
      f.userData.x = x; world.add(f); this.lineFloats.push(f);
    }

    this.buoys = [];
    for (let m = 250; m < T.len; m += 250) {
      for (const x of [-30, 30]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.4 }));
        // a flag on a short pole streams downwind
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        pole.position.y = 1.2; b.add(pole);
        const flag = new THREE.Group(); flag.position.y = 2.1; b.add(flag);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1), new THREE.MeshStandardMaterial({ color: 0xffd23a, side: THREE.DoubleSide, roughness: 0.8 }));
        cloth.position.x = 0.45; flag.add(cloth);
        b.userData = { x, y: m, flag, cloth }; world.add(b); this.buoys.push(b);
      }
      const l = labelSprite((T.len - m) + ' m', '#eef7f1'); l.position.copy(P(30, m, 3.2)); l.scale.set(6, 1.5, 1); world.add(l);
    }

    SCENERY[T.id](world, T, race.objs);

    this.honus = race.objs.filter(o => o.k === 'honu').map(o => { const g = honu(); world.add(g); return { o, g }; });

    this.canoes = [];
    const meMesh = buildCanoe(race.me.color ?? 0xd33a2c, OUTFITS[race.me.outfit ?? 0]);   // online, the player's slot sets the colours
    world.add(meMesh.root);
    this.canoes.push({ c: race.me, m: meMesh });
    race.rivals.forEach((r, i) => {
      const m = buildCanoe(r.color, OUTFITS[r.outfit ?? 1 + i % (OUTFITS.length - 1)]);
      const l = labelSprite(r.name, r.css); l.position.y = 3.2; m.root.add(l);
      world.add(m.root);
      this.canoes.push({ c: r, m, rival: true });
    });

    // spray: drops thrown up by the paddle, flying under gravity until they fall back in
    this.spray = [];
    this.sprayPos = new Float32Array(MAX_SPRAY * 3);
    this.sprayGeo = new THREE.BufferGeometry();
    this.sprayGeo.setAttribute('position', new THREE.BufferAttribute(this.sprayPos, 3));
    const drops = new THREE.Points(this.sprayGeo, new THREE.PointsMaterial({ color: 0xf2f8fa, size: 0.16, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false }));
    drops.frustumCulled = false;
    world.add(drops);

    this.wake = [];
    this.wakeGeo = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(MAX_WAKE * 3);
    this.wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    const pts = new THREE.Points(this.wakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, map: softDot(), transparent: true, opacity: 0.75, depthWrite: false }));
    pts.frustumCulled = false;
    world.add(pts);

    // confetti: paper bits shot from the arch when the player crosses, fluttering down onto the water
    this.confetti = [];
    this.confettiMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
    const cc = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) this.confettiMesh.setColorAt(i, cc.setHex(CONFETTI_COLS[i % CONFETTI_COLS.length]));
    this.confettiMesh.count = 0; this.confettiMesh.frustumCulled = false;
    world.add(this.confettiMesh);

    this.camPsi = 0; this.camPos.set(0, 6, 14); this.surfK = 0;
    this.camLook = new THREE.Vector3(0, 0.8, -12);
    this.fin = null;
  }

  // The player is over the line: the arch's cannons fire and a shower comes down on the canoe.
  celebrate() {
    const me = this.race.me, u = this.arch.userData;
    this.arch.updateMatrixWorld(true);
    const at = new THREE.Vector3(), add = (x, y, z, vx, vy, vz, spread) => {
      if (this.confetti.length >= CONFETTI) return;
      this.confetti.push({
        x, y, z, vx: vx + (Math.random() - 0.5) * spread, vy: vy + (Math.random() - 0.5) * spread, vz: vz + (Math.random() - 0.5) * spread,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sx: (Math.random() - 0.5) * 14, sy: (Math.random() - 0.5) * 10, ph: Math.random() * 6, t: 0, delay: 0,
      });
    };
    u.mouths.forEach((m, i) => {
      at.copy(m); this.arch.localToWorld(at);
      const top = i === u.mouths.length - 1;
      // the side cannons shoot up and in toward the middle; the top bursts out all round
      for (let k = 0; k < (top ? 220 : 180); k++) {
        if (top) add(at.x + (Math.random() - 0.5) * 30, at.y, at.z, 0, 2, 0, 9);
        else add(at.x, at.y, at.z, -Math.sign(at.x) * 6, 17, 2.5, 6);
      }
    });
    // a soft shower straight over the paddler, wherever they crossed
    for (let k = 0; k < 220; k++) add(me.x + (Math.random() - 0.5) * 16, 9 + Math.random() * 6, -me.y - 4 + (Math.random() - 0.5) * 16, 0, 0, 0, 1.5);
    this.confetti.forEach((d, i) => { d.delay = i < 580 ? Math.random() * 0.25 : Math.random() * 0.8; });
  }

  updateConfetti(dt) {
    if (!this.confetti.length) return;
    const sea = this.race.sea, t = this.race.t, w = sea.wind(t), dummy = this.confettiDummy || (this.confettiDummy = new THREE.Object3D());
    let n = 0;
    for (const d of this.confetti) {
      if (d.delay > 0) { d.delay -= dt; continue; }
      d.t += dt;
      const h = sea.height(d.x, -d.z, t);
      if (d.y > h + 0.02) {
        // paper: gravity against a lot of drag, so it soon drifts with the wind and flutters side to side
        d.vy -= 9.8 * dt;
        const drag = Math.exp(-dt * 2.6);
        d.vx = w.x * 0.35 + (d.vx - w.x * 0.35) * drag; d.vz = -w.y * 0.35 + (d.vz + w.y * 0.35) * drag;
        d.vy = Math.max(d.vy * drag, -1.3);
        d.x += (d.vx + Math.sin(d.t * 5 + d.ph) * 0.6) * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.sx * dt; d.ry += d.sy * dt;
      } else {
        // landed: lies flat on the water and rides the swell until it soaks through
        d.y = h + 0.02; d.rx = -Math.PI / 2; d.ry = 0;
        d.wet = (d.wet || 0) + dt;
      }
      if (d.t > 22 || d.wet > 9) { d.dead = true; continue; }
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(d.rx, d.ry, d.rz);
      dummy.updateMatrix();
      this.confettiMesh.setMatrixAt(n++, dummy.matrix);
    }
    this.confetti = this.confetti.filter(d => !d.dead);
    this.confettiMesh.count = n;
    this.confettiMesh.instanceMatrix.needsUpdate = true;
  }

  // Past the line the camera swings round from behind to the front quarter, low, to look back at
  // the paddler with the arch behind, and then drifts slowly round them.
  finishCamera(dt) {
    const me = this.race.me;
    if (!this.fin) this.fin = { t: 0, psi: me.psi };
    const f = this.fin;
    f.t += dt;
    const k = Math.min(1, f.t / 3.2), e = k * k * (3 - 2 * k);
    const a = Math.PI + (0.8 - Math.PI) * e - Math.max(0, f.t - 3.2) * 0.06;
    const d = 14 - 6 * e, up = 5.5 - 3.4 * e;
    const tx = me.x + Math.sin(f.psi + a) * d, ty = me.y + Math.cos(f.psi + a) * d;
    this.camPos.lerp(new THREE.Vector3(tx, Math.max(me.heave, 0) + up, -ty), Math.min(1, dt * 3));
    this.camera.position.copy(this.camPos);
    this.camLook.lerp(new THREE.Vector3(me.x, me.heave + 1.1 + 2 * (1 - e), -me.y), Math.min(1, dt * 3));
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.baseFov) > 0.05) { this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 2); this.camera.updateProjectionMatrix(); }
  }

  updateCamera(dt) {
    const me = this.race.me;
    this.camPsi += (me.psi - this.camPsi) * Math.min(1, dt * 2.2);
    // on a wave the camera drops in low and close behind the stern and widens with the speed,
    // so the run down the face reads as a rush; it eases back out when the wave lets go
    const sp = Math.hypot(me.vx, me.vy);
    this.surfK += (me.surf * clamp((sp - 3) / 3, 0.3, 1) - this.surfK) * Math.min(1, dt * (me.surf > this.surfK ? 2.5 : 1.2));
    const k = this.surfK;
    const back = 14 - 5.5 * k, up = 5.5 - 2.4 * k;
    const tx = me.x - Math.sin(this.camPsi) * back, ty = me.y - Math.cos(this.camPsi) * back;
    this.camPos.lerp(new THREE.Vector3(tx, Math.max(me.heave, 0) + up, -ty), Math.min(1, dt * (4 + 4 * k)));
    this.camera.position.copy(this.camPos);
    // a light shudder from the hull slapping the water when running fast
    const shake = k * clamp(sp - 4, 0, 3) * 0.02, t = this.race.t;
    this.camera.position.x += Math.sin(t * 37) * shake; this.camera.position.y += Math.sin(t * 29 + 1) * shake;
    this.camLook.set(me.x + Math.sin(this.camPsi) * 12, me.heave + 0.8 - 0.5 * k, -(me.y + Math.cos(this.camPsi) * 12));
    this.camera.lookAt(this.camLook);
    const fov = this.baseFov + 5 * k;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  updateWake(dt) {
    const sea = this.race.sea, t = this.race.t;
    for (const c of this.race.canoes) {
      const { fx, fy, rx, ry } = axes(c.psi);
      if (Math.hypot(c.vx, c.vy) > 1 && Math.random() < dt * 30) {
        this.wake.push({ x: c.x - fx * HALF + (Math.random() - 0.5) * 0.4, y: c.y - fy * HALF, t: 0, side: (Math.random() - 0.5) * 2 });
      }
      // running down a wave the bow throws spray off both sides, more the faster it goes
      const sp = Math.hypot(c.vx, c.vy);
      if (c.surf > 0.4 && sp > 3.5 && Math.random() < dt * (sp - 3) * 6) {
        const s = Math.random() < 0.5 ? -1 : 1, bx = c.x + fx * HALF * 0.6 + rx * s * 0.2, by = c.y + fy * HALF * 0.6 + ry * s * 0.2;
        this.splash({ at: new THREE.Vector3(bx, 0, -by), n: 3, up: 0.6 + (sp - 3) * 0.25, vx: c.vx + rx * s * 1.6, vy: c.vy + ry * s * 1.6 });
      }
      // a planted blade at speed throws a rooster tail off its edge, out behind the stern
      if (c.plant && sp > 2.5 && Math.random() < dt * (sp - 2) * 10) {
        const px = c.x + rx * c.plant * 0.65 + fx * -1.0, py = c.y + ry * c.plant * 0.65 + fy * -1.0;
        this.splash({ at: new THREE.Vector3(px, 0, -py), n: 2, up: 0.4 + (sp - 2) * 0.2, vx: c.vx * 0.5 + rx * c.plant * 0.8, vy: c.vy * 0.5 + ry * c.plant * 0.8 });
      }
      if (c.stroke && c.stroke.t < 0.05) {
        for (let i = 0; i < 5; i++) this.wake.push({ x: c.x + rx * c.stroke.side * 0.7, y: c.y + ry * c.stroke.side * 0.7 + 0.6, t: 0, side: c.stroke.side * Math.random() * 2, up: 0.5 + Math.random() * 0.9 });
      }
    }
    while (this.wake.length > MAX_WAKE) this.wake.shift();
    let n = 0;
    for (const p of this.wake) {
      p.t += dt;
      if (p.t > 2.4) continue;
      const hx = p.x + p.side * p.t * 0.6;
      let h = sea.height(hx, p.y, t) + 0.05;
      if (p.up) h += Math.max(0, p.up * p.t * 3 - 9 * p.t * p.t);
      this.wakePos[n * 3] = hx; this.wakePos[n * 3 + 1] = h; this.wakePos[n * 3 + 2] = -p.y;
      n++;
    }
    this.wake = this.wake.filter(p => p.t <= 2.4);
    this.wakeGeo.setDrawRange(0, n);
    this.wakeGeo.attributes.position.needsUpdate = true;
  }

  splash({ at, n, up, vx, vy }) {
    for (let i = 0; i < n && this.spray.length < MAX_SPRAY; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.8;
      this.spray.push({
        x: at.x + (Math.random() - 0.5) * 0.25, y: Math.max(at.y, this.race.sea.height(at.x, -at.z, this.race.t)) + 0.05, z: at.z + (Math.random() - 0.5) * 0.25,
        // drops keep part of the canoe's speed and fly up and back off the blade
        vx: vx * 0.35 + Math.cos(a) * r, vy: up * (0.5 + Math.random() * 0.7), vz: -vy * 0.35 + Math.sin(a) * r + 0.6, t: 0,
      });
    }
  }

  updateSpray(dt) {
    const sea = this.race.sea, t = this.race.t;
    let n = 0;
    for (const d of this.spray) {
      d.t += dt; d.vy -= 9.8 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.vy < 0 && d.y < sea.height(d.x, -d.z, t)) d.dead = true;
      if (d.dead || d.t > 2) continue;
      this.sprayPos[n * 3] = d.x; this.sprayPos[n * 3 + 1] = d.y; this.sprayPos[n * 3 + 2] = d.z;
      n++;
    }
    this.spray = this.spray.filter(d => !d.dead && d.t <= 2);
    this.sprayGeo.setDrawRange(0, n);
    this.sprayGeo.attributes.position.needsUpdate = true;
  }

  updateRain(dt) {
    const w = this.race.sea.wind(this.race.t), cam = this.camera.position, p = this.rainPos;
    const sx = w.x * 0.05, sz = -w.y * 0.05;   // streaks lean with the wind
    let i = 0;
    for (const d of this.rainDrops) {
      d.y -= 22 * dt; d.x += w.x * 0.3 * dt; d.z -= w.y * 0.3 * dt;
      if (d.y < -4) { d.y += 34; d.x = (Math.random() - 0.5) * RAIN_BOX; d.z = (Math.random() - 0.5) * RAIN_BOX; }
      const x = cam.x + d.x, y = cam.y + d.y - 10, z = cam.z + d.z;
      p[i++] = x; p[i++] = y; p[i++] = z;
      p[i++] = x - sx; p[i++] = y + 1.1; p[i++] = z - sz;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  updateGusts(dt) {
    const sea = this.race.sea, t = this.race.t, me = this.race.me, p = this.gustPos;
    const kn = sea.cond.windKn;
    this.gusts.material.opacity = clamp((kn - 6) / 30, 0.04, 0.4);
    let i = 0;
    for (const d of this.gustDrops) {
      const wx = me.x + d.x, wy = me.y - d.z, w = sea.wind(t, wx, wy);
      d.x += w.x * dt; d.z -= w.y * dt;
      // wrap round the box that follows the canoe
      if (d.x > GUST_BOX / 2) d.x -= GUST_BOX; if (d.x < -GUST_BOX / 2) d.x += GUST_BOX;
      if (d.z > GUST_BOX / 2) d.z -= GUST_BOX; if (d.z < -GUST_BOX / 2) d.z += GUST_BOX;
      const x = me.x + d.x, z = -me.y + d.z, y = sea.height(wx, wy, t) + d.y;
      const k = d.l * 0.09;   // streak length grows with the local wind
      p[i++] = x; p[i++] = y; p[i++] = z;
      p[i++] = x - w.x * k; p[i++] = y; p[i++] = z + w.y * k;
    }
    this.gusts.geometry.attributes.position.needsUpdate = true;
  }

  // mode: 'menu' slowly orbits the canoe; anything else follows it.
  render(dt, mode) {
    const race = this.race, sea = race.sea, t = race.t;
    for (const { c, m, rival } of this.canoes) {
      poseCanoe(m, c, dt, t);
      if (rival) m.root.visible = mode !== 'menu';
      for (const f of m.fx) if (!rival || mode !== 'menu') this.splash(f);
      m.fx.length = 0;
    }
    this.updateSpray(dt);
    for (const { o, g } of this.honus) { g.position.set(o.x, sea.height(o.x, o.y, t) - 0.1, -o.y); g.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2; }
    for (const b of this.buoys) {
      const u = b.userData, w = sea.wind(t, u.x, u.y);
      b.position.set(u.x, sea.height(u.x, u.y, t), -u.y);
      u.flag.rotation.y = Math.atan2(w.y, w.x) + Math.sin(t * 9 + u.y) * 0.25 * Math.min(1.5, w.kn / 15);
      // the cloth droops in a calm and stands out straight in a blow
      u.cloth.rotation.x = Math.sin(t * 13 + u.x) * 0.3; u.flag.rotation.z = -Math.max(0, 1.1 - w.kn / 12);
    }
    // the finish line: its floats ride the swell and the arch's flags stream downwind
    for (const f of this.lineFloats) { const x = f.userData.x; f.position.set(x, race.sea.height(x, race.track.len, t), -race.track.len); }
    const aw = sea.wind(t, 0, race.track.len);
    for (const [i, fg] of this.arch.userData.flags.entries()) fg.rotation.y = Math.atan2(aw.y, aw.x) + Math.sin(t * 2.3 + i * 2) * 0.35;
    this.updateGusts(dt);
    if (race.me.finish !== null && !this.fin) this.celebrate();
    this.updateConfetti(dt);
    if (mode === 'menu') {
      const a = t * 0.12;
      this.camera.position.set(Math.sin(a) * 16, 5 + Math.sin(t * 0.3), -Math.cos(a) * 16);
      this.camera.lookAt(0, 0.5, 0);
    } else if (race.me.finish !== null) this.finishCamera(dt);
    else this.updateCamera(dt);
    if (this.camHook) this.camHook(this.camera, race.me);   // set from automated checks
    this.updateWake(dt);
    if (this.rain.visible) this.updateRain(dt);
    this.ocean.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
