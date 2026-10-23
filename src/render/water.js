// Ocean surface and sky drawn on the GPU. The vertex shader runs the same wave sum as Sea.height
// (waves, sets and shoaling), so the water you see is the water that pushes the canoe.
import { clamp } from '../utils.js';
import { GUST_PATCH, GUST_K } from '../sea.js';

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

// shared by the water (for reflections) and the sky dome
const SKY_GLSL = `
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol, uCloudCol;
uniform float uSun, uCloud, uT;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; }
  return s;
}
vec3 skyColor(vec3 d, bool clouds) {
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uSkyHor, uSkyTop, pow(up, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.25 + pow(s, 6.0) * 0.12) * uSun;
  if (clouds && d.y > 0.0) {
    // a cloud deck projected on a plane overhead, drifting slowly, thinning toward the horizon haze
    vec2 cp = d.xz / (d.y + 0.08) * 1.2 + vec2(uT * 0.004, uT * 0.002);
    float c = fbm(cp) * 0.75 + fbm(cp * 2.7 + 3.1) * 0.25;
    float cover = smoothstep(1.0 - uCloud, 1.15 - uCloud * 0.5, c) * smoothstep(0.0, 0.18, d.y);
    vec3 cc = uCloudCol * (0.75 + 0.35 * fbm(cp * 1.7 + 7.0)) + uSunCol * pow(s, 8.0) * 0.25 * uSun;
    col = mix(col, cc, cover * 0.92);
  }
  return col;
}
`;

const WATER_FRAG = SKY_GLSL + `
uniform vec3 uDeep, uShallow, uFogCol;
uniform float uFogNear, uFogFar, uAmp, uSwellA;
uniform vec2 uWind;
uniform vec4 uGust;               // patch strength, k along, k across, phase (mirrors Sea.gustPatch)
uniform float uWindSpd, uChop;
uniform vec3 uShore;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
varying float vDist;

// fine wind chop as a scrolling noise height field; returns its slope
vec2 chopSlope(vec2 p) {
  vec2 w = uWind, c = vec2(-uWind.y, uWind.x);
  vec2 q1 = vec2(dot(p, w), dot(p, c)) * vec2(0.55, 0.9) - vec2(uT * 0.9, 0.0);
  vec2 q2 = vec2(dot(p, w), dot(p, c)) * vec2(1.6, 1.1) + vec2(-uT * 1.4, uT * 0.3);
  float e = 0.06;
  float h0 = fbm(q1) + 0.3 * noise(q2);
  float hx = fbm(q1 + vec2(e, 0.0)) + 0.3 * noise(q2 + vec2(e, 0.0)) - h0;
  float hy = fbm(q1 + vec2(0.0, e)) + 0.3 * noise(q2 + vec2(0.0, e)) - h0;
  // back from the wind frame to world x / y
  vec2 g = vec2(hx, hy) / e;
  return w * g.x + c * g.y;
}

void main() {
  vec2 p = vec2(vWorld.x, -vWorld.z);
  float near = clamp(1.0 - vDist / 140.0, 0.0, 1.0);
  // gust patches (cat's paws): the wind is stronger there, so the water is darker and rougher
  float ga = dot(p, uWind), gc = dot(p, vec2(-uWind.y, uWind.x));
  float gust = max(0.0, sin((ga - uWindSpd * uT) * uGust.y + uGust.w) * sin(gc * uGust.z + uGust.w * 3.0)) * uGust.x;
  vec2 sl = chopSlope(p) * (0.035 + 0.09 * near) * (1.0 + gust * 1.6) * uChop;
  // world normal: physics y is -z in three.js
  vec3 n = normalize(vN + vec3(-sl.x, 0.0, sl.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y) + 0.02;
  vec3 sky = skyColor(normalize(R), true);
  float sd = max(dot(R, uSunDir), 0.0);
  float spec = pow(sd, 700.0) * 2.2 + pow(sd, 60.0) * 0.12;

  // body colour: dark in the troughs, lighter on crests, glowing green-blue where the sun shines through
  float crest = clamp(0.5 + vH / (uAmp * 2.0), 0.0, 1.0);
  vec3 body = mix(uDeep * 0.8, uShallow, pow(crest, 1.6));
  float through = pow(max(dot(-V, uSunDir), 0.0), 3.0) * pow(crest, 2.0);
  body += uShallow * (0.25 * through + 0.12 * max(n.y - 0.9, 0.0) * 10.0 * crest);
  body *= (0.75 + 0.35 * max(dot(n, uSunDir), 0.0)) * (1.0 - 0.3 * gust);
  vec3 col = mix(body, sky, fres) + uSunCol * spec * uSun;

  // whitecaps on the highest, steepest crests, drawn out in streaks along the wind
  vec2 wp = vec2(dot(p, uWind), dot(p, vec2(-uWind.y, uWind.x)));
  float streak = fbm(wp * vec2(0.18, 1.1) + vec2(-uT * 0.25, 0.0));
  float bubbles = noise(p * 4.0 + uT * 0.4);
  float steep = 1.0 - vN.y;
  float foam = clamp((vH - uAmp * 0.65) / (uAmp * 0.6), 0.0, 1.0) * (0.6 + steep * 6.0);
  if (uShore.x > 0.5) {
    float d = (p.x - uShore.z) * -uShore.y;
    if (d < 40.0) foam = max(foam, clamp((vH - uSwellA * 0.6) / (uSwellA * 0.5), 0.0, 1.0) * clamp((40.0 - d) / 20.0, 0.0, 1.0));
    if (d < 8.0) foam = max(foam, 0.6 + 0.4 * clamp((8.0 - d) / 8.0, 0.0, 1.0));
  }
  foam = clamp(foam, 0.0, 1.0) * smoothstep(0.3, 0.7, streak + foam * 0.35) * (0.75 + 0.25 * bubbles);
  // faint lace of old foam everywhere the sea is rough
  float lace = smoothstep(0.62, 0.8, fbm(wp * vec2(0.4, 1.4) + 11.0)) * (clamp(uAmp - 0.3, 0.0, 1.0) * 0.25 + gust * 0.35) * near;
  col = mix(col, vec3(0.93, 0.96, 0.97) * (0.85 + 0.15 * max(dot(n, uSunDir), 0.0)), clamp(foam * 0.95 + lace, 0.0, 1.0));

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

const SKY_FRAG = SKY_GLSL + `
varying vec3 vDir;
void main() {
  gl_FragColor = vec4(skyColor(normalize(vDir), true), 1.0);
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
      uWind: { value: new THREE.Vector2(0, 1) }, uGust: { value: new THREE.Vector4() }, uWindSpd: { value: 0 }, uChop: { value: 1 }, uCloud: { value: 0.3 }, uCloudCol: { value: new THREE.Color(1, 1, 1) },
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
    // with no wind the chop still needs a direction (it lies along the waves) and stays faint, almost glassy
    const wl = Math.hypot(C.wx, C.wy);
    if (wl > 0.1) u.uWind.value.set(C.wx / wl, C.wy / wl); else u.uWind.value.set(C.main.dx, C.main.dy);
    u.uChop.value = clamp(0.3 + C.windKn / 10, 0.3, 1);
    u.uWindSpd.value = Math.hypot(C.wx, C.wy);
    // patches show more the stronger the wind, so a light breeze leaves the sea even
    const gs = (C.weather ? C.weather.gust : 1) * GUST_PATCH * clamp((C.windKn - 6) / 14, 0, 1.6) * 1.6;
    u.uGust.value.set(gs, GUST_K[0], GUST_K[1], C.gustPh);
    u.uCloud.value = look.cloud; u.uCloudCol.value.copy(look.cloudCol);
  }

  update(t, camera) {
    const u = this.uniforms;
    u.uT.value = t;
    // snap the grid so its vertices do not swim as the camera moves
    u.uCenter.value.set(Math.round(camera.position.x / 2) * 2, Math.round(camera.position.z / 2) * 2);
    this.sky.position.copy(camera.position);
  }
}
