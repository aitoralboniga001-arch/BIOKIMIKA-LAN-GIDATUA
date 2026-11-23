// Presentation engine: one 16:9 stage, slides made of "beats", → advances a beat, ← goes back.
import { THREE, W, H, clock, U, initRenderer, resize, renderer, composer, renderPass, bloom, quality, applyBeat, h } from './core.js';
import { SLIDES, CHAPTERS } from './slides/index.js';
import { NOTES } from './notes.js';
import { Presenter } from './presenter.js';
import { applyTheme } from './theme.js';

applyTheme();

const stage = document.getElementById('stage');
const glc = document.getElementById('gl');
const snap = document.getElementById('snap');
const layers = document.getElementById('layers');
const chromeEl = document.getElementById('chrome');
let scale = 1, pr = 1;

const state = { si: 0, bi: 0, swap: null, t0: null };
let cur = null;

function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  pr = resize(scale);
  snap.width = Math.round(W * pr); snap.height = Math.round(H * pr);
}

// ---------------------------------------------------------------- chapters bar
// the name sits above its segment (outside the 3 px bar, which clips only the fill)
const chapEls = CHAPTERS.map(name => {
  const e = h(`<div class="wrap"><span class="lbl"></span><div class="ch"><i></i></div></div>`);
  e.querySelector('.lbl').textContent = name;
  document.getElementById('chapters').appendChild(e); return e;
});
function updateChrome() {
  const s = SLIDES[state.si];
  chromeEl.classList.toggle('hide', s.chapter < 0);
  const inCh = SLIDES.map((x, i) => i).filter(i => SLIDES[i].chapter === s.chapter);
  chapEls.forEach((e, ci) => {
    e.classList.toggle('cur', ci === s.chapter); e.classList.toggle('done', ci < s.chapter);
    let f = ci < s.chapter ? 1 : 0;
    if (ci === s.chapter) {
      const total = inCh.reduce((a, i) => a + SLIDES[i].beats, 0);
      const before = inCh.filter(i => i < state.si).reduce((a, i) => a + SLIDES[i].beats, 0);
      f = (before + state.bi + 1) / total;
    }
    e.querySelector('i').style.transform = `scaleX(${f})`;
  });
}

// ---------------------------------------------------------------- navigation
function setBeat(b, dir) {
  if (!cur) return;
  state.bi = b;
  applyBeat(cur.layer, b);
  cur.beat && cur.beat(b, dir);
  afterChange();
}
function goSlide(si, bi, dir) {
  si = Math.max(0, Math.min(SLIDES.length - 1, si));
  state.swap = { si, bi, dir };
}
function doSwap() {
  const { si, bi, dir } = state.swap; state.swap = null;
  // freeze the outgoing frame on the snapshot canvas, then dissolve it while the new scene flies in
  const ctx = snap.getContext('2d');
  ctx.clearRect(0, 0, snap.width, snap.height);
  if (glc.width > 0 && glc.height > 0 && snap.width > 0 && snap.height > 0) ctx.drawImage(glc, 0, 0, snap.width, snap.height);
  snap.classList.remove('go'); snap.style.opacity = 1; snap.style.transform = 'none'; snap.style.filter = 'none';
  void snap.offsetWidth;
  snap.classList.add('go'); snap.style.opacity = 0; snap.style.transform = dir < 0 ? 'scale(.94)' : 'scale(1.08)'; snap.style.filter = 'blur(6px)';
  if (cur) { cur.layer.classList.remove('cur'); cur.layer.classList.add('out'); cur.exit && cur.exit(); }
  cur = SLIDES[si]; state.si = si; state.bi = bi;
  cur.layer.classList.remove('out'); cur.layer.classList.add('cur');
  applyBeat(cur.layer, -1);
  cur.enter && cur.enter(bi, dir);
  // re-apply after the first frame, but only if the presenter has not moved on in the meantime
  const s0 = cur;
  requestAnimationFrame(() => { if (cur !== s0 || state.swap || state.bi !== bi) return; applyBeat(cur.layer, bi); cur.beat && cur.beat(bi, 0); });
  bloom.strength = bloomFor(cur);
  afterChange();
}
// slides still carry their night-theme bloom values (.45-.8); on a light background only real HDR highlights
// should bloom, so map them into a narrow, gentle range
function bloomFor(s) { return Math.min(.35, Math.max(.12, (s.bloom ?? .5) * .42)); }
function next() {
  if (state.t0 == null) state.t0 = performance.now();
  const s = state.swap ? SLIDES[state.swap.si] : SLIDES[state.si];
  const b = state.swap ? state.swap.bi : state.bi;
  const si = state.swap ? state.swap.si : state.si;
  if (state.swap) { if (b < s.beats - 1) state.swap.bi++; else goSlide(si + 1, 0, 1); return; }
  if (b < s.beats - 1) setBeat(b + 1, 1); else if (si < SLIDES.length - 1) goSlide(si + 1, 0, 1);
}
function prev() {
  if (state.swap) return;
  if (state.bi > 0) setBeat(state.bi - 1, -1); else if (state.si > 0) goSlide(state.si - 1, SLIDES[state.si - 1].beats - 1, -1);
}
function afterChange() {
  updateChrome();
  history.replaceState(null, '', `#${state.si + 1}.${state.bi + 1}`);
  presenter.update(state);
}

// ---------------------------------------------------------------- input
let digits = '';
const jump = document.body.appendChild(h('<div id="jump"></div>'));
function handleKey(e) {
  const k = e.key;
  if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k) || (k === 'Enter' && !digits)) { e.preventDefault(); next(); return; }
  if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); return; }
  if (k === 'Home') { goSlide(0, 0, -1); return; }
  if (k === 'End') { goSlide(SLIDES.length - 1, 0, 1); return; }
  if (/^[0-9]$/.test(k)) { digits += k; jump.textContent = '→ ' + digits; jump.style.display = 'block'; return; }
  if (k === 'Enter' && digits) { const n = +digits - 1; digits = ''; jump.style.display = 'none'; if (n >= 0 && n < SLIDES.length) goSlide(n, 0, n < state.si ? -1 : 1); return; }
  if (k === 'Escape') { digits = ''; jump.style.display = 'none'; document.getElementById('help').classList.remove('on'); return; }
  const lk = k.toLowerCase();
  if (lk === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
  if (lk === 'b' || k === '.') document.getElementById('black').classList.toggle('on');
  if (lk === 'h' || k === '?') document.getElementById('help').classList.toggle('on');
  if (lk === 'p' || lk === 'n') presenter.open(state);
  if (lk === 'q') { quality.level = quality.level ? 0 : 1; fit(); bloom.enabled = !!quality.level; } // bloom is subtle in daylight: drop it on slow machines
}
addEventListener('keydown', handleKey);
addEventListener('resize', fit);
stage.addEventListener('click', () => next());
addEventListener('contextmenu', e => { e.preventDefault(); prev(); });
let idle; addEventListener('mousemove', () => { document.body.classList.remove('hidecursor'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('hidecursor'), 1800); });

const presenter = new Presenter({ slides: SLIDES, notes: NOTES, chapters: CHAPTERS, onKey: handleKey, getState: () => state });

// ---------------------------------------------------------------- main loop
let last = performance.now(); let grabName = null;
function frame(now) {
  if (!frame.ext) requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
  clock.dt = dt; clock.t += dt; U.time.value = clock.t;
  if (!cur) { if (state.swap) doSwap(); return; }
  cur.update && cur.update(dt, clock.t);
  const cam = cur.camera;
  U.pxScale.value = (H * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  renderPass.scene = cur.scene; renderPass.camera = cam;
  composer.render(dt);
  if (cur.post) cur.post(dt, clock.t);
  if (grabName) { const n = grabName; grabName = null; fetch('/' + n, { method: 'POST', body: glc.toDataURL('image/jpeg', .9) }); }
  if (state.swap) doSwap();
}

// ---------------------------------------------------------------- boot
async function boot() {
  initRenderer(glc); fit();
  const bar = document.getElementById('loadBar');
  for (let i = 0; i < SLIDES.length; i++) {
    const s = SLIDES[i];
    s.layer = h(`<div class="layer" data-slide="${s.id}"></div>`); layers.appendChild(s.layer);
    s.build(s.layer);
    s.layer.querySelectorAll('[data-b]').forEach(e => { if (!e.classList.contains('fx') && !e.classList.contains('draw') && !e.classList.contains('dim') && !e.classList.contains('lab')) e.classList.add('fx'); });
    // warm up shaders so the talk never stutters on a first appearance
    try { renderer.compile(s.scene, s.camera); } catch (e) { /* ignore */ }
    bar.style.transform = `scaleX(${(i + 1) / SLIDES.length})`;
    await new Promise(r => setTimeout(r, 0));
  }
  const m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash);
  let si = 0, bi = 0;
  if (m) { si = Math.min(SLIDES.length - 1, Math.max(0, +m[1] - 1)); bi = Math.min(SLIDES[si].beats - 1, Math.max(0, (+m[2] || 1) - 1)); }
  state.swap = { si, bi, dir: 1 };
  addEventListener('hashchange', () => {
    const m2 = /^#(\d+)(?:\.(\d+))?/.exec(location.hash); if (!m2) return;
    const a = Math.min(SLIDES.length - 1, Math.max(0, +m2[1] - 1)), b = Math.min(SLIDES[a].beats - 1, Math.max(0, (+m2[2] || 1) - 1));
    if (!cur || state.swap || a !== state.si) goSlide(a, b, a < state.si ? -1 : 1); else if (b !== state.bi) setBeat(b, b < state.bi ? -1 : 1);
  });
  requestAnimationFrame(frame);
  setTimeout(() => document.getElementById('loading').classList.add('gone'), 250);
}
window.__pres = { state, next, prev, goSlide: (a, b) => goSlide(a, b, 1), SLIDES, grab: n => { grabName = n; }, step: (n = 1, ms = 16.7) => { frame.ext = true; for (let i = 0; i < n; i++) frame(last + ms); frame.ext = false; } };
boot();
