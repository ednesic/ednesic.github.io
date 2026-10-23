// three.js view of a race: water mesh, scenery, canoes, wake and the chase camera.
import { clamp } from '../utils.js';
import { HALF } from '../canoe.js';
import { P, flatMat, labelSprite, checkerBanner, honu, buildCanoe, poseCanoe } from './models.js';
import { SCENERY } from './scenery.js';

const THREE = window.THREE;

// water: a grid that follows the canoe and is displaced by the same wave function the physics uses
const WATER_SIZE = 320, WATER_SEG = 110, CELL = WATER_SIZE / WATER_SEG;
const MAX_WAKE = 600;

export class View {
  constructor(stage) {
    this.stage = stage;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    stage.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 6000);

    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(-80, 120, -60);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x335566, 0.75), this.sun);

    const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEG, WATER_SEG);
    geo.rotateX(-Math.PI / 2);
    this.wPos = geo.attributes.position;
    this.baseXZ = new Float32Array(this.wPos.count * 2);
    for (let i = 0; i < this.wPos.count; i++) { this.baseXZ[i * 2] = this.wPos.getX(i); this.baseXZ[i * 2 + 1] = this.wPos.getZ(i); }
    this.wCol = new Float32Array(this.wPos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(this.wCol, 3));
    this.waterGeo = geo;
    this.water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: 0x557788 }));
    this.scene.add(this.water);
    this.farWater = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshPhongMaterial({ color: 0x0b4a75, flatShading: true }));
    this.farWater.rotation.x = -Math.PI / 2; this.farWater.position.y = -0.6;
    this.scene.add(this.farWater);

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
    this.scene.background = new THREE.Color(col.sky);
    this.scene.fog = new THREE.Fog(col.fog, 260, T.fogFar);
    this.sun.color.setHex(col.sun);
    this.farWater.material.color.setHex(col.deep);
    this.deep = new THREE.Color(col.deep);
    this.shallow = new THREE.Color(col.shallow);

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
    const pts = new THREE.Points(this.wakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.8 }));
    pts.frustumCulled = false;
    world.add(pts);

    this.camPsi = 0; this.camPos.set(0, 6, 14);
  }

  updateWater(t) {
    const race = this.race, sea = race.sea, me = race.me;
    const cx = Math.round(me.x / CELL) * CELL, cy = Math.round((me.y + 90) / CELL) * CELL;
    this.water.position.set(cx, 0, -cy);
    const deep = this.deep, shallow = this.shallow, wCol = this.wCol, wPos = this.wPos;
    const amp = Math.max(0.2, sea.cond.main.A * 1.3);
    const swellA = sea.cond.swell ? sea.cond.swell.A : 0;
    for (let i = 0; i < wPos.count; i++) {
      const wx = cx + this.baseXZ[i * 2], wy = cy - this.baseXZ[i * 2 + 1];
      const h = sea.height(wx, wy, t);
      wPos.setY(i, h);
      const f = clamp(0.5 + h / (amp * 2), 0, 1);
      let r = deep.r + (shallow.r - deep.r) * f, g = deep.g + (shallow.g - deep.g) * f, b = deep.b + (shallow.b - deep.b) * f;
      let foam = clamp((h - amp * 0.8) / (amp * 0.5), 0, 1);
      if (race.track.shore) {
        const d = sea.distToShore(wx);
        if (d < 40) foam = Math.max(foam, clamp((h - swellA * 0.6) / (swellA * 0.5), 0, 1) * clamp((40 - d) / 20, 0, 1));
        if (d < 8) foam = 1;
      }
      r += (0.95 - r) * foam; g += (0.97 - g) * foam; b += (0.96 - b) * foam;
      wCol[i * 3] = r; wCol[i * 3 + 1] = g; wCol[i * 3 + 2] = b;
    }
    wPos.needsUpdate = true;
    this.waterGeo.attributes.color.needsUpdate = true;
    this.waterGeo.computeVertexNormals();
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

  // mode: 'menu' slowly orbits the canoe; anything else follows it.
  render(dt, mode) {
    const race = this.race, sea = race.sea, t = race.t;
    this.updateWater(t);
    for (const { c, m, rival } of this.canoes) { poseCanoe(m, c); if (rival) m.root.visible = mode !== 'menu'; }
    for (const { o, g } of this.honus) { g.position.set(o.x, sea.height(o.x, o.y, t) - 0.1, -o.y); g.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2; }
    for (const b of this.buoys) b.position.set(b.userData.x, sea.height(b.userData.x, b.userData.y, t), -b.userData.y);
    if (mode === 'menu') {
      const a = t * 0.12;
      this.camera.position.set(Math.sin(a) * 16, 5 + Math.sin(t * 0.3), -Math.cos(a) * 16);
      this.camera.lookAt(0, 0.5, 0);
    } else this.updateCamera(dt);
    this.updateWake(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
