// The results screen's race summary: a map of every canoe's path from the start to the line and a
// chart of each one's speed along the course, each with its top speed marked. One athlete at a time
// is picked (the player at first, or whoever is tapped in the legend): their path is painted by speed.
const NS = 'http://www.w3.org/2000/svg';
let W = 640;
const PAD_L = 34, PAD_R = 12, MAP_H = 150, CHART_H = 150, CHART_TOP = 10, CHART_BOT = 22;
const KMH = 3.6;
// speed along the picked path: one hue (sand to sun), darker = slower
const RAMP = ['#7d5a2a', '#a8782f', '#d39a36', '#f5b841', '#ffd77e', '#fff1c9'];

const kmh = v => (v * KMH).toFixed(1).replace('.', ',');
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const rampAt = f => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(f * (RAMP.length - 1))))];
// a stroke speeds the canoe up and the glide slows it, so the line shows the speed averaged over ~2 s
// (9 points of 0.25 s); the top speed is the true peak
const smooth = pts => pts.map((p, i) => {
  let sum = 0, n = 0;
  for (let j = Math.max(0, i - 4); j <= Math.min(pts.length - 1, i + 4); j++) { sum += pts[j][2]; n++; }
  return [p[0], p[1], sum / n];
});
const niceStep = span => [5, 10, 25, 50, 100, 200, 250, 500, 1000].find(s => span / s <= 6) || 1000;

export function setupTrail(box) {
  let focus = null, last = null;

  box.innerHTML = '<h3>Trajeto e velocidade</h3>'
    + '<svg class="trmap" role="img"></svg>'
    + '<div class="trscale"><span>devagar</span><i></i><span>rápido</span><span class="peakkey"><u></u>ponto de velocidade máxima</span></div>'
    + '<svg class="trchart" role="img"></svg>'
    + '<div class="trtip" hidden></div>'
    + '<div class="trlegend" role="group" aria-label="Escolher atleta"></div>'
    + '<p class="note">A largura do mar está ampliada para os trajetos aparecerem. No gráfico, a velocidade é a média de cada 2 s. Toque num nome para ver o trajeto daquele atleta colorido pela velocidade.</p>';
  const map = box.querySelector('.trmap'), chart = box.querySelector('.trchart');
  const legend = box.querySelector('.trlegend'), tip = box.querySelector('.trtip');
  box.querySelector('.trscale i').style.background = 'linear-gradient(90deg, ' + RAMP.join(', ') + ')';
  addEventListener('resize', () => { if (last && box.clientWidth) draw(last.st, last.len); });

  // st: the standings (each with .trail), len: the course length in metres
  function draw(st, len) {
    last = { st, len };
    // one unit of the drawing to a pixel on screen, so the labels keep their size on a phone
    W = Math.max(300, Math.min(640, box.clientWidth - 20 || 640));
    map.setAttribute('viewBox', `0 0 ${W} ${MAP_H}`);
    chart.setAttribute('viewBox', `0 0 ${W} ${CHART_H}`);
    const avg = new Map(st.map(a => [a, smooth(a.trail.pts)]));
    if (!focus || !st.some(a => a.c === focus)) focus = (st.find(a => a.me) || st[0]).c;
    const picked = st.find(a => a.c === focus);
    // the picked athlete is drawn last, on top
    const order = st.filter(a => a !== picked).concat(picked);
    const X = y => PAD_L + Math.max(0, Math.min(len, y)) / len * (W - PAD_L - PAD_R);

    // map: course left to right, the paddler's right downwards
    let lo = Infinity, hi = -Infinity;
    for (const a of st) for (const p of a.trail.pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    if (lo > hi) { lo = -20; hi = 20; }
    const mid = (lo + hi) / 2, half = Math.max(20, (hi - lo) / 2 + 6);
    const Ym = x => 12 + (x - (mid - half)) / (2 * half) * (MAP_H - 30);
    map.innerHTML = '';
    map.setAttribute('aria-label', 'Mapa dos trajetos de ' + st.map(a => a.name).join(', '));
    el('rect', { x: PAD_L, y: 6, width: W - PAD_L - PAD_R, height: MAP_H - 18, rx: 8, class: 'sea' }, map);
    const step = niceStep(len);
    const ticks = [];
    for (let d = step; d < len - step * 0.4; d += step) ticks.push(d);
    for (const d of ticks) {
      el('line', { x1: X(d), x2: X(d), y1: 6, y2: MAP_H - 12, class: 'grid' }, map);
      el('text', { x: X(d), y: MAP_H - 1, class: 'tick', 'text-anchor': 'middle' }, map).textContent = d + ' m';
    }
    for (const [d, name] of [[0, 'Largada'], [len, 'Chegada']]) {
      el('line', { x1: X(d), x2: X(d), y1: 6, y2: MAP_H - 12, class: 'goal' }, map);
      el('text', { x: X(d), y: MAP_H - 1, class: 'tick', 'text-anchor': d ? 'end' : 'start' }, map).textContent = name;
    }
    const top = Math.max(0.1, ...st.map(a => a.trail.top));
    // the picked path's colours run from its own slowest to its fastest stretch (past the start)
    const own = avg.get(picked).filter(p => p[0] > 30).map(p => p[2]);
    const slow = own.length ? Math.min(...own) : 0, fast = own.length ? Math.max(...own) : top;
    const fv = v => (v - slow) / Math.max(0.1, fast - slow);
    for (const a of order) {
      const pts = avg.get(a);
      if (pts.length < 2) continue;
      const line = pts.map(p => X(p[0]).toFixed(1) + ',' + Ym(p[1]).toFixed(1)).join(' ');
      if (a !== picked) { el('polyline', { points: line, class: 'other', stroke: a.css }, map); continue; }
      el('polyline', { points: line, class: 'ring' }, map);
      for (let i = 1; i < pts.length; i++) {
        el('line', { x1: X(pts[i - 1][0]), y1: Ym(pts[i - 1][1]), x2: X(pts[i][0]), y2: Ym(pts[i][1]),
          stroke: rampAt(fv((pts[i - 1][2] + pts[i][2]) / 2)), class: 'speed' }, map);
      }
    }
    for (const a of order) if (a.trail.topAt) {
      const [y, x] = a.trail.topAt;
      el('circle', { cx: X(y), cy: Ym(x), r: a === picked ? 6 : 4, fill: a.css, class: 'peak' }, map);
    }
    const mapDot = el('circle', { r: 5, class: 'hover', visibility: 'hidden' }, map);

    // speed along the course
    chart.innerHTML = '';
    chart.setAttribute('aria-label', 'Velocidade de cada atleta ao longo do percurso');
    const vmax = Math.ceil(top * KMH / 5) * 5;
    const Yc = v => CHART_TOP + (1 - v * KMH / vmax) * (CHART_H - CHART_TOP - CHART_BOT);
    for (let k = 0; k <= vmax; k += 5) {
      el('line', { x1: PAD_L, x2: W - PAD_R, y1: Yc(k / KMH), y2: Yc(k / KMH), class: k ? 'grid' : 'base' }, chart);
      el('text', { x: PAD_L - 6, y: Yc(k / KMH) + 4, class: 'tick', 'text-anchor': 'end' }, chart).textContent = k;
    }
    el('text', { x: PAD_L - 6, y: CHART_H - 4, class: 'tick', 'text-anchor': 'end' }, chart).textContent = 'km/h';
    for (const d of ticks) el('text', { x: X(d), y: CHART_H - 4, class: 'tick', 'text-anchor': 'middle' }, chart).textContent = d + ' m';
    for (const a of order) {
      const pts = avg.get(a);
      if (pts.length < 2) continue;
      el('polyline', { points: pts.map(p => X(p[0]).toFixed(1) + ',' + Yc(p[2]).toFixed(1)).join(' '),
        class: a === picked ? 'mine' : 'other', stroke: a.css }, chart);
    }
    if (picked.trail.topAt) {
      const px = X(picked.trail.topAt[0]), py = Yc(picked.trail.top);
      el('circle', { cx: px, cy: py, r: 5, fill: picked.css, class: 'peak' }, chart);
      el('text', { x: Math.min(W - PAD_R - 4, Math.max(PAD_L + 60, px)), y: Math.max(12, py - 9), class: 'label', 'text-anchor': 'middle' }, chart)
        .textContent = 'máx ' + kmh(picked.trail.top) + ' km/h';
    }
    const cross = el('line', { y1: CHART_TOP, y2: CHART_H - CHART_BOT, class: 'cross', visibility: 'hidden' }, chart);
    const chartDot = el('circle', { r: 4.5, fill: picked.css, class: 'peak', visibility: 'hidden' }, chart);

    // hover or drag along either picture: where the picked athlete was there and how fast
    const pts = avg.get(picked);
    const at = d => { let i = pts.findIndex(p => p[0] >= d); return pts[i < 0 ? pts.length - 1 : i]; };
    const show = e => {
      const svg = e.currentTarget, r = svg.getBoundingClientRect();
      const vx = (e.clientX - r.left) / r.width * W;
      const d = (vx - PAD_L) / (W - PAD_L - PAD_R) * len;
      if (!pts.length || d < 0 || d > len) return hide();
      const p = at(d);
      cross.setAttribute('x1', X(p[0])); cross.setAttribute('x2', X(p[0]));
      chartDot.setAttribute('cx', X(p[0])); chartDot.setAttribute('cy', Yc(p[2]));
      mapDot.setAttribute('cx', X(p[0])); mapDot.setAttribute('cy', Ym(p[1]));
      for (const m of [cross, chartDot, mapDot]) m.setAttribute('visibility', 'visible');
      tip.textContent = picked.name + ' · ' + Math.round(Math.min(len, p[0])) + ' m · ' + kmh(p[2]) + ' km/h';
      tip.hidden = false;
    };
    const hide = () => { for (const m of [cross, chartDot, mapDot]) m.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    for (const svg of [map, chart]) { svg.onpointermove = show; svg.onpointerdown = show; svg.onpointerleave = hide; }
    hide();

    legend.innerHTML = '';
    for (const a of st) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(a === picked));
      b.innerHTML = '<span class="dot"></span><span></span><b></b>';
      b.children[0].style.background = a.css;
      b.children[1].textContent = a.name;
      b.children[2].textContent = a.trail.top ? 'máx ' + kmh(a.trail.top) + ' km/h' : '–';
      b.addEventListener('click', () => { focus = a.c; draw(last.st, last.len); });
      legend.appendChild(b);
    }
  }

  return { draw, reset() { focus = null; } };
}
