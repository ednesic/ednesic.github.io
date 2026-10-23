// A real human body for the paddler: the skinned mesh from assets/paddler.glb (built by
// tools/make_paddler.py from MakeHuman, CC0), dressed per paddler and posed bone by bone.
// If the model or the glTF loader cannot load, the game keeps the simple built-in paddler.
const THREE = window.THREE;

let template = null;

// Resolves once the model is ready, or quietly without it.
// A page can point at another copy of the model (the published artifact serves it as glTF JSON).
export function loadHuman(url = window.VAA_HUMAN_URL || 'assets/paddler.glb') {
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return Promise.resolve(false);
  return new Promise(resolve => {
    new THREE.GLTFLoader().load(url, g => { template = g.scene; resolve(true); }, undefined, () => resolve(false));
    setTimeout(() => resolve(false), 15000);
  });
}
export const hasHuman = () => !!template;

const c = new THREE.Color();
// o: { shirt, shorts, skin, hair } colours. Returns the bones poseHuman drives.
export function makeHuman(o) {
  const root = THREE.SkeletonUtils.clone(template);
  let mesh = null;
  root.traverse(n => { if (n.isSkinnedMesh) mesh = n; });
  // the mask in COLOR_0 (r shirt, g shorts, b hair, a 0 for the eyes) becomes this paddler's outfit
  const mask = mesh.geometry.attributes.color, N = mask.count, col = new Float32Array(N * 3);
  const skin = new THREE.Color(o.skin), shirt = new THREE.Color(o.shirt), shorts = new THREE.Color(o.shorts), hair = new THREE.Color(o.hair);
  const eye = new THREE.Color(0x1a120c);
  for (let i = 0; i < N; i++) {
    if (mask.getW(i) < 0.5) c.copy(eye);
    else if (mask.getX(i) > 0.5) c.copy(shirt);
    else if (mask.getY(i) > 0.5) c.copy(shorts);
    else if (mask.getZ(i) > 0.5) c.copy(hair);
    else c.copy(skin);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = mesh.geometry.clone();
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mesh.geometry = geo;
  mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true, roughness: 0.62, metalness: 0 });
  mesh.frustumCulled = false;

  const bone = {};
  root.traverse(n => { if (n.isBone || n.type === 'Bone' || n.name) bone[n.name] = n; });
  const rest = {};
  for (const k in bone) rest[k] = bone[k].position.clone();
  return { root, mesh, bone, rest };
}

// --- posing -------------------------------------------------------------------------------
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();
const e = new THREE.Euler();

// Turns `b` so the direction to its (rest) child chain points at world direction `dir`.
// Bones rest with no rotation, so the rest direction is just the sum of the child offsets.
function aimBone(h, name, chain, dir) {
  const b = h.bone[name];
  va.set(0, 0, 0);
  for (const k of chain) va.add(h.rest[k]);
  va.normalize();
  b.parent.getWorldQuaternion(qa);
  vb.copy(dir).applyQuaternion(qb.copy(qa).invert()).normalize();
  b.quaternion.setFromUnitVectors(va, vb);
  b.updateMatrixWorld(true);
}

export const armLen = h => ({
  upper: h.rest['upperarm02_L'].length() + h.rest['lowerarm01_L'].length(),
  fore: h.rest['lowerarm02_L'].length() + h.rest['wrist_L'].length(),
});

// Seated with the legs out along the hull, knees a little up; set once.
export function seatHuman(h) {
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? -1 : 1;
    h.root.updateMatrixWorld(true);
    aimBone(h, 'upperleg01_' + s, ['upperleg02_' + s, 'lowerleg01_' + s], va.set(sx * 0.12, 0.28, -1).normalize().clone());
    aimBone(h, 'lowerleg01_' + s, ['lowerleg02_' + s, 'foot_' + s], va.set(sx * 0.02, -0.3, -1).normalize().clone());
    h.bone['foot_' + s].rotation.set(-0.5, 0, 0);
    // a loose grip: every finger joint curls in toward the palm, the thumb less
    for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) {
      const b = h.bone[`finger${f}-${j}_${s}`];
      if (b) b.rotation.set(f === 1 ? 0.25 : 0.9, 0, 0);
    }
  }
  h.root.updateMatrixWorld(true);
}

const SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
// lean (forward is negative x rotation in the canoe's frame), twist and roll spread down the spine
export function bendSpine(h, lean, twist, roll) {
  e.set(lean / SPINE.length, twist / SPINE.length, roll / SPINE.length, 'YXZ');
  for (const k of SPINE) h.bone[k].quaternion.setFromEuler(e);
  // the head keeps looking ahead along the hull
  e.set(-lean * 0.6, -twist * 0.7, -roll * 0.8, 'YXZ');
  h.bone.head.quaternion.setFromEuler(e);
  h.root.updateMatrixWorld(true);
}

// World position of a shoulder (the head of the upper arm).
export const shoulderOf = (h, s, out) => h.bone['upperarm01_' + s].getWorldPosition(out);

// Points the upper arm at the elbow and the forearm at the hand, all in world space.
export function aimArm(h, s, elbow, hand, shoulder) {
  aimBone(h, 'upperarm01_' + s, ['upperarm02_' + s, 'lowerarm01_' + s], va.subVectors(elbow, shoulder).clone());
  h.bone['lowerarm01_' + s].getWorldPosition(vb);
  aimBone(h, 'lowerarm01_' + s, ['lowerarm02_' + s, 'wrist_' + s], va.subVectors(hand, vb).clone());
}
