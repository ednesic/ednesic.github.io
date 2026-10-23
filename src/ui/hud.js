// Race HUD and the big centre callouts.
import { clamp, fmt } from '../utils.js';
import { HULI_ROLL } from '../canoe.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      pos: $('hPos'), time: $('hTime'), left: $('hLeft'), speed: $('hSpeed'), speedChip: $('hSpeedChip'), speedLbl: $('hSpeedLbl'),
      stam: $('hStam'), stamBar: $('hStamBar'), stamTxt: $('hStamTxt'), bal: $('hBal'), balBar: $('hBalBar'),
      arrow: $('hWindArrow'), kn: $('hWindKn'), wtxt: $('hWindTxt'), swell: $('hSwell'), callout: $('callout'),
    };
    this.calloutT = 0;
  }

  callout(title, sub) {
    const el = this.el.callout;
    el.textContent = title;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.append(s); }
    el.style.opacity = 1;
    this.calloutT = 1.4;
  }

  tick(dt) {
    if (this.calloutT > 0) { this.calloutT -= dt; if (this.calloutT <= 0) this.el.callout.style.opacity = 0; }
  }

  start(race) { this.el.swell.textContent = race.sea.shortSwell(); }

  update(race) {
    const e = this.el, me = race.me;
    e.pos.textContent = race.position() + 'º/4';
    e.time.textContent = fmt(race.rt);
    e.left.textContent = Math.max(0, Math.ceil(race.track.len - me.y));
    e.speed.textContent = (Math.hypot(me.vx, me.vy) * 3.6).toFixed(1);
    e.speedChip.classList.toggle('surf', me.surf > 0.6);
    e.speedLbl.textContent = me.plant ? 'espetada ' + (me.plant < 0 ? '◀' : '▶') : me.surf > 0.6 ? 'surfando' : me.bowDig > 0.18 && me.pitch < -0.04 ? 'proa afundando' : 'km/h';
    e.stam.style.width = me.st.toFixed(0) + '%';
    e.stamTxt.textContent = me.st.toFixed(0);
    e.stamBar.classList.toggle('low', me.st < 25);
    // bar spans ama-down .. ama-up; the centre mark sits at a third so the dangerous side gets more room
    const b = clamp(me.roll / HULI_ROLL, -1, 1);
    const bn = me.roll < 0 ? clamp(me.roll / 0.25, -1, 0) : b;
    e.bal.style.left = (bn < 0 ? 33.3 + bn * 33.3 : 33.3 + bn * 66.7).toFixed(1) + '%';
    e.balBar.classList.toggle('danger', b > 0.6);
    const w = race.sea.wind(race.t);
    // arrow shows where the wind blows relative to the canoe's bow (up = from behind)
    const ang = Math.atan2(w.x, w.y) - me.psi;
    e.arrow.style.transform = 'rotate(' + (ang * 180 / Math.PI).toFixed(0) + 'deg)';
    e.kn.textContent = Math.round(w.kn) + ' nós';
    const a = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) * 180 / Math.PI;
    e.wtxt.textContent = a < 50 ? 'de popa' : a > 130 ? 'de proa' : 'de través';
  }
}
