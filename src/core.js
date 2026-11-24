// Core: renderer + post-processing, clock, tweens, DOM helpers, 3D-anchored labels.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from '../vendor/three/addons/shaders/FXAAShader.js';
import { finishNoise, finishShader } from './finish.js';
import { PAL, INK } from './theme.js';
import { beatChange } from './type.js';

// Light theme: Khronos "PBR Neutral" starts compressing at .76, which turns a near-white background into a dull grey.
// Start the shoulder later and use a smaller black offset so #FBF9F5-ish backgrounds stay crisp (no extra pass, same cost).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment
  .replace('const float StartCompression = 0.8 - 0.04;', 'const float StartCompression = 0.92;')
  .replace('float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;', 'float offset = x < 0.04 ? x - 12.5 * x * x : 0.02;')
  .replace('const float Desaturation = 0.15;', 'const float Desaturation = 0.1;');

export const W = 1920, H = 1080;
export const clock = { t: 0, dt: 0 };
export const U = { projector: {value:0}, pxScale: { value: 500 }, time: { value: 0 } }; // shared shader uniforms

// ---------------------------------------------------------------- renderer
export let renderer, composer, renderPass, bloom, outputPass, envTex, fxaa;
export const quality = { level: 1 }; // 1 = full, 0 = light
export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(new THREE.Color(PAL.bg1), 1);
  renderer.info.autoReset=false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  composer = new EffectComposer(renderer,new THREE.WebGLRenderTarget(4,4,{
    type: THREE.HalfFloatType, samples: Math.min(renderer.capabilities.maxSamples,4)
  }));
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  // threshold 1.0: only true HDR highlights bloom (the light background peaks just below it)
  bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .14, .6, 1.0);
  const resizeBloom=bloom.setSize.bind(bloom); bloom.setSize=(w,h)=>resizeBloom(w*.5,h*.5);
  composer.addPass(bloom);
  fxaa = new ShaderPass(FXAAShader); fxaa.enabled = false; composer.addPass(fxaa);
  outputPass = new OutputPass();
  outputPass.uniforms.finishTime = U.time;
  outputPass.uniforms.finishNoise = finishNoise;
  outputPass.material.fragmentShader = finishShader(outputPass.material.fragmentShader);
  outputPass.needsSwap=false;
  composer.addPass(outputPass);
  const pm = new THREE.PMREMGenerator(renderer);
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(.42,.45,.5);
  const softbox = (w,h,x,y,z,color,k) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({ color:new THREE.Color(color).multiplyScalar(k), side:THREE.DoubleSide }));
    panel.position.set(x,y,z); panel.lookAt(0,0,0); studio.add(panel);
  };
  softbox(9,6,0,5,1,'#fff4de',4); softbox(2,9,-5,1,3,'#cadfff',3);
  softbox(1.1,7,4,0,1,'#ffffff',2);
  envTex = pm.fromScene(studio,.035).texture;
  studio.children.forEach(p=>{p.geometry.dispose(); p.material.dispose();});
  pm.dispose();
}
// Shader / buffer warm-up. Everything the talk draws goes through a HalfFloat render target (the composer, the bridge
// targets, the loupe), and three.js keys programs on the target (no tone mapping, linear output), so a plain
// renderer.compile() aimed at the canvas warms the wrong variants. Here every mesh is forced visible and unculled and
// drawn once into a tiny HalfFloat target: programs are linked, geometry and textures uploaded. Lights keep their real
// on/off state (the light count is part of the program key).
let warmRT = null;
// compileOnly: just issue the programs (with KHR_parallel_shader_compile the driver links them in the background, so
// issuing every slide first and drawing afterwards overlaps the work); otherwise draw once, which also uploads buffers.
export function warmScene(scene, cam, compileOnly = false) {
  if (!warmRT) warmRT = new THREE.WebGLRenderTarget(64, 36, { type: THREE.HalfFloatType });
  const samples = quality.level ? Math.min(4,renderer.capabilities.maxSamples) : 0;
  if(warmRT.samples!==samples){warmRT.dispose();warmRT.samples=samples;}
  const lit = new Set(); scene.traverseVisible(o => { if (o.isLight) lit.add(o); });
  const saved = [];
  scene.traverse(o => {
    saved.push(o, o.visible, o.frustumCulled);
    if (o.isLight) o.visible = lit.has(o); else { o.visible = true; o.frustumCulled = false; }
  });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(warmRT);
  if (compileOnly) renderer.compile(scene,cam); else renderer.render(scene,cam);
  renderer.setRenderTarget(prev);
  for (let i = 0; i < saved.length; i += 3) { saved[i].visible = saved[i + 1]; saved[i].frustumCulled = saved[i + 2]; }
}
export function resize(scale) {
  const dpr = window.devicePixelRatio || 1;
  let pr = scale * dpr * (quality.level ? .86 : .78);
  const cap = quality.level ? 2200 : 1600;           // never draw wider than this many pixels
  if (W * pr > cap) pr = cap / W;
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  const samples = quality.level ? Math.min(renderer.capabilities.maxSamples,4) : 0;
  for (const target of [composer.readBuffer,composer.writeBuffer]) {
    const required=target===composer.readBuffer?samples:0;
    if(target.samples!==required){target.dispose();target.samples=required;}
  }
  fxaa.enabled = !quality.level; bloom.enabled = !!quality.level;
  renderer.shadowMap.enabled = !!quality.level;
  fxaa.uniforms.resolution.value.set(1/Math.max(1,Math.floor(W*pr)),1/Math.max(1,Math.floor(H*pr)));
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
  outQuint: t => 1 - (1-t)**5,
  spring: t => t === 1 ? 1 : 1 - Math.exp(-5.58*t)*(Math.cos(7.06*t)+.79*Math.sin(7.06*t)),
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
// toggles .on; the text director (type.js) animates whatever changed. instant: snap (slide entry, jumps)
const _changes = [];
export function applyBeat(layer, b, instant = false) {
  _changes.length = 0;
  layer.querySelectorAll('[data-b]').forEach(e => {
    const on = inRange(e.dataset.b, b);
    if (e.classList.contains('on') !== on) { e.classList.toggle('on', on); if (e._td) _changes.push([e, on]); }
  });
  if (_changes.length) beatChange(_changes, instant);
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
  // labels arrive ~120 ms after their object and settle in 0.4 s (clock-driven), and leave in 0.2 s
  update(cam) {
    const beatOn = !this.el.dataset.b || this.el.classList.contains('on');
    const want = beatOn && this.vis > 0;
    if (want !== this.want) { this.want = want; this.tw = clock.t + (want ? .12 : 0); }
    const f0 = this.f || 0;
    if (clock.t >= this.tw) this.f = want ? Math.min(1, f0 + clock.dt / .4) : Math.max(0, f0 - clock.dt / .2);
    if (!this.f) { if (this.el.style.opacity !== '0') this.el.style.opacity = '0'; return; }
    _v.copy(this.anchor); if (this.obj) this.obj.localToWorld(_v);
    _v.project(cam);
    const e = 1 - (1 - this.f) ** 4;
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H + (1 - e) * 10;
    this.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    if (this.vis > 0) this.vl = this.vis; // while fading out after vis reached 0, keep the last visible level (no flash)
    this.el.style.opacity = _v.z < 1 ? ((this.vl ?? 1) * e).toFixed(3) : 0;
  }
}
export function screenOf(v3, cam, obj) { _v.copy(v3); if (obj) obj.localToWorld(_v); _v.project(cam); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H }; }

export { THREE };
