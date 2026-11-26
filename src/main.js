// Presentation engine: one 16:9 stage, slides made of "beats", → advances a beat, ← goes back.
import { THREE, W, H, clock, U, initRenderer, resize, renderer, composer, renderPass, bloom, quality, applyBeat, h, warmScene } from './core.js';
import { SLIDES, CHAPTERS, SUBPOINTS, subpointAt } from './slides/index.js';
import { NOTES } from './notes.js';
import { Presenter } from './presenter.js';
import { applyTheme, CHAPTER_LOOK, CHAPTER_ACCENT } from './theme.js';
import { prepareLayer, tick as textTick } from './type.js';
import { prepareLOD, setLOD } from './lod.js';
import { Bridge } from './bridge.js';

import { StageTools } from './stage_tools.js';

applyTheme();

const stage = document.getElementById('stage');
const glc = document.getElementById('gl');
const layers = document.getElementById('layers');
const chromeEl = document.getElementById('chrome');
let scale = 1, pr = 1;

const state = { si: 0, bi: 0, swap: null, t0: null };
let cur = null, bridge = null, staticImage = null;

function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  if (staticImage) return;
  pr = resize(scale); setLOD(quality.level);
  if (bridge) bridge.setSize(pr);
  if (cur) bloom.enabled=!!quality.level&&usesBloom(cur);
}

// ---------------------------------------------------------------- chapters bar
// the name sits above its segment (outside the 3 px bar, which clips only the fill)
const chapEls = CHAPTERS.map(name => {
  const e = h(`<div class="wrap"><span class="lbl"></span><div class="ch"><i></i></div></div>`);
  const lbl = e.querySelector('.lbl'); lbl.textContent = name; lbl.dataset.n = String(CHAPTERS.indexOf(name) + 1).padStart(2, '0');
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

// ---------------------------------------------------------------- sub-points (eyebrow: script part · document section + label · dots)
// The number is the section of the written work (2, 3 … 7.1, 9.1), so it can repeat or jump: the dots go by position.
function addSubpoints(s) {
  const eb = s.layer.querySelector('.eyebrow'); if (!eb || !SUBPOINTS[s.id] || s.chapter < 0) return;
  eb.innerHTML = `<b>${s.chapter + 1}</b>${CHAPTERS[s.chapter]}`;
  s.subAll = SLIDES.filter(x => x.chapter === s.chapter).flatMap(x => SUBPOINTS[x.id] || []);
  const sp = h(`<span class="subpt"><span class="sn"></span><span class="st"></span><span class="sd">${s.subAll.map(() => '<i></i>').join('')}</span></span>`);
  eb.appendChild(sp); s.subEl = sp;
}
function updateSubpoint() {
  const s = SLIDES[state.si], sp = s?.subEl; if (!sp) return;
  const p = subpointAt(s.id, state.bi); if (!p) return;
  const k = String(s.subAll.indexOf(p));
  if (sp.dataset.k === k) return;
  const first = !sp.dataset.k; sp.dataset.k = k;
  const write = () => { sp.querySelector('.sn').textContent = p[0]; sp.querySelector('.st').textContent = p[1];
    sp.querySelectorAll('.sd i').forEach((i, j) => { i.classList.toggle('on', j === +k); i.classList.toggle('done', j < +k); }); };
  write(); if (first) return;
  const a = sp.classList.contains('swapA'); sp.classList.toggle('swapA', !a); sp.classList.toggle('swapB', a);  // restart without a layout read
}

// ---------------------------------------------------------------- navigation
function setBeat(b, dir) {
  bridge?.clearQuestion();
  stageTools.clearGesture();stageTools.ink.replaceChildren();
  if (!cur) return;
  state.bi = b;
  if (staticImage) { showStill(); afterChange(); return; }
  applyBeat(cur.layer, b);
  cur.beat && cur.beat(b, dir);
  afterChange();
}
function goSlide(si, bi, dir) {
  si = Math.max(0, Math.min(SLIDES.length - 1, si));
  bi = Math.max(0,Math.min(SLIDES[si].beats-1,bi));
  if (staticImage) { state.si=si; cur=SLIDES[si]; setBeat(bi,dir); return; }
  state.swap = { si, bi, dir };
}
function doSwap() {
  bridge?.clearQuestion();
  const { si, bi, dir } = state.swap; state.swap = null;
  stageTools.clearGesture();stageTools.ink.replaceChildren();
  if (bridge?.active) bridge.finish(false);
  const from = cur, fromIdx = state.si;
  if (from) { from.layer.classList.remove('cur'); from.layer.classList.add('out'); }
  cur = SLIDES[si]; state.si = si; state.bi = bi;
  cur.layer.style.visibility=''; cur.layer.classList.remove('out'); cur.layer.classList.add('cur');
  applyBeat(cur.layer, -1, true);
  stage.style.setProperty('--acc', CHAPTER_ACCENT[Math.max(0, cur.chapter)]);
  cur.enter && cur.enter(bi, dir);
  const s0 = cur;
  // the text of the new slide is revealed when the bridge settles (or after the first frame without a bridge),
  // with whatever beat the presenter is on by then
  const reveal = () => { if (cur === s0 && !state.swap) applyBeat(cur.layer, state.bi); };
  if (from && from !== cur) {
    // forward to the next slide: that slide pair's bridge (+ a chapter card when a new chapter starts); otherwise a quick crossfade
    const forward = dir > 0 && si === fromIdx + 1;
    // (not out of the cover: its dive into the plasma carries straight on into slide 2)
    const chapter = forward && from.chapter >= 0 && cur.chapter !== from.chapter ? cur.chapter : -1;
    bridge.start(from, cur, { forward, chapter, onReveal: reveal }, clock.t);
  } else if (from) from.exit && from.exit();
  // re-apply the beat after the first frame, but only if the presenter has not moved on in the meantime
  requestAnimationFrame(() => { if (cur !== s0 || state.swap || state.bi !== bi) return; if (!bridge.active) applyBeat(cur.layer, bi); cur.beat && cur.beat(bi, 0); });
  bloom.strength = bloomFor(cur); bloom.enabled=!!quality.level && usesBloom(cur);
  afterChange();
}
// slides still carry their night-theme bloom values (.45-.8); on a light background only real HDR highlights
// should bloom, so map them into a narrow, gentle range
function usesBloom(s){return ['title','measure','marker','electro'].includes(s.id);}
function bloomFor(s) { return s.id === 'electro' ? .3 : Math.min(.18,Math.max(.10,(s.bloom ?? .5)*.26)); }
function next() {
  if (state.t0 == null) state.t0 = performance.now();
  if (bridge?.active) bridge.finish(state.si === SLIDES.length - 1 && state.bi === SLIDES[state.si].beats - 1);
  const s = state.swap ? SLIDES[state.swap.si] : SLIDES[state.si];
  const b = state.swap ? state.swap.bi : state.bi;
  const si = state.swap ? state.swap.si : state.si;
  if (state.swap) { if (b < s.beats - 1) state.swap.bi++; else goSlide(si + 1, 0, 1); return; }
  if (b < s.beats - 1) setBeat(b + 1, 1); else if (si < SLIDES.length - 1) goSlide(si + 1, 0, 1);
}
function prev() {
  if (state.swap) return;
  if (bridge?.active) bridge.finish(false);
  if (state.bi > 0) setBeat(state.bi - 1, -1); else if (state.si > 0) goSlide(state.si - 1, SLIDES[state.si - 1].beats - 1, -1);
}
function afterChange() {
  updateChrome(); updateSubpoint();
  stage.classList.toggle('can-sample',Boolean(stageTools.getPlot()));
  // the URL write can make the host re-style the page: do it once things are calm, never mid-bridge
  const previous = location.hash, target = `#${state.si + 1}.${state.bi + 1}`;
  clearTimeout(urlT);
  urlT = setTimeout(() => { if (location.hash === previous && target !== previous) history.replaceState(null,'',target); }, staticImage ? 0 : 1800);
  presenter.update(state);
}
let urlT;

// ---------------------------------------------------------------- input
let digits = '';
const jump = document.body.appendChild(h('<div id="jump"></div>'));
function handleKey(e) {
  const k = e.key, letter = k.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&letter==='z'&&stageTools.mode==='d'){
    e.preventDefault();stageTools.clearGesture();stageTools.ink.lastElementChild?.remove();return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (letter==='o') { e.preventDefault(); if(!e.repeat)stageTools.showMap(); return; }
  if (stageTools.map.open) {
    if(k==='Escape'){e.preventDefault();stageTools.map.close();}
    return;
  }
  if(e.shiftKey && (k==='ArrowLeft' || k==='ArrowRight')){
    e.preventDefault();stageTools.nudge(k==='ArrowRight'?1:-1);return;
  }
  if (letter==='l'||letter==='s'||letter==='c'||letter==='d') {
    e.preventDefault();
    if(!e.repeat){
      if(letter==='c'){document.body.classList.toggle('projector'); U.projector.value=Number(document.body.classList.contains('projector'));}
      else stageTools.toggle(letter);
      presenter.syncTools();
    }
    return;
  }
  if(k==='Escape'){stageTools.clearGesture();stageTools.ink.replaceChildren();stageTools.toggle('');presenter.syncTools();}
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
  if (lk === 'g') stage.classList.toggle('grid');
  if (lk === 'r') presenter.toggleRehearsal();
  if (lk === 'q' && !staticImage) { manualQuality = true; setQuality(1-quality.level,false); } // bloom is subtle in daylight: drop it on slow machines
}
addEventListener('keydown', handleKey);
addEventListener('resize', fit);
stage.addEventListener('click', () => next());
addEventListener('contextmenu', e => { if(!stageTools.map.open){e.preventDefault();prev();} });
let idle; addEventListener('mousemove', () => { document.body.classList.remove('hidecursor'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('hidecursor'), 1800); });

const stageTools = new StageTools(stage,SLIDES,CHAPTERS,()=>state,goSlide,()=>{
  if(staticImage || !cur?.ch) return null;
  if(cur.id === "kinetics" && (state.bi===0 || state.bi===6))return null;
  if(cur.id === "infarct" && state.bi < 2) return null;
  return ["kinetics","pancreas","infarct"].includes(cur.id)?cur.ch:null;
},()=>Boolean(bridge?.active||state.swap),()=>{
  if(staticImage || !cur?.rig)return null;
  const inspectable=cur.id==='tissues'||(['ck','ldh'].includes(cur.id)&&state.bi===0)||(cur.id==='infarct'&&state.bi<2);
  return inspectable?cur.rig:null;
});
const presenter = new Presenter({ subpointAt, stageTools, slides: SLIDES, notes: NOTES, chapters: CHAPTERS, onKey: handleKey, getState: () => state });

// ---------------------------------------------------------------- main loop
let last = performance.now(); let grabName = null;
let renderedBridge=false;
let manualQuality=false, intervalCount=0, intervalSum=0, slowMs=0;
function setQuality(level,automatic) {
  quality.level=level; state.autoQ=automatic; fit(); if(cur)bloom.enabled=!!level&&usesBloom(cur); presenter.update(state);
}
function monitorQuality(ms) {
  if (manualQuality || !quality.level || document.hidden || ms<=0 || ms>1000) { intervalSum=intervalCount=slowMs=0; return; }
  intervalCount++; intervalSum+=ms;
  if (intervalCount<60) return;
  slowMs=intervalSum/intervalCount>20 ? slowMs+intervalSum : 0;
  intervalSum=intervalCount=0;
  if (slowMs>=2000) setQuality(0,true);
}
function frame(now,draw=true) {
  if (!frame.ext) requestAnimationFrame(frame);
  renderer.info.reset();
  if (!frame.ext && cur) monitorQuality(now-last);
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
  clock.dt = dt; clock.t += dt; U.time.value = clock.t;
  textTick();
  if (!cur) { if (state.swap) doSwap(); return; }
  bridge.updateQuestion(clock.t);
  renderedBridge=!!bridge.active;
  if (renderedBridge) {
    bridge.frame(dt, clock.t, draw);
  } else {
    cur.update && cur.update(dt, clock.t);
    const cam = cur.camera;
    U.pxScale.value = (H * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    renderPass.scene = cur.scene; renderPass.camera = cam;
    if (draw) { composer.render(dt); if (cur.post) cur.post(dt, clock.t); }
  }
  if (grabName) { const n = grabName; grabName = null; fetch('/' + n, { method: 'POST', body: glc.toDataURL('image/jpeg', .9) }); }
  if (state.swap) doSwap();
}

// ---------------------------------------------------------------- boot
function showStill() {
  staticImage.src = 'fallback/'+(state.si+1)+'.'+(state.bi+1)+'.jpg';
  staticImage.alt = cur.title;
}
function readAddress() {
  const m=/^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
  const si=Math.max(0,Math.min(SLIDES.length-1,m ? +m[1]-1 : 0));
  return [si,Math.max(0,Math.min(SLIDES[si].beats-1,m ? +(m[2]||1)-1 : 0))];
}
function startFallback() {
  staticImage = document.createElement('img');
  staticImage.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';
  glc.replaceWith(staticImage); chromeEl.style.display='none'; fit();
  const follow=()=>goSlide(...readAddress(),1);
  follow(); addEventListener('hashchange',follow);
  document.getElementById('loading').classList.add('gone');
}
let shadowTarget;
function lightStage(s) {
  const S=s.S; if (!S) return;
  if (s.chapter>=0) { S.backdrop.material.uniforms.cg.value.set(CHAPTER_LOOK[s.chapter]); S.rim.color.lerp(new THREE.Color(CHAPTER_LOOK[s.chapter]),.45); }
  const y={title:-2.45,tissues:-1.89,intensity:-1.63,pancreas:-1.94,infarct:-1.95,end:-2.09,electro:-2.1}[s.id];
  if (y===undefined) return;
  const key=S.key; key.castShadow=true; key.shadow.mapSize.set(1024,1024); key.shadow.bias=-.0006; key.shadow.normalBias=.013;
  Object.assign(key.shadow.camera,{left:-7,right:7,top:5,bottom:-5,near:.4,far:24}); key.shadow.camera.updateProjectionMatrix();
  shadowTarget ??= new THREE.WebGLRenderTarget(1024,1024,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  key.shadow.map=shadowTarget;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(24,18),new THREE.ShadowMaterial({color:'#2a3550',opacity:.16,depthWrite:false}));
  floor.rotation.x=-Math.PI/2; floor.position.y=y; floor.receiveShadow=true; S.scene.add(floor);
}
async function boot() {
  if (!glc.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'})) { startFallback(); return; }
  try { initRenderer(glc); } catch { startFallback(); return; }
  glc.addEventListener('webglcontextlost',e=>{
    e.preventDefault(); history.replaceState(null,'',`#${state.si+1}.${state.bi+1}`); location.reload();
  });
  bridge = new Bridge(stage); fit();
  const bar = document.getElementById('loadBar'), prof = { t0: performance.now() };
  const progress = async f => { bar.style.transform = `scaleX(${f})`; await new Promise(r => setTimeout(r, 0)); };
  for (let i = 0; i < SLIDES.length; i++) {
    const s = SLIDES[i];
    s.layer = h(`<div class="layer" data-slide="${s.id}"></div>`); layers.appendChild(s.layer);
    const tb = performance.now(); s.build(s.layer); lightStage(s); addSubpoints(s); (prof.build || (prof.build = [])).push(Math.round(performance.now() - tb));
    s.layer.querySelectorAll('[data-b]').forEach(e => { if (!e.classList.contains('fx') && !e.classList.contains('draw') && !e.classList.contains('dim') && !e.classList.contains('lab')) e.classList.add('fx'); });
    await progress((i + 1) / SLIDES.length * .45);
  }
  // the bundled fonts must be in before the text is split into lines (and before anything is seen)
  await Promise.race([Promise.all(['400 66px Newsreader', 'italic 400 66px Newsreader', '400 30px Inter', '600 30px Inter', '700 30px Inter', '500 22px "JetBrains Mono"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
  for (const s of SLIDES) { s.layer.style.visibility = 'hidden'; prepareLayer(s.layer); s.layer.style.visibility = ''; }
  prof.built = performance.now();
  // warm-up, so nothing compiles or uploads mid-talk: first issue every program of every slide (every object, hidden
  // or not; the driver links them in parallel), then draw each slide once (waits for its programs, uploads buffers)
  const warmList = SLIDES.flatMap(s => [[s.scene, s.camera], ...(s.warmExtra || [])]);
  for (const [sc] of warmList) prepareLOD(sc); setLOD(1);
  for (const [sc, cam] of warmList) warmScene(sc, cam, true);
  prof.issued = performance.now();
  prof.draw = [];
  for (let i = 0; i < warmList.length; i++) { const t = performance.now(); warmScene(warmList[i][0], warmList[i][1]); prof.draw.push(Math.round(performance.now() - t)); await progress(.45 + (i + 1) / warmList.length * .55); }
  prof.warmed = performance.now();
  // Issue the unshadowed and postprocessing variants before releasing the loader.
  renderer.shadowMap.enabled=false;
  for (const [scene,cam] of warmList) warmScene(scene,cam,true);
  renderer.shadowMap.enabled=true;
  renderPass.scene=SLIDES[0].scene; renderPass.camera=SLIDES[0].camera;
  composer.render(0); quality.level=0; fit(); composer.render(0);
  for(const [scene,cam] of warmList) warmScene(scene,cam);
  quality.level=1; fit(); bridge.warm();
  // also draw every scene once through the bridge's own target (the outgoing half of a transition), in both
  // qualities, so the first real transition out of each slide does no first-use GPU work mid-talk
  for (const lv of [0, 1]) { quality.level = lv; fit(); for (const s of SLIDES) bridge.warmOutgoing(s); }
  quality.level = 1; fit();
  for (const s of SLIDES) s.afterLayout?.();
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
window.__pres = { state, get quality(){return quality.level;}, get renderInfo(){return renderer?.info.render;}, get renderedBridge(){return renderedBridge;}, next, prev, goSlide: (a, b) => goSlide(a, b, 1), SLIDES, get bridge() { return !!(bridge && bridge.active); }, grab: n => { grabName = n; }, step: (n = 1, ms = 16.7, lastFrameOnly=false) => { if (staticImage) return; frame.ext = true; try { for (let i=0;i<n;i++) frame(last+ms,!lastFrameOnly||i===n-1); } finally { frame.ext=false; last=performance.now(); } } };
boot();
