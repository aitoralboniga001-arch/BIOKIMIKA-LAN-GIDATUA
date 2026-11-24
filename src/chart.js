// Animated activity-vs-time chart (SVG). Curves are revealed up to a time; a cursor reads a value.
import { Tw, ease, add, clock } from './core.js';
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
    this.defs = el('defs', {}, svg);
    this.clipPrefix = 'curve-' + layer.dataset.slide + '-';
    this.g = el('g', {}, svg);
    // hairline grid: one line per reference-band height (a quiet rhythm, never competing with the curves)
    this.gridG = el('g', { opacity: 0 }, this.g);
    for (let v = ref * 2; v < ymax - .02; v += ref) el('line', { x1: 0, x2: w, y1: this.Y(v), y2: this.Y(v), stroke: 'rgba(20,32,51,.06)', 'stroke-width': 1.5 }, this.gridG);
    // reference band
    this.refRect = el('rect', { x: 0, y: this.Y(ref), width: w, height: h - this.Y(ref), fill: 'rgba(20,32,51,.045)' }, this.g);
    el('line', { x1: 0, x2: w, y1: this.Y(ref), y2: this.Y(ref), stroke: LINE2, 'stroke-dasharray': '6 7', 'stroke-width': 1.5 }, this.g);
    // its label is a legend below the x axis (left), where no curve can pass; the swatch repeats the band's fill and dashed edge
    const lg = el('g', { transform: `translate(0,${h + 80})` }, this.g);
    el('rect', { x: 0, y: -17, width: 34, height: 18, fill: 'rgba(20,32,51,.09)' }, lg);
    el('line', { x1: 0, x2: 34, y1: -17, y2: -17, stroke: LINE2, 'stroke-dasharray': '6 4', 'stroke-width': 1.5 }, lg);
    const rl = el('text', { x: 46, y: 0, 'font-size': 22, fill: PAL.mute }, lg); rl.textContent = refLabel;
    // axes: 2 px, round caps, no arrowheads; they draw themselves in (y up, then x along time) when the chart appears
    this.axY = el('path', { d: `M0 ${h} V-10`, fill: 'none', stroke: AXIS, 'stroke-width': 2, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, this.g);
    this.axX = el('path', { d: `M0 ${h} H${w + 20}`, fill: 'none', stroke: AXIS, 'stroke-width': 2, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, this.g);
    this.ticks = el('g', { opacity: 0 }, this.g);
    for (let i = 1; i <= 8; i++) el('line', { x1: this.X(i / 8), x2: this.X(i / 8), y1: h, y2: h + 8, stroke: AXIS, 'stroke-width': 2, 'stroke-linecap': 'round' }, this.ticks);
    const xl = el('text', { x: w + 10, y: h + 80, 'text-anchor': 'end', 'font-size': 22, fill: INK2 }, this.g); xl.textContent = xLabel;
    const yl = el('text', { x: 14, y: -14, 'font-size': 24, 'font-weight': 600, fill: INK, 'letter-spacing': '-.2' }, this.g); yl.textContent = yLabel;
    this.ax = new Tw(0); this.axOn = false;
    this.phases = el('g', {}, this.g);
    this.curvesG = el('g', {}, this.g);
    this.marksG = el('g', {}, this.g);
    this.curves = [];
    // cursor
    this.cur = el('g', { opacity: 0 }, this.g); this.curOn = new Tw(0); this.curT = new Tw(0);
    this.curLine = el('line', { y1: -6, y2: h, stroke: alpha(INK, .5), 'stroke-width': 2, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }, this.cur);
    this.curTube = el('g', {}, this.cur);
    // the sample tube that marks where the cursor reads (a 2.6-stroke line glyph, same family as icons.js)
    this.sampleIcon = false; // opt-in per chart (slide 7 has its own 3D tube cursor)
    this.curTubeIcon = el('g', { transform: 'translate(-11,-50)', fill: 'none', stroke: INK, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.curTube);
    el('path', { d: 'M3 2h16M5 2v30a6 6 0 0 0 12 0V2' }, this.curTubeIcon);
    el('path', { d: 'M5 18h12v14a6 6 0 0 1-12 0Z', fill: alpha(PAL.amber, .35), stroke: 'none' }, this.curTubeIcon);
    this.curTag = el('text', { y: h + 46, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 650, fill: INK }, this.cur);
    this.curDots = [];
  }
  X(t) { return t * this.w; }
  Y(v) { return this.h - v / this.ymax * this.h; }
  curve(fn, { color = PAL.coral, dash = null, width = 5, name = '', nameAt = .3, nameDy = -22 } = {}) {
    const id = this.clipPrefix + this.curves.length;
    const clip = el('clipPath', {id}, this.defs);
    const extent = el('rect', {x:-6, y:-40, height:this.h+80, width:0}, clip);
    const trace = el('g', {'clip-path':'url(#'+id+')'}, this.curvesG);
    const path = Array.from({length:241},(_,j)=>(j?'L':'M')+this.X(j/240).toFixed(2)+' '+this.Y(fn(j/240)).toFixed(2)).join('');
    const area = el('path', { d: path + `L${this.X(1)} ${this.h}L0 ${this.h}Z`, fill: color, 'fill-opacity': dash ? .05 : .08, stroke: 'none' }, trace);
    const glow = el('path', {fill:'none',stroke:PAPER,'stroke-width':width+5,opacity:.85,'stroke-linecap':'round','stroke-linejoin':'round'},trace);
    const p = el('path', { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, trace);
    p.setAttribute('d',path); glow.setAttribute('d',path);
    // dashed curves: round caps grow each dash by the stroke width, so lengthen the gaps by the same amount
    if (dash) { const d2 = dash.split(/[ ,]+/).map((v, i) => i % 2 ? +v + width : Math.max(.1, +v - width * .5)).join(' '); p.setAttribute('stroke-dasharray', d2); glow.setAttribute('stroke-dasharray', d2); }
    const lab = el('text', { 'font-size': 26, 'font-weight': 700, fill: color, opacity: 0, 'letter-spacing': '-.2' }, this.curvesG); lab.textContent = name;
    const c = { fn, p, glow, area, lab, extent, color, reveal: new Tw(0), nameAt, nameDy, last: -1, labA: 0 };
    const dot = el('circle', { r: 9, fill: color, stroke: PAPER, 'stroke-width': 3 }, this.cur); this.curDots.push(dot);
    this.curves.push(c); return c;
  }
  // shaded time window with a caption (for the rise / peak / fall phases)
  phase(t0, t1, label, color = alpha(PAL.amber, .08), b = null) {
    const g = el('g', {}, this.phases); if (b != null) g.dataset.b = b;
    el('rect', { x: this.X(t0), y: 0, width: this.X(t1) - this.X(t0), height: this.h, fill: color }, g);
    const tx = el('text', { x: (this.X(t0) + this.X(t1)) / 2, y: 30, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 650, fill: PAL.amber, 'letter-spacing': '.4' }, g); tx.textContent = label;
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
    // axes draw in when the chart is shown (clock-driven, so they follow __pres.step and the bridges)
    const shown = !this.svg.dataset.b || this.svg.classList.contains('on');
    if (shown !== this.axOn) { this.axOn = shown; this.ax.to(shown ? 1 : 0, shown ? 1.1 : .25, shown ? ease.outQuint : ease.in); }
    const a = this.ax.v;
    if (a !== this.axLast) {
      this.axLast = a;
      this.axY.setAttribute('stroke-dashoffset', (1 - Math.min(1, a * 1.6)).toFixed(4));
      this.axX.setAttribute('stroke-dashoffset', (1 - Math.max(0, Math.min(1, (a - .2) / .8))).toFixed(4));
      this.ticks.setAttribute('opacity', Math.max(0, (a - .6) / .4).toFixed(3)); this.gridG.setAttribute('opacity', Math.max(0, (a - .4) / .6).toFixed(3));
    }
    for (const c of this.curves) {
      const r = c.reveal.v;
      // the direct label fades in as the trace passes it (and out when the trace is withdrawn)
      const la = Math.max(0, Math.min(1, c.labA + (r > c.nameAt ? 1 : -1) * clock.dt / .35));
      if (la !== c.labA) { c.labA = la; c.lab.setAttribute('opacity', (la * la * (3 - 2 * la)).toFixed(3)); }
      if (Math.abs(r - c.last) < 1e-4) continue; c.last = r;
      c.extent.setAttribute('width',r < .001 ? 0 : this.X(r)+7);
      c.lab.setAttribute('x', this.X(c.nameAt) + 14); c.lab.setAttribute('y', this.Y(c.fn(c.nameAt)) + c.nameDy);
    }
    const o = this.curOn.v; this.cur.setAttribute('opacity', o.toFixed(3));
    const t = this.curT.v, x = this.X(t);
    this.curLine.setAttribute('x1', x); this.curLine.setAttribute('x2', x); this.curTag.setAttribute('x', x);
    this.curLine.setAttribute('y1', (this.h - (this.h + 6) * ease.outQuint(o)).toFixed(1));
    const sample = this.sampleIcon && /lagin|goiztiar|berantiar/i.test(this.curTag.textContent);
    if (sample !== this.tubeShown) { this.tubeShown = sample; this.curTubeIcon.style.display = sample ? '' : 'none'; }
    if (sample) this.curTubeIcon.setAttribute('transform', `translate(${(x - 11).toFixed(1)},-50)`);
    this.curves.forEach((c, i) => { const dot = this.curDots[i]; dot.setAttribute('cx', x); dot.setAttribute('cy', this.Y(c.fn(t))); dot.setAttribute('opacity', c.reveal.v >= t - .002 ? 1 : 0); });
  }
  value(ci, t = this.curT.v) { return this.curves[ci].fn(t); }
}
