// Keyboard and touch controls. Calls onStroke(side, type) with side -1 (left) or +1 (right);
// it returns true for a stroke taken, false for one refused, and null when no race is running.
// onPlant(side) starts an espetada on that side; onPlant(0) lifts the paddle.
const $ = id => document.getElementById(id);
const HOLD_MS = 250;   // holding a side button this long turns the stroke into an espetada

export function setupInput({ onStroke, onPlant, onQuit }) {
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

  // touch: tap a side to stroke, keep the finger down to plant the paddle on that side
  let planted = 0;
  const plant = side => {
    planted = side;
    onPlant(side);
    for (const [id, s] of [['padL', -1], ['padR', 1]]) $(id).classList.toggle('plant', planted === s);
  };
  for (const [id, side] of [['padL', -1], ['padR', 1]]) {
    const pad = $(id);
    let timer = 0;
    pad.addEventListener('pointerdown', e => {
      stroke(side);
      clearTimeout(timer);
      timer = setTimeout(() => plant(side), HOLD_MS);
      e.preventDefault();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, () => {
      clearTimeout(timer);
      if (planted === side) plant(0);
    });
  }

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') { holdShift = true; diagBtn.classList.add('on'); }
    if (k === 'w' || k === 'arrowup') holdW = true;
    if (k === 's' || k === 'arrowdown') holdS = true;
    if (e.repeat) return;
    if (k === 'a' || k === 'arrowleft') { if (stroke(-1) !== null) e.preventDefault(); }
    else if (k === 'd' || k === 'arrowright') { if (stroke(1) !== null) e.preventDefault(); }
    else if (k === 'q') plant(-1);
    else if (k === 'e') plant(1);
    else if (k === '1') setMode('longa'); else if (k === '2') setMode('media'); else if (k === '3') setMode('forte');
    else if (k === 'escape') onQuit();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') { holdShift = false; diagBtn.classList.toggle('on', holdDiag); }
    if (k === 'w' || k === 'arrowup') holdW = false;
    if (k === 's' || k === 'arrowdown') holdS = false;
    if ((k === 'q' && planted < 0) || (k === 'e' && planted > 0)) plant(0);
  });
  window.addEventListener('blur', () => { holdW = holdS = holdShift = false; setDiag(false); if (planted) plant(0); });
}
