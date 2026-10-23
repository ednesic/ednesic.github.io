// Keyboard and touch controls. Calls onStroke(side, type) with side -1 (left) or +1 (right);
// it returns true for a stroke taken, false for one refused, and null when no race is running.
const $ = id => document.getElementById(id);
const HOLD_MS = 250;   // keeping a stroke button or key down this long leaves the paddle in as an espetada

export function setupInput({ onStroke, onQuit }) {
  let modeSel = 'media', holdW = false, holdS = false, holdShift = false, holdDiag = false;
  const diagBtn = $('mDiag');

  const strokeType = () => {
    if (holdShift || holdDiag) return 'diagonal';
    if (holdW) return 'forte';
    if (holdS) return 'longa';
    return modeSel;
  };
  const stroke = side => {
    const took = onStroke(side, strokeType());
    if (took) {
      const pad = side < 0 ? $('padL') : $('padR');
      pad.classList.add('on'); setTimeout(() => pad.classList.remove('on'), 120);
    }
    return took;
  };
  const setMode = m => {
    modeSel = m;
    for (const [id, k] of [['mLonga', 'longa'], ['mMedia', 'media'], ['mForte', 'forte']]) $(id).setAttribute('aria-pressed', String(k === m));
  };
  const setDiag = on => { holdDiag = on; diagBtn.classList.toggle('on', on || holdShift); };

  $('mLonga').addEventListener('click', () => setMode('longa'));
  $('mMedia').addEventListener('click', () => setMode('media'));
  $('mForte').addEventListener('click', () => setMode('forte'));
  diagBtn.addEventListener('pointerdown', e => { setDiag(true); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) diagBtn.addEventListener(ev, () => setDiag(false));

  // Espetada: each source (Q, E, the two Espeta buttons) holds the paddle planted while it is down.
  // The latest one pressed wins. The game reads plantWanted() every frame, so a plant the physics
  // dropped (a stroke, a huli, the countdown) comes back on its own while the button is still held.
  const held = new Map();
  const hold = (src, side) => { held.delete(src); if (side) held.set(src, side); };
  // a stroke held down ends in an espetada on the same side
  const timers = new Map();
  const strokeDown = (src, side) => {
    const took = stroke(side);
    clearTimeout(timers.get(src));
    timers.set(src, setTimeout(() => hold(src, side), HOLD_MS));
    return took;
  };
  const strokeUp = src => { clearTimeout(timers.get(src)); timers.delete(src); hold(src, 0); };
  for (const [id, side] of [['spikeL', -1], ['spikeR', 1]]) {
    const btn = $(id);
    btn.addEventListener('pointerdown', e => { hold(id, side); e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => hold(id, 0));
  }
  // tap a side pad to stroke on that side, keep it down to espetar
  for (const [id, side] of [['padL', -1], ['padR', 1]]) {
    const pad = $(id);
    pad.addEventListener('pointerdown', e => { strokeDown(id, side); e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, () => strokeUp(id));
  }

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') { holdShift = true; diagBtn.classList.add('on'); }
    if (k === 'w' || k === 'arrowup') holdW = true;
    if (k === 's' || k === 'arrowdown') holdS = true;
    if (e.repeat) return;
    if (k === 'a' || k === 'arrowleft') { if (strokeDown(k, -1) !== null) e.preventDefault(); }
    else if (k === 'd' || k === 'arrowright') { if (strokeDown(k, 1) !== null) e.preventDefault(); }
    else if (k === 'q') hold('q', -1);
    else if (k === 'e') hold('e', 1);
    else if (k === '1') setMode('longa'); else if (k === '2') setMode('media'); else if (k === '3') setMode('forte');
    else if (k === 'escape') onQuit();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') { holdShift = false; diagBtn.classList.toggle('on', holdDiag); }
    if (k === 'w' || k === 'arrowup') holdW = false;
    if (k === 's' || k === 'arrowdown') holdS = false;
    if (k === 'q' || k === 'e') hold(k, 0);
    if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') strokeUp(k);
  });
  window.addEventListener('blur', () => { holdW = holdS = holdShift = false; setDiag(false); held.clear(); for (const id of timers.values()) clearTimeout(id); timers.clear(); });

  return {
    plantWanted() { let side = 0; for (const s of held.values()) side = s; return side; },
    showPlant(side) { for (const [id, s] of [['spikeL', -1], ['spikeR', 1], ['padL', -1], ['padR', 1]]) $(id).classList.toggle('plant', side === s); },
  };
}
