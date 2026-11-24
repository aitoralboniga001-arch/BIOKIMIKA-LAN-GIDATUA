// 7 · Acute pancreatitis: amylase and lipase are two balance models (sim.js) fed by the same injured pancreas.
// Amylase is removed from the plasma faster; lipase stays in the blood longer. The pancreas releases particle streams into
// two sample tubes, the tubes lose them again at each enzyme's rate, and a late sample shows amylase back in range while lipase is still high.
import { organMat } from '../optics.js';
import { THREE, Tw, add, ease, clamp, rng, Label } from '../core.js';
import { makeScene, C, COL3, contactShadow, halo } from '../lib3d.js';
import { PAL, INK, MUTE, PAPER, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { Chart, el } from '../chart.js';
import { balanceModel } from '../sim.js';
import { tubeMeter, Flow } from './s06_kinetics.js';
import { pancreasParts } from './s07_pancreas_organ.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

// same release pulse (one injury), different removal: qualitative only
const PULSE = { onset: .03, tRise: .07, shape: 2.2 };
const AM = balanceModel({ peak: .86, k: 10, ...PULSE }), LM = balanceModel({ peak: .68, k: 2.6, ...PULSE });
const REF = .18, T_LATE = .62;
const rmax = m => { let r = 0; for (let i = 0; i <= 200; i++) r = Math.max(r, m.rel(i / 200), m.elim(i / 200)); return r; };
const RA = rmax(AM), RL = rmax(LM);
const backIn = m => { for (let i = Math.round(m.tPeak * 400); i <= 400; i++) if (m.A(i / 400) < REF) return i / 400; return 1; };
const W0 = backIn(AM), W1 = backIn(LM);          // window where amylase is back in range and lipase is still high
const TA = -4.02, TL = -2.32, TY = -1.925, TS = .44; // sample tubes: x, floor, scale (left column, below the organ)
const PG = V(-3.02, .93, 0), PS = 1.24;            // pancreas group position / scale

export default {
  id: 'pancreas', chapter: 2, beats: 3, title: 'Pankreatitis akutua: amilasa eta lipasa', bloom: .5,
  bridgeIn: { focus() { return this.pg.getWorldPosition(_bf); } },                     // ... into the pancreas
  bridge: { mode: 'cells', focus() { return this.pg.getWorldPosition(_bf); } },
  build(layer) {
    const S = makeScene({ glow: '#F2FAF7', gx: .2, gy: .5 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 34, drift: .03 });
    this.ta = tubeMeter(this.scene, { x: TA, y: TY, s: TS, color: COL3.amber, seed: 7 });
    this.tl = tubeMeter(this.scene, { x: TL, y: TY, s: TS, color: COL3.teal, seed: 8 });
    for (const x of [TA, TL]) { const sh = contactShadow({ size: 1, opacity: .18 }); sh.scale.set(1, .5, 1); sh.position.set(x, TY - .02, 0); this.scene.add(sh); }
    // pancreas: lobulated head in the duodenal C-loop, body and tapering tail, main duct in a front cut-away.
    // It reddens and swells a little while the lesion releases its enzymes.
    const pp = pancreasParts();
    const g = new THREE.Group(); g.position.copy(PG); g.scale.setScalar(PS); this.scene.add(g); this.pg = g;
    this.pMat = organMat({ color: C('#EFC59A'), roughness: .5, clearcoat: .4, clearcoatRoughness: .35, sheen: .5, sheenRoughness: .5, sheenColor: C('#fff0dc'), emissive: C(COL3.coral), emissiveIntensity: 0, envMapIntensity: .75 });
    const tissue=new THREE.Mesh(pp.geo,this.pMat); tissue.castShadow=true; g.add(tissue);
    this.inflammation={value:0};
    const shade=this.pMat.onBeforeCompile;
    this.pMat.onBeforeCompile=s=>{
      shade(s); s.uniforms.uInflammation=this.inflammation;
      s.fragmentShader='uniform float uInflammation;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float front=1.-smoothstep(-1.4+3.6*uInflammation,-1.+3.6*uInflammation,tissueP.x);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.68,.12,.075),front*uInflammation*.65);`);
    };
    g.add(new THREE.Mesh(pp.duct, new THREE.MeshPhysicalMaterial({ color: C('#CDB850'), roughness: .3, clearcoat: .8, envMapIntensity: .8 })));
    g.add(new THREE.Mesh(pp.duo, new THREE.MeshPhysicalMaterial({ color: C('#E6B0AE'), roughness: .45, clearcoat: .5, sheen: .4, sheenColor: C('#ffd8d0'), envMapIntensity: .7 })));
    this.pHalo = halo(COL3.coral, 3.2, 0); this.pHalo.position.set(PG.x - .1, PG.y, -.4); this.pHalo.scale.set(3.4, 1.8, 1); this.scene.add(this.pHalo);
    const psh = contactShadow({ size: 1, opacity: .1 }); psh.scale.set(2.6, .5, 1); psh.position.set(PG.x, PG.y - .62, -.3); this.scene.add(psh);
    // release points on the front surface (world space)
    g.updateMatrixWorld(true);
    const pa = pp.geo.attributes.position, na = pp.geo.attributes.normal, R = rng(17); this.lobPts = [];
    for (let i = 0; i < 4000 && this.lobPts.length < 160; i++) { const k = Math.floor(R() * pa.count); if (na.getZ(k) > .35) this.lobPts.push(g.localToWorld(V(pa.getX(k), pa.getY(k), pa.getZ(k)))); }
    const N = this.lobPts.length;
    // flows: pancreas → each tube (arrival) and each tube → out (removal), each on its own enzyme's rate
    this.flow = new Flow(this.scene, 200, .11);
    const pl = this.ta.tube.plasma, pB = TY + (pl.y0 + .1) * TS, pT = TY + (pl.y1 - .05) * TS;
    const fromPanc = (o, rr) => { const p = this.lobPts[Math.floor(rr() * N)]; o.set(p.x, p.y, p.z + .05); };
    const inTube = x => (o, rr) => o.set(x + (rr() - .5) * .25, pB + rr() * (pT - pB), .05);
    this.sAin = this.flow.stream({ color: COL3.amber, life: 1.1, from: fromPanc, ctrl: V(TA + .1, 0, .3), to: inTube(TA) });
    this.sLin = this.flow.stream({ color: COL3.teal, life: 1.1, from: fromPanc, ctrl: V(TL - .1, 0, .3), to: inTube(TL) });
    this.sAout = this.flow.stream({ color: COL3.amber, life: 1.2, out: true, from: inTube(TA), ctrl: V(TA - .45, -.75, .2), to: (o, rr) => o.set(TA - .62, -1.35 + rr() * .4, .2) });
    this.sLout = this.flow.stream({ color: COL3.teal, life: 1.2, out: true, from: inTube(TL), ctrl: V(TL + .42, -.75, .2), to: (o, rr) => o.set(TL + .55, -1.35 + rr() * .4, .2) });
    this.onA = new Tw(0); this.onL = new Tw(0);

    add(layer, `<div class="eyebrow"><b>3</b>Agerpena eta iraupena</div>`);
    add(layer, `<div class="h1">Pankreatitis akutua: <em style="color:var(--amber)">amilasa</em> eta <em style="color:var(--teal)">lipasa</em></div>`);
    this.labs = [new Label(layer, 'Pankrea', { color: PAL.amber, anchor: V(PG.x + .17 * PS, PG.y + .23 * PS, .1), side: 'up' }),
      new Label(layer, 'Duodenoa', { color: MUTE, anchor: V(PG.x - .45 * PS, PG.y - .56 * PS, .1), side: 'r' })];
    for (const l of this.labs) l.el.classList.add('bg');
    this.ch = new Chart(layer, { x: 760, y: 270, w: 1040, h: 470, ref: REF, xLabel: 'Sintomak hasi ondorengo denbora', yLabel: 'Jarduera erlatiboa' });
    this.a = this.ch.curve(AM.A, { color: PAL.amber, width: 6, name: 'Amilasa', nameAt: .2, nameDy: -26 });
    this.l = this.ch.curve(LM.A, { color: PAL.teal, width: 6, dash: '16 12', name: 'Lipasa', nameAt: .38, nameDy: -28 });
    // the late-sample window, computed from the two models
    const wg = el('g', { 'data-b': '2' }, this.ch.phases);
    el('rect', { x: this.ch.X(W0), y: 0, width: this.ch.X(W1) - this.ch.X(W0), height: this.ch.h, fill: alpha(PAL.teal, .08) }, wg);
    const wt = el('text', { x: this.ch.X((W0 + W1) / 2), y: 32, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, style: `fill:${PAL.teal}` }, wg); wt.textContent = 'amilasa tartean · lipasa altu';
    this.ringG = el('g', { opacity: 0 }, this.ch.marksG);
    this.rings = [PAL.amber, PAL.teal].map(c => el('circle', { r: 12, fill: 'none', stroke: c, 'stroke-width': 3, class: 'snapring2' }, this.ringG));
    layer.insertAdjacentHTML('beforeend', '<style>@keyframes snapr2{0%{transform:scale(1);opacity:.9}70%,100%{transform:scale(4);opacity:0}} .snapring2{transform-box:fill-box;transform-origin:center;animation:snapr2 2.2s ease-out infinite}</style>');
    // clock
    this.clock = add(layer, `<div class="abs" style="left:1560px;top:184px;display:flex;align-items:center;gap:12px">
      <svg width="58" height="58" viewBox="-30 -30 60 60"><circle r="26" fill="${PAPER}" stroke="${alpha(INK, .5)}" stroke-width="2.5"/>
      ${[...Array(12).keys()].map(i => `<line x1="0" y1="-22" x2="0" y2="-18" stroke="${alpha(INK, .4)}" stroke-width="2" transform="rotate(${i * 30})"/>`).join('')}
      <line class="hand" x1="0" y1="3" x2="0" y2="-19" stroke="${PAL.teal}" stroke-width="3.5" stroke-linecap="round"/><circle r="3.5" fill="${INK}"/></svg>
      <div style="font:500 22px/1.25 var(--sans);color:${MUTE};text-shadow:var(--halo)">sintomak hasi<br>ondorengo denbora</div></div>`);
    this.hand = this.clock.querySelector('.hand');
    // both tubes are named in the gap between them (amylase high, on its right; lipase low, on its left), anchored in 3D
    // so the names follow the camera, never sit on the glass and never reach the chart axis
    const tubeLab = (x, y, name, c, side) => { const l = new Label(layer, `${name}<small class="st" style="font-weight:600"></small>`, { color: c, anchor: V(x, y, .15), side }); this.labs.push(l); return l.el.querySelector('.st'); };
    this.sa = tubeLab(TA + .45, TY + 1.3, 'Amilasa', PAL.amber, 'r'); this.sl = tubeLab(TL - .45, TY + .5, 'Lipasa', PAL.teal, 'l');
    this.lastS = ['', ''];
    add(layer, `<div class="key" data-b="-0" style="left:760px;top:850px;bottom:auto;font-size:36px;max-width:1080px">Amilasa: igoera <em>azkarra</em>, jaitsiera <em>azkarra</em></div>`);
    add(layer, `<div class="key" data-b="1-1" style="left:760px;top:850px;bottom:auto;font-size:36px;max-width:1080px">Lipasaren igoerak amilasarena baino <em>luzaroago</em> iraun dezake</div>`);
    add(layer, `<div class="key" data-b="2" style="left:760px;top:850px;bottom:auto;font-size:36px;max-width:1080px">Lagin berantiarra: amilasa <span style="color:var(--amber)">ohiko tartean</span>, lipasa <span style="color:var(--teal)">oraindik altu</span></div>`);
    add(layer, `<div class="note" style="left:760px;top:918px;font-size:22px">Eskema kualitatiboa, Pérez Ruiz et al. [4] oinarritua · lipasa odolean luzaroago irauten du</div>`);
    this.b = 0;
  },
  enter(b) { if(b===0)this.rig.jump(V(-2.05,.6,7.45),V(-1.78,.50,0),34); else this.rig.arrive(V(0,0,10),V(0,0,0),34); this.flow.clear(); this.apply(b, true, 1); },
  beat(b, dir) {
    // The director reapplies the current beat after entry. Keep the ongoing amylase trace.
    if (dir === 0 && b === this.b) return;
    this.apply(b, false, dir);
  },
  apply(b, inst, dir) {
    const y=b===2 ? -.29 : .11, x=b===2 ? -.38 : -.24;
    this.rig.go(V(x,y,9.65),V(x,y,0),2.2,34);
    const Ct = this.ch.curT, A = this.a.reveal, L = this.l.reveal; this.b = b;
    this.ch.sampledCurves=b>=1?2:1;
    this.onA.to(1, .5); this.onL.to(b >= 1 ? 1 : 0, inst ? .01 : .5);
    if (b === 0) {
      L.to(0, inst ? .01 : .5);
      if (inst) { A.set(0); Ct.set(0); A.to(1, 6, ease.lin, .6); Ct.to(1, 6, ease.lin, .6); }
      else { A.to(1, .01); Ct.to(1, .8, ease.io); }
    }
    if (b === 1) {
      A.to(1, .01);
      if (inst) { L.set(1); Ct.set(1); }
      else if (dir > 0) { L.set(0); Ct.set(0); L.to(1, 6.5, ease.lin); Ct.to(1, 6.5, ease.lin); this.flow.clear(); }
      else { L.to(1, .01); Ct.to(1, 1.2, ease.io); }
    }
    if (b === 2) { A.to(1, .01); L.to(1, .01); Ct.to(T_LATE, inst ? .01 : 2.2, ease.io); }
    this.ch.curOn.to(1, .5);
    this.ch.curTag.textContent = b === 2 ? 'lagin berantiarra' : 'orain';
    this.ringG.setAttribute('opacity', b === 2 ? 1 : 0);
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    this.ch.update();
    const tc = this.ch.sampleTime, oa = this.onA.v, ol = this.onL.v;
    const va = AM.A(tc), vl = ol > .5 ? LM.A(tc) : LM.params.base;
    // flows at the cursor time
    this.flow.emit(this.sAin, 20 * AM.rel(tc) / RA * oa, dt); this.flow.emit(this.sAout, 20 * AM.elim(tc) / RA * oa, dt);
    this.flow.emit(this.sLin, 20 * LM.rel(tc) / RL * ol, dt); this.flow.emit(this.sLout, 20 * LM.elim(tc) / RL * ol, dt);
    this.flow.update(dt);
    const inf = clamp((AM.rel(tc) - AM.rel(0)) / (RA - AM.rel(0)));    // the release pulse is the same for both: show it as inflammation
    this.inflammation.value=inf;
    this.pMat.emissiveIntensity = .03 + .22 * inf * (1 + .25 * Math.sin(t * 5));
    this.pg.scale.setScalar(PS * (1 + .02 * inf));
    this.pHalo.material.opacity = .35 * inf;
    for (const l of this.labs) l.update(this.camera);
    this.ta.update(t, dt, clamp(va / .92)); this.tl.update(t, dt, clamp(vl / .92));
    this.hand.setAttribute('transform', `rotate(${(tc * 720).toFixed(1)})`);
    const x = this.ch.X(tc);
    this.rings[0].setAttribute('cx', x); this.rings[0].setAttribute('cy', this.ch.Y(va));
    this.rings[1].setAttribute('cx', x); this.rings[1].setAttribute('cy', this.ch.Y(vl));
    const st = (v, on) => !on ? `<span style="color:var(--mute)">—</span>` : v > REF ? `<span style="color:var(--coral)">▲ altu</span>` : `<span style="color:var(--mute)">tartean</span>`;
    const a = st(va, true), l = st(vl, ol > .5);
    if (a !== this.lastS[0]) { this.lastS[0] = a; this.sa.innerHTML = a; }
    if (l !== this.lastS[1]) { this.lastS[1] = l; this.sl.innerHTML = l; }
  },
};
