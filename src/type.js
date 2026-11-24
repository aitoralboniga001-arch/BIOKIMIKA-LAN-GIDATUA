// Text director: every beat-driven text reveal runs on the presentation clock (clock.t), so __pres.step() advances it,
// it stays in sync with the WebGL bridges, and a hidden or throttled window never freezes it half-way.
//
// Markup stays as it was: [data-b] elements get .on from applyBeat(); the director animates whatever turns on or off.
//   .fx                 default: fade + rise (variants .l .r .pop .fade .pin, delays .d1–.d6, exactly as before)
//   .h1                 lines: each line rises out of a mask (0.9 s, 80 ms per line)
//   .key                words: each word rises out of a mask (0.7 s, 35 ms per word)
//   data-reveal="lines|words|count|fade|none"  overrides the default for one element
//   .draw (SVG, pathLength=1)  the stroke draws itself (2.2 s, .slow 3.2 s)
// Hand-over rule: when a beat both removes and adds text in a layer, the outgoing text leaves first (0.25 s) and the
// incoming text starts after it, so the same place never shows two texts at once.
//
// The animated values are written as registered custom properties (--rv opacity, --ro offset), so a slide that sets an
// inline opacity on its own element still wins, exactly like it did over the old CSS class.
import { clock } from './core.js';

const OUT = .25;                              // exit duration (s)
const DELAY = { d1: .15, d2: .3, d3: .45, d4: .6, d5: .9, d6: 1.3 };
const outQuint = t => 1 - (1 - t) ** 5;       // ≈ cubic-bezier(.2,.8,.2,1)
const inQuad = t => t * t;                     // ≈ cubic-bezier(.4,0,1,1)
const io = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const live = new Set();                        // records still animating
const rec = el => el._td;

// ------------------------------------------------------------------ preparation (once, after fonts are ready)
function wrapWords(root) {
  const words = [];
  const walk = node => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        const parts = ch.nodeValue.split(/(\s+)/);
        if (parts.length === 1 && !parts[0].trim()) continue;
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); continue; }
          const w = document.createElement('span'); w.className = 'tw';
          const i = document.createElement('span'); i.className = 'twi'; i.textContent = part;
          w.appendChild(i); frag.appendChild(w); words.push(w);
        }
        node.replaceChild(frag, ch);
      } else if (ch.nodeType === 1 && ch.tagName !== 'BR' && !ch.classList.contains('nosplit')) walk(ch);
    }
  };
  walk(root);
  return words;
}

function prepare(el) {
  if (el._td) return el._td;
  let mode = el.dataset.reveal;
  if (!mode) mode = el.classList.contains('draw') ? 'draw' : el.classList.contains('h1') ? 'lines' : el.classList.contains('key') ? 'words' : 'fx';
  if (mode === 'none' || mode === 'fade') mode = 'fx';
  let delay = 0; for (const k in DELAY) if (el.classList.contains(k)) delay = Math.max(delay, DELAY[k]);
  const r = { el, mode, p: 0, from: 0, to: 0, t0: 0, dur: 0, delay, parts: null, count: null, on: false };
  if (mode === 'lines' || mode === 'words') {
    const words = wrapWords(el);
    if (!words.length) r.mode = 'fx';
    else {
      // lines: group by the word's vertical position (layout is fixed: the stage is always 1920 wide)
      let line = -1, lastTop = -1e9;
      r.parts = words.map((w, i) => {
        const top = w.offsetTop;
        if (Math.abs(top - lastTop) > 4) { line++; lastTop = top; }
        return { w, i: w.firstChild, k: mode === 'lines' ? line * .08 : i * .035 };
      });
      r.span = r.parts[r.parts.length - 1].k;
      el.classList.add('tsplit');
    }
  }
  if (mode === 'count') {
    r.count = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) if (/\d/.test(n.nodeValue)) r.count.push({ n, src: n.nodeValue });
    el.classList.add('tnum');
  }
  el._td = r;
  write(r, 0, 0);
  return r;
}

// one-time pass over a slide layer: decide modes, split text. Static headings (no data-b) join the beat system so they
// are revealed in step with the bridge instead of riding on the layer's fade.
export function prepareLayer(layer) {
  layer.querySelectorAll('.eyebrow:not([data-b]), .h1:not([data-b])').forEach(e => { e.dataset.b = '0'; e.classList.add('fx'); });
  if (layer.querySelector('.eyebrow')) layer.querySelectorAll('.h1').forEach(e => e.classList.add('d1'));
  layer.querySelectorAll('[data-b]').forEach(e => {
    if (e.classList.contains('dim') || e.classList.contains('lab') || e.classList.contains('fxl')) return;
    if (e.classList.contains('draw') || e.classList.contains('fx')) prepare(e);
  });
}

// ------------------------------------------------------------------ writing
function write(r, v, dir) {
  const s = r.el.style;
  if (r.mode === 'draw') { s.strokeDashoffset = (1 - v).toFixed(4); s.setProperty('--rv', v > 0 ? 1 : 0); return; }
  if (r.parts) {
    s.setProperty('--rv', v > 0 ? 1 : 0); s.setProperty('--ro', 0);
    const total = r.dur;
    for (const pt of r.parts) {
      let q;
      if (dir > 0) q = outQuint(Math.min(1, Math.max(0, (r.tl - pt.k) / (total - r.span))));
      else q = v;
      const is = pt.i.style;
      is.setProperty('--rv', q.toFixed(3));
      is.setProperty('--ro', dir > 0 || v === 0 ? (1 - q).toFixed(3) : (-(1 - v) * .35).toFixed(3));
    }
    return;
  }
  s.setProperty('--rv', v.toFixed(3));
  s.setProperty('--ro', dir >= 0 ? (1 - v).toFixed(3) : (-(1 - v) * .5).toFixed(3));
  if (r.count && dir > 0) {
    const k = v;
    for (const c of r.count) c.n.nodeValue = c.src.replace(/\d+(?:[.,]\d+)?/g, m => {
      const dec = (m.split(/[.,]/)[1] || '').length, sep = m.includes(',') ? ',' : '.';
      return (parseFloat(m.replace(',', '.')) * k).toFixed(dec).replace('.', sep);
    });
  } else if (r.count && v === 0) for (const c of r.count) c.n.nodeValue = c.src;
}

function start(r, on, delay, instant) {
  r.on = on;
  if (instant) { r.p = on ? 1 : 0; r.phase = 0; write(r, r.p, 0); if (r.count && on) for (const c of r.count) c.n.nodeValue = c.src; live.delete(r); return; }
  r.t0 = clock.t + delay; r.from = r.p; r.to = on ? 1 : 0;
  if (on) r.dur = r.mode === 'draw' ? (r.el.classList.contains('slow') ? 3.2 : 2.2) : r.parts ? (r.mode === 'lines' ? .9 : .7) + r.span : r.count ? 1.1 : .7;
  else r.dur = r.mode === 'draw' ? .3 : OUT;
  r.dir = on ? 1 : -1; live.add(r);
}

// called by applyBeat for every element whose .on changed; `ctx` collects one beat change of one layer
export function beatChange(changes, instant) {
  // hand-over: if anything visible leaves, everything that enters waits for it
  let leaving = false;
  for (const [el, on] of changes) { const r = rec(el); if (r && !on && r.p > .05) leaving = true; }
  for (const [el, on] of changes) {
    const r = rec(el); if (!r) continue;
    start(r, on, on ? r.delay + (leaving ? OUT * .9 : 0) : 0, instant);
  }
}

// every frame
export function tick() {
  if (!live.size) return;
  const t = clock.t;
  for (const r of live) {
    if (t < r.t0) continue;
    const k = Math.min(1, (t - r.t0) / r.dur);
    if (r.dir > 0) {
      r.tl = (t - r.t0);
      const e = r.mode === 'draw' ? io(k) : r.parts ? k : outQuint(k);
      r.p = r.from + (1 - r.from) * e;
      write(r, r.p, 1);
    } else {
      r.p = r.from * (1 - inQuad(k));
      write(r, r.p, -1);
    }
    if (k >= 1) { r.p = r.to; write(r, r.p, r.on ? 1 : 0); if (r.count && r.on) for (const c of r.count) c.n.nodeValue = c.src; live.delete(r); }
  }
}
export const directorBusy = () => live.size;
