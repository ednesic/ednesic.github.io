// Ocean surface and sky drawn on the GPU. The vertex shader runs the same wave sum as Sea.height
// (waves, sets and shoaling), so the water you see is the water that pushes the canoe.
const THREE = window.THREE;
const MAX_WAVES = 8;

const HEIGHT_GLSL = `
uniform vec4 uW[${MAX_WAVES}];   // dx, dy, k, omega
uniform vec4 uP[${MAX_WAVES}];   // A, phase, shoals, chop
uniform int uN;
uniform vec4 uG1;                // sets: k, phase, A, group speed
uniform vec4 uG2;                // along the crest: k, phase, A
uniform vec2 uGD;                // direction the sets travel
uniform vec3 uShore;             // has shore, side, x
uniform float uT;

float shoalF(float x) {
  if (uShore.x < 0.5) return 1.0;
  float d = (x - uShore.z) * -uShore.y;
  return 1.0 + clamp((90.0 - d) / 60.0, 0.0, 1.0) * 1.4;
}
float envF(vec2 p) {
  if (uG1.z <= 0.0) return 1.0;
  float along = dot(uGD, p), across = uGD.y * p.x - uGD.x * p.y;
  return max(0.3, 1.0 + uG1.z * sin(uG1.x * (along - uG1.w * uT) + uG1.y) + uG2.z * sin(uG2.x * across + uG2.y));
}
// dist fades each wave out far from the camera, where the grid is too coarse to draw it
float hgt(vec2 p, float dist) {
  float e = envF(p), h = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uN) break;
    vec4 w = uW[i], q = uP[i];
    float th = w.z * dot(w.xy, p) - w.w * uT + q.y;
    float a = q.x;
    if (q.z > 0.5) a *= shoalF(p.x);
    if (q.w < 0.5) a *= e;
    a *= clamp(1.5 - dist / (6.2831853 / w.z * 20.0), 0.0, 1.0);
    h += a * (sin(th) - 0.22 * cos(2.0 * th));
  }
  return h;
}
`;

const WATER_VERT = HEIGHT_GLSL + `
uniform vec2 uCenter;
uniform float uR;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
varying float vDist;
void main() {
  // grid in [-1, 1]: dense under the camera, sparse toward the horizon
  vec2 u = position.xz;
  vec2 g = uR * (0.1 * u + 0.9 * u * u * u);
  vec3 wp = vec3(uCenter.x + g.x, 0.0, uCenter.y + g.y);
  vec2 p = vec2(wp.x, -wp.z);
  float dist = length(wp.xz - cameraPosition.xz);
  float h = hgt(p, dist);
  float e = 0.3 + dist * 0.004;
  float hx = hgt(p + vec2(e, 0.0), dist) - hgt(p - vec2(e, 0.0), dist);
  float hy = hgt(p + vec2(0.0, e), dist) - hgt(p - vec2(0.0, e), dist);
  vN = normalize(vec3(-hx, 2.0 * e, hy));
  wp.y = h;
  vWorld = wp; vH = h; vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const WATER_FRAG = `
uniform float uT;
uniform vec3 uDeep, uShallow, uSkyTop, uSkyHor, uSunDir, uSunCol, uFogCol;
uniform float uFogNear, uFogFar, uAmp, uSwellA, uSun;
uniform vec3 uShore;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
varying float vDist;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = vec2(vWorld.x, -vWorld.z);
  // small wind ripples on top of the big waves, fading with distance
  float rf = clamp(1.0 - vDist / 70.0, 0.0, 1.0);
  vec3 rip = vec3(
    sin(p.x * 1.9 + p.y * 0.4 + uT * 2.3) + 0.6 * sin(p.x * 3.7 - p.y * 2.1 - uT * 3.1),
    0.0,
    cos(p.y * 2.2 - p.x * 0.5 - uT * 2.7) + 0.6 * sin(p.y * 4.1 + p.x * 1.7 + uT * 3.6));
  vec3 n = normalize(vN + rf * 0.06 * rip);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  vec3 sky = mix(uSkyHor, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float spec = pow(max(dot(R, uSunDir), 0.0), 400.0) * 0.9 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.06;

  // body colour: deeper in troughs, lighter and translucent on crests lit from behind
  float crest = clamp(0.5 + vH / (uAmp * 2.0), 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, crest * crest);
  float back = pow(max(dot(-V, uSunDir) * 0.5 + 0.5, 0.0), 2.0);
  body += uShallow * 0.35 * pow(crest, 3.0) * back;
  body *= 0.8 + 0.3 * max(dot(n, uSunDir), 0.0);
  vec3 col = mix(body, sky, fres * 0.85) + uSunCol * spec * uSun;

  // foam on the tallest crests and along the beach, broken up by noise
  float nz = noise(p * 0.9 + vec2(uT * 0.3, 0.0)) * 0.6 + noise(p * 3.1 - vec2(0.0, uT * 0.5)) * 0.4;
  float foam = clamp((vH - uAmp * 0.75) / (uAmp * 0.55), 0.0, 1.0);
  if (uShore.x > 0.5) {
    float d = (p.x - uShore.z) * -uShore.y;
    if (d < 40.0) foam = max(foam, clamp((vH - uSwellA * 0.6) / (uSwellA * 0.5), 0.0, 1.0) * clamp((40.0 - d) / 20.0, 0.0, 1.0));
    if (d < 8.0) foam = max(foam, 0.6 + 0.4 * clamp((8.0 - d) / 8.0, 0.0, 1.0));
  }
  foam *= smoothstep(0.25, 0.75, nz + foam * 0.4);
  col = mix(col, vec3(0.94, 0.97, 0.97), foam * 0.9);

  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogCol, fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = `
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol;
uniform float uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uSkyHor, uSkyTop, pow(up, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.25 + pow(s, 6.0) * 0.12) * uSun;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Ocean {
  constructor(scene, { segments = 300, radius = 1800 } = {}) {
    this.uniforms = {
      uW: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
      uP: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
      uN: { value: 0 },
      uG1: { value: new THREE.Vector4() }, uG2: { value: new THREE.Vector4() }, uGD: { value: new THREE.Vector2(0, 1) },
      uShore: { value: new THREE.Vector3() },
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2() }, uR: { value: radius },
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSun: { value: 1 },
      uFogNear: { value: 200 }, uFogFar: { value: 3000 },
      uAmp: { value: 0.5 }, uSwellA: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(2, 2, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
  }

  // Loads one race's sea and look. look: { deep, shallow, skyTop, skyHor, fog, sunDir, sunCol, sun, fogNear, fogFar }
  setSea(sea, look) {
    const C = sea.cond, u = this.uniforms;
    const waves = C.waves.slice(0, MAX_WAVES);
    waves.forEach((w, i) => {
      u.uW.value[i].set(w.dx, w.dy, w.k, w.w);
      u.uP.value[i].set(w.A, w.ph, w.shoal ? 1 : 0, w.chop ? 1 : 0);
    });
    u.uN.value = waves.length;
    const g = C.groups;
    if (g) {
      u.uG1.value.set(g.k, g.ph, g.A, g.cg);
      u.uG2.value.set(g.kc, g.phc, g.Ac, 0);
      u.uGD.value.set(g.dx, g.dy);
    } else u.uG1.value.set(0, 0, 0, 0);
    const s = sea.track.shore;
    u.uShore.value.set(s ? 1 : 0, s ? s.side : 0, s ? s.x : 0);
    u.uAmp.value = Math.max(0.2, C.main.A * 1.3);
    u.uSwellA.value = C.swell ? C.swell.A : 0;
    u.uDeep.value.copy(look.deep); u.uShallow.value.copy(look.shallow);
    u.uSkyTop.value.copy(look.skyTop); u.uSkyHor.value.copy(look.skyHor); u.uFogCol.value.copy(look.fog);
    u.uSunDir.value.copy(look.sunDir); u.uSunCol.value.copy(look.sunCol); u.uSun.value = look.sun;
    u.uFogNear.value = look.fogNear; u.uFogFar.value = look.fogFar;
  }

  update(t, camera) {
    const u = this.uniforms;
    u.uT.value = t;
    // snap the grid so its vertices do not swim as the camera moves
    u.uCenter.value.set(Math.round(camera.position.x / 2) * 2, Math.round(camera.position.z / 2) * 2);
    this.sky.position.copy(camera.position);
  }
}
