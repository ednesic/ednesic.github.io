// three.js view of a race: water mesh, scenery, canoes, wake and the chase camera.
import { clamp } from '../utils.js';
import { HALF } from '../canoe.js';
import { P, flatMat, labelSprite, checkerBanner, honu, buildCanoe, poseCanoe } from './models.js';
import { SCENERY } from './scenery.js';
import { Ocean } from './water.js';

const THREE = window.THREE;

const MAX_WAKE = 600;
const RAIN_DROPS = 1400, RAIN_BOX = 60;

// how each weather tints the sky and the light: grey is the share of storm grey mixed in
const LOOK = {
  sol: { grey: 0, sun: 1.1, hemi: 0.75, fog: 1, glint: 1 },
  nublado: { grey: 0.4, sun: 0.55, hemi: 0.75, fog: 0.75, glint: 0.25 },
  chuva: { grey: 0.65, sun: 0.35, hemi: 0.65, fog: 0.4, glint: 0.05 },
};
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
    this.camera.fov = W < H ? 72 : 58;
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
    });
    this.rain.visible = weather.id === 'chuva';

    // start line is just two poles: a banner there would fill the camera at the gun
    const poles = y => {
      for (const x of [T.bounds[0] + 6, T.bounds[1] - 6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), flatMat(0xf5b841));
        pole.position.copy(P(x, y, 4)); world.add(pole);
      }
    };
    poles(0); poles(T.len);
    const banner = checkerBanner(T.bounds[1] - T.bounds[0] - 12, 'CHEGADA');
    banner.position.copy(P((T.bounds[0] + T.bounds[1]) / 2, T.len, 8)); world.add(banner);

    this.buoys = [];
    for (let m = 250; m < T.len; m += 250) {
      for (const x of [-30, 30]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), flatMat(0xff7a2f));
        b.userData = { x, y: m }; world.add(b); this.buoys.push(b);
      }
      const l = labelSprite((T.len - m) + ' m', '#eef7f1'); l.position.copy(P(30, m, 3.2)); l.scale.set(6, 1.5, 1); world.add(l);
    }

    SCENERY[T.id](world, T, race.objs);

    this.honus = race.objs.filter(o => o.k === 'honu').map(o => { const g = honu(); world.add(g); return { o, g }; });

    this.canoes = [];
    const meMesh = buildCanoe(0xc2462c);
    world.add(meMesh.root);
    this.canoes.push({ c: race.me, m: meMesh });
    for (const r of race.rivals) {
      const m = buildCanoe(r.color);
      const l = labelSprite(r.name, r.css); l.position.y = 3.2; m.root.add(l);
      world.add(m.root);
      this.canoes.push({ c: r, m, rival: true });
    }

    this.wake = [];
    this.wakeGeo = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(MAX_WAKE * 3);
    this.wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    const pts = new THREE.Points(this.wakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, map: softDot(), transparent: true, opacity: 0.75, depthWrite: false }));
    pts.frustumCulled = false;
    world.add(pts);

    this.camPsi = 0; this.camPos.set(0, 6, 14);
  }

  updateCamera(dt) {
    const me = this.race.me;
    this.camPsi += (me.psi - this.camPsi) * Math.min(1, dt * 2.2);
    const back = 14, up = 5.5;
    const tx = me.x - Math.sin(this.camPsi) * back, ty = me.y - Math.cos(this.camPsi) * back;
    this.camPos.lerp(new THREE.Vector3(tx, Math.max(me.heave, 0) + up, -ty), Math.min(1, dt * 4));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(me.x + Math.sin(this.camPsi) * 12, me.heave + 0.8, -(me.y + Math.cos(this.camPsi) * 12));
  }

  updateWake(dt) {
    const sea = this.race.sea, t = this.race.t;
    for (const c of this.race.canoes) {
      if (Math.hypot(c.vx, c.vy) > 1 && Math.random() < dt * 30) {
        const fx = Math.sin(c.psi), fy = Math.cos(c.psi);
        this.wake.push({ x: c.x - fx * HALF + (Math.random() - 0.5) * 0.4, y: c.y - fy * HALF, t: 0, side: (Math.random() - 0.5) * 2 });
      }
      if (c.stroke && c.stroke.t < 0.05) {
        const rx = Math.cos(c.psi), ry = -Math.sin(c.psi);
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

  // mode: 'menu' slowly orbits the canoe; anything else follows it.
  render(dt, mode) {
    const race = this.race, sea = race.sea, t = race.t;
    for (const { c, m, rival } of this.canoes) { poseCanoe(m, c, dt); if (rival) m.root.visible = mode !== 'menu'; }
    for (const { o, g } of this.honus) { g.position.set(o.x, sea.height(o.x, o.y, t) - 0.1, -o.y); g.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2; }
    for (const b of this.buoys) b.position.set(b.userData.x, sea.height(b.userData.x, b.userData.y, t), -b.userData.y);
    if (mode === 'menu') {
      const a = t * 0.12;
      this.camera.position.set(Math.sin(a) * 16, 5 + Math.sin(t * 0.3), -Math.cos(a) * 16);
      this.camera.lookAt(0, 0.5, 0);
    } else this.updateCamera(dt);
    this.updateWake(dt);
    if (this.rain.visible) this.updateRain(dt);
    this.ocean.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
