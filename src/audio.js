// Synthesised sounds: paddle splashes and simple tones. Starts on the first click (browsers need a gesture).
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  splash(pan, strength) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const n = Math.floor(a.sampleRate * 0.2);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + strength * 800; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = 0.15 + strength * 0.25;
    let node = g;
    if (a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = pan * 0.6; g.connect(p); node = p; }
    src.connect(f); f.connect(g); node.connect(a.destination);
    src.start();
  }

  tone(f0, f1, dur, vol) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(f0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.05);
  }
}
