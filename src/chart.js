// Animated activity-vs-time chart (SVG). Curves are revealed up to a time; a cursor reads a value.
import { Tw, ease, add } from './core.js';
import { PAL, INK, INK2, AXIS, LINE2, PAPER, alpha } from './theme.js';

const NS = 'http://www.w3.org/2000/svg';
export function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

// skewed bell: rises, peaks at tp, falls; k sets sharpness. returns 0..A (+ baseline)
export const bell = (A, tp, k, base = .06) => t => t <= 0 ? base : base + A * Math.pow(t / tp, k) * Math.exp(k * (1 - t / tp));

export class Chart {
  constructor(layer, { x, y, w, h, ymax = 1.05, ref = .18, xLabel = 'Denbora', yLabel = 'Jarduera', refLabel = 'Erreferentzia-tartea', b = null }) {
    Object.assign(this, { x, y, w, h, ymax, ref });
    const svg = el('svg', { class: 'chart', width: w + 160, height: h + 130, viewBox: `-80 -40 ${w + 160} ${h + 130}` });
    svg.style.left = (x - 80) + 'px'; svg.style.top = (y - 40) + 'px';
    if (b != null) svg.dataset.b = b;
    layer.appendChild(svg); this.svg = svg;
    const defs = el('defs', {}, svg);
    const gl = el('filter', { id: 'glow' + Math.round(x + y), x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    el('feGaussianBlur', { stdDeviation: 5, result: 'b' }, gl); const m = el('feMerge', {}, gl); el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);
    this.glowId = gl.id;
    this.g = el('g', {}, svg);
    // reference band
    this.refRect = el('rect', { x: 0, y: this.Y(ref), width: w, height: h - this.Y(ref), fill: 'rgba(20,32,51,.045)' }, this.g);
    el('line', { x1: 0, x2: w, y1: this.Y(ref), y2: this.Y(ref), stroke: LINE2, 'stroke-dasharray': '6 7', 'stroke-width': 1.5 }, this.g);
    // its label is a legend below the x axis (left), where no curve can pass; the swatch repeats the band's fill and dashed edge
    const lg = el('g', { transform: `translate(0,${h + 80})` }, this.g);
    el('rect', { x: 0, y: -17, width: 34, height: 18, fill: 'rgba(20,32,51,.09)' }, lg);
    el('line', { x1: 0, x2: 34, y1: -17, y2: -17, stroke: LINE2, 'stroke-dasharray': '6 4', 'stroke-width': 1.5 }, lg);
    const rl = el('text', { x: 46, y: 0, 'font-size': 21, fill: PAL.mute }, lg); rl.textContent = refLabel;
    // axes
    el('path', { d: `M0 -10 V${h} H${w + 20}`, fill: 'none', stroke: AXIS, 'stroke-width': 2 }, this.g);
    el('path', { d: `M-7 0 L0 -14 L7 0 M${w + 14} ${h - 7} L${w + 28} ${h} L${w + 14} ${h + 7}`, fill: 'none', stroke: AXIS, 'stroke-width': 2, transform: 'translate(0,-6)' }, this.g);
    const xl = el('text', { x: w + 10, y: h + 80, 'text-anchor': 'end', 'font-size': 21, fill: INK2 }, this.g); xl.textContent = xLabel;
    const yl = el('text', { x: 14, y: -14, 'font-size': 23, 'font-weight': 600, fill: INK }, this.g); yl.textContent = yLabel;
    this.phases = el('g', {}, this.g);
    this.curvesG = el('g', {}, this.g);
    this.marksG = el('g', {}, this.g);
    this.curves = [];
    // cursor
    this.cur = el('g', { opacity: 0 }, this.g); this.curOn = new Tw(0); this.curT = new Tw(0);
    this.curLine = el('line', { y1: -6, y2: h, stroke: alpha(INK, .55), 'stroke-width': 2, 'stroke-dasharray': '3 6' }, this.cur);
    this.curTube = el('g', {}, this.cur);
    this.curTag = el('text', { y: h + 46, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: INK }, this.cur);
    this.curDots = [];
  }
  X(t) { return t * this.w; }
  Y(v) { return this.h - v / this.ymax * this.h; }
  curve(fn, { color = PAL.coral, dash = null, width = 5, name = '', nameAt = .3, nameDy = -22 } = {}) {
    const glow = el('path', { fill: 'none', stroke: color, 'stroke-width': width + 8, opacity: .12, 'stroke-linecap': 'round', filter: `url(#${this.glowId})` }, this.curvesG);
    const p = el('path', { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.curvesG);
    if (dash) { p.setAttribute('stroke-dasharray', dash); glow.setAttribute('stroke-dasharray', dash); }
    const lab = el('text', { 'font-size': 26, 'font-weight': 700, fill: color, opacity: 0 }, this.curvesG); lab.textContent = name;
    const c = { fn, p, glow, lab, color, reveal: new Tw(0), nameAt, nameDy, last: -1 };
    const dot = el('circle', { r: 9, fill: color, stroke: PAPER, 'stroke-width': 3 }, this.cur); this.curDots.push(dot);
    this.curves.push(c); return c;
  }
  // shaded time window with a caption (for the rise / peak / fall phases)
  phase(t0, t1, label, color = alpha(PAL.amber, .08), b = null) {
    const g = el('g', {}, this.phases); if (b != null) g.dataset.b = b;
    el('rect', { x: this.X(t0), y: 0, width: this.X(t1) - this.X(t0), height: this.h, fill: color }, g);
    const tx = el('text', { x: (this.X(t0) + this.X(t1)) / 2, y: 30, 'text-anchor': 'middle', 'font-size': 25, 'font-weight': 700, fill: PAL.amber }, g); tx.textContent = label;
    return g;
  }
  mark(t, ci, b = null, { label = '', color } = {}) {
    const c = this.curves[ci]; const v = c.fn(t);
    const g = el('g', {}, this.marksG); if (b != null) g.dataset.b = b;
    el('circle', { cx: this.X(t), cy: this.Y(v), r: 11, fill: color || INK, stroke: PAPER, 'stroke-width': 3 }, g);
    if (label) { const tx = el('text', { x: this.X(t), y: this.Y(v) - 22, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 600, fill: INK }, g); tx.textContent = label; }
    return g;
  }
  cursor(on, t, d = 1.6, tag = '') {
    this.curOn.to(on ? 1 : 0, .5);
    if (t != null) this.curT.to(t, d, ease.io);
    if (tag != null) this.curTag.textContent = tag;
  }
  update() {
    for (const c of this.curves) {
      const r = c.reveal.v; if (Math.abs(r - c.last) < 1e-4) continue; c.last = r;
      let d = ''; const N = Math.max(2, Math.ceil(220 * r));
      for (let i = 0; i <= N; i++) { const t = r * i / N; d += (i ? 'L' : 'M') + this.X(t).toFixed(1) + ' ' + this.Y(c.fn(t)).toFixed(1); }
      c.p.setAttribute('d', r > 0.001 ? d : ''); c.glow.setAttribute('d', r > 0.001 ? d : '');
      const tn = Math.min(r, c.nameAt);
      c.lab.setAttribute('x', this.X(c.nameAt) + 14); c.lab.setAttribute('y', this.Y(c.fn(c.nameAt)) + c.nameDy);
      c.lab.setAttribute('opacity', r > c.nameAt ? 1 : 0); void tn;
    }
    const o = this.curOn.v; this.cur.setAttribute('opacity', o.toFixed(3));
    const t = this.curT.v, x = this.X(t);
    this.curLine.setAttribute('x1', x); this.curLine.setAttribute('x2', x); this.curTag.setAttribute('x', x);
    this.curves.forEach((c, i) => { const dot = this.curDots[i]; dot.setAttribute('cx', x); dot.setAttribute('cy', this.Y(c.fn(t))); dot.setAttribute('opacity', c.reveal.v >= t - .002 ? 1 : 0); });
  }
  value(ci, t = this.curT.v) { return this.curves[ci].fn(t); }
}
