// Core: renderer + post-processing, clock, tweens, DOM helpers, 3D-anchored labels.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { PAL, INK } from './theme.js';

// Light theme: Khronos "PBR Neutral" starts compressing at .76, which turns a near-white background into a dull grey.
// Start the shoulder later and use a smaller black offset so #FBF9F5-ish backgrounds stay crisp (no extra pass, same cost).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment
  .replace('const float StartCompression = 0.8 - 0.04;', 'const float StartCompression = 0.92;')
  .replace('float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;', 'float offset = x < 0.04 ? x - 12.5 * x * x : 0.02;')
  .replace('const float Desaturation = 0.15;', 'const float Desaturation = 0.1;');

export const W = 1920, H = 1080;
export const clock = { t: 0, dt: 0 };
export const U = { pxScale: { value: 500 }, time: { value: 0 } }; // shared shader uniforms

// ---------------------------------------------------------------- renderer
export let renderer, composer, renderPass, bloom, envTex;
export const quality = { level: 1 }; // 1 = full, 0 = light
export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(new THREE.Color(PAL.bg1), 1);
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  // threshold 1.0: only true HDR highlights bloom (the light background peaks just below it)
  bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.4, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}
export function resize(scale) {
  const dpr = window.devicePixelRatio || 1;
  let pr = scale * dpr;
  const cap = quality.level ? 2600 : 1600;           // never draw wider than this many pixels
  if (W * pr > cap) pr = cap / W;
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
  return pr;
}

// ---------------------------------------------------------------- math / easing
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const ease = {
  io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  lin: t => t,
  back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// a value that eases from where it is to a new target over a duration (works in both directions)
export class Tw {
  constructor(v = 0) { this.a = v; this.b = v; this.t0 = -1; this.d = 1; this.e = ease.io; }
  to(b, d = 1, e = ease.io, delay = 0) {
    const cur = this.v; if (b === this.b && this.t0 >= 0) return this;
    this.a = cur; this.b = b; this.t0 = clock.t + delay; this.d = Math.max(1e-3, d); this.e = e; return this;
  }
  set(v) { this.a = this.b = v; this.t0 = -1; return this; }
  get v() { if (this.t0 < 0) return this.b; const k = clamp((clock.t - this.t0) / this.d); return lerp(this.a, this.b, this.e(k)); }
  get done() { return this.t0 < 0 || clock.t >= this.t0 + this.d; }
}

// ---------------------------------------------------------------- DOM helpers
export function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
export function add(layer, html, style = {}) { const e = h(html); Object.assign(e.style, style); layer.appendChild(e); return e; }
// parse data-b ranges: "2" -> [2, inf), "2-4" -> [2,4], "-3" -> [0,3], "2,5" -> {2,5}
export function inRange(spec, b) {
  return String(spec).split(',').some(part => {
    part = part.trim();
    if (part.includes('-')) { const [a, c] = part.split('-'); return b >= (a === '' ? 0 : +a) && b <= (c === '' ? 1e9 : +c); }
    if (part.endsWith('=')) return b === +part.slice(0, -1);
    return b >= +part;
  });
}
export function applyBeat(layer, b) {
  layer.querySelectorAll('[data-b]').forEach(e => e.classList.toggle('on', inRange(e.dataset.b, b)));
}

// ---------------------------------------------------------------- 3D-anchored labels
const _v = new THREE.Vector3();
export class Label {
  constructor(layer, html, { color = INK, side = 'up', anchor = null, obj = null, b = null } = {}) {
    this.el = h(`<div class="lab ${side === 'up' ? '' : side}" style="color:${color}"><div class="stem"></div><div class="dot"></div><div class="t">${html}</div></div>`);
    if (b != null) { this.el.dataset.b = b; this.el.classList.add('fxl'); }
    this.el.style.opacity = 0; // hidden until the first update() has placed it
    layer.appendChild(this.el);
    this.anchor = anchor ? anchor.clone() : new THREE.Vector3(); this.obj = obj; this.vis = 1;
  }
  update(cam) {
    _v.copy(this.anchor); if (this.obj) this.obj.localToWorld(_v);
    _v.project(cam);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    this.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    const beatOn = !this.el.dataset.b || this.el.classList.contains('on');
    this.el.style.opacity = (_v.z < 1 && beatOn) ? this.vis : 0;
  }
}
export function screenOf(v3, cam, obj) { _v.copy(v3); if (obj) obj.localToWorld(_v); _v.project(cam); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H }; }

export { THREE };
