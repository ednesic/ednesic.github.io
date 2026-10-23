// The V1 itself: the hull, ama and iakos from assets/canoe.glb (modelled by tools/make_canoe.py),
// painted per canoe. If the model or the glTF loader cannot load, the game keeps the built-in hull.
const THREE = window.THREE;

let template = null;

// Resolves once the model is ready, or quietly without it.
// A page can point at another copy of the model (the published artifact serves it as glTF JSON).
export function loadBoat(url = window.VAA_CANOE_URL || 'assets/canoe.glb') {
  if (!THREE.GLTFLoader) return Promise.resolve(false);
  return new Promise(resolve => {
    new THREE.GLTFLoader().load(url, g => { template = g.scene; resolve(true); }, undefined, () => resolve(false));
    setTimeout(() => resolve(false), 15000);
  });
}
export const hasBoat = () => !!template;

// paint: { hull, deck, trim } colours; the cockpit, seat and carbon keep the model's own.
export function makeBoat(paint) {
  const root = template.clone(true);
  const mats = {};
  root.traverse(n => {
    if (!n.isMesh) return;
    const src = n.material, name = src.name;
    if (!mats[name]) {
      const m = mats[name] = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: 0 });
      if (paint[name] !== undefined) m.color.set(paint[name]);
    }
    n.material = mats[name];
  });
  return root;
}
