// 1 · What the lab measures: plasma-functional vs tissue enzymes, catalytic activity (U/L), four questions.
// Beat 1: enzymes that work in plasma itself — LCAT esterifying cholesterol on an HDL particle (the core fills with esters)
//   and the clotting cascade (precursors switched on one by one, ending in fibrinogen -> fibrin mesh).
// Beat 3 is a live assay in a spectrophotometer: every product molecule in a cuvette is one turnover event of a stochastic
// enzyme model; the product colours the solution, the transmitted beam dims, and the same events draw the
// product-vs-time trace whose slope is the activity.
import { THREE, Tw, add, ease, rng, Label, clamp } from '../core.js';
import { makeScene, instancedBlobs, blobGeo, proteinMat, C, COL, COL3, halo, contactShadow } from '../lib3d.js';
import { PAL, INK, INK2, MUTE, LINE, LINE2, AXIS, PAPER, alpha } from '../theme.js';
import { el } from '../chart.js';
import { makeCell } from '../cell.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { makeHDL, makeCascade, makeSpectro } from './s01_measure_3d.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

// ---- assay model (schematic): one "minute" of the stopwatch = MIN seconds of talk time
const MIN = 9, SPAN = 3;                 // chart shows 3 minutes, then the assay restarts
const TIN = .85, TOUT = 1.1;             // substrate drift to the active site / product drift away (inside the cuvette)
const TURN = () => .62 + -Math.log(1 - Math.random()) * .28; // waiting time between turnovers (mean .9 s ≈ 10 / min)
const LANES = [
  { y: .7, enz: [[0, -.08, 0]], col: COL3.amber, txt: PAL.amber, name: 'A' },
  { y: -.78, enz: [[-.11, -.02, -.04], [.11, -.15, .05]], col: COL3.coral, txt: PAL.coral, name: 'B' },
];
const SITE = V(0, .2, .25);              // active site on the top-front of each enzyme (local, before scaling)
const ES = .42;                          // enzyme scale inside the cuvette
const NSPH = 48;
const CW = 430, CH = 210, YMAX = 72;     // chart size (px) and product scale (molecules)

export default {
  id: 'measure', chapter: 0, beats: 4, title: 'Zer neurtzen du laborategiak?', bloom: .5,
  bridgeIn: { focus() { return this.hdl.group.getWorldPosition(_bf); } },              // lands on the HDL particle (plasma enzymes)
  bridge: { mode: 'dive', focus() { return this.cell.group.getWorldPosition(_bf); } },   // dives into the tissue cell ...
  build(layer) {
    const S = makeScene({ gx: .5, gy: .5 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.shots = [
      [V(2.5, .3, 7.7), V(2.5, .0, 0), 34],
      [V(-1.7, .35, 8.2), V(-1.7, .05, 0), 34],
      [V(1.42, -5.8, 8.9), V(1.42, -5.86, 1.2), 32],
      [V(0, -.6, 16), V(0, -1.3, 0), 34], // pulled back and framed high so the "lau galdera" note and cards sit on clean background
    ];
    this.rig = new CamRig(this.camera, this.shots[0][0], this.shots[0][1], { fov: 34 });
    const R = rng(21);
    // --- tissue cell with its own enzymes (CK, LDH, ALT); it steps aside on beat 1 so the plasma enzymes have the stage
    const cell = makeCell({ R: 1.55, seed: 7 }); cell.group.position.set(-3.5, 0, 0); this.scene.add(cell.group); this.cell = cell;
    this.cellK = new Tw(1); this.plasmaK = new Tw(1); // the plasma group leaves the stage while the tissue cell has it (beat 2)
    // beat 4: two soft tinted pools frame "tissue" and "plasma" as the two places an enzyme can come from
    this.frameK = new Tw(0);
    this.frames = [[COL3.coral, -3.5, 0, 5.4], [COL3.plasma, 3.9, 0, 6.4]].map(([c, x, y, sz]) => { const hh = halo(c, sz, 0); hh.position.set(x, y, -1.2); this.scene.add(hh); return hh; });
    const cols = [C(COL3.coral), C(COL3.blue), C(COL3.gold)];
    this.inN = 40; this.inner = instancedBlobs(this.inN, { r: .085, glow: .2, seed: 9 }); cell.group.add(this.inner);
    this.ag = [];
    for (let i = 0; i < this.inN; i++) { const p = cell.randomInside(R); this.ag.push({ home: p.clone(), p: p.clone(), ph: R() * 6.28, out: -1, s: 1 }); this.inner.setColorAt(i, cols[i % 3]); }
    this.inner.instanceColor.needsUpdate = true;
    this.nextLeak = 1.5;
    // --- enzymes that work in plasma itself: LCAT on an HDL particle + the clotting cascade
    this.plasma = new THREE.Group(); this.plasma.position.set(3.4, 0, 0); this.scene.add(this.plasma);
    this.hdl = makeHDL({ R: .9 }); this.hdl.group.position.set(-.25, .72, 0); this.plasma.add(this.hdl.group);
    this.casc = makeCascade({ x0: -1.6, dx: .58, y: -1.0, mesh: V(1.78, -.86, 0), size: V(1.75, 1.3, .8) }); this.plasma.add(this.casc.group);

    // --- beat 3: the assay. Two cuvettes in the light path of a spectrophotometer; B has twice as much enzyme
    this.big = new THREE.Group(); this.big.position.set(0, -6.1, 1.2); this.scene.add(this.big);
    this.bigK = new Tw(0); this.big.scale.setScalar(.001);
    this.spec = makeSpectro(LANES); this.big.add(this.spec.group);
    const sh = contactShadow({ size: 3.6, opacity: .12 }); sh.scale.set(4.2, 1.4, 1); sh.position.set(0, -1.32, 0); this.big.add(sh);
    const siteMat = new THREE.MeshStandardMaterial({ color: C(PAL.ink2), roughness: .8, transparent: true, opacity: .55 });
    const siteGeo = new THREE.SphereGeometry(.09, 20, 14);
    this.enz = [];
    LANES.forEach((L, li) => {
      L.count = 0; L.d = ''; L.lastX = 0; L.lastY = CH;
      L.enz.forEach(([x, y, z], k) => {
        const g = new THREE.Group(); g.position.set(x, L.y + y, z); g.scale.setScalar(ES); this.big.add(g);
        const m = new THREE.Mesh(blobGeo(77 + k, .3, { lumps: 10, amp: .2, cleft: .6, cleftDir: [0, .6, .8] }), proteinMat(L.col, { glow: .04 })); g.add(m);
        const s = new THREE.Mesh(siteGeo, siteMat); s.position.copy(SITE); g.add(s);
        const fl = halo(COL.pink, .9, 0); fl.position.copy(SITE); g.add(fl);
        this.enz.push({ g, m, fl, lane: li, k, next: 0, flash: 0, site: g.position.clone().addScaledVector(SITE, ES) });
      });
    });
    this.sph = new THREE.InstancedMesh(new THREE.SphereGeometry(.034, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .35, clearcoat: .8, envMapIntensity: .8 }), NSPH);
    this.sph.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.sph.frustumCulled = false; this.big.add(this.sph);
    for (let i = 0; i < NSPH; i++) this.sph.setColorAt(i, C(COL3.teal));
    this.parts = []; for (let i = 0; i < NSPH; i++) this.parts.push({ on: false, e: null, tArr: 0, from: V(0, 0, 0), to: V(0, 0, 0), counted: false });
    this.cSub = C(COL3.teal); this.cProd = C(COL3.pink);
    this.assayT0 = 0; this.running = false;

    // --- text
    add(layer, `<div class="eyebrow"><b>1</b>Sarrera eta neurketa</div>`);
    add(layer, `<div class="h1">Zer neurtzen du <em>laborategiak</em>?</div>`);
    add(layer, `<div class="key d2" data-b="0-0" style="left:96px;top:250px;bottom:auto;max-width:640px">Plasman <em>bertan</em> jarduten dute</div>`);
    add(layer, `<div class="fx d3" data-b="0-0" style="position:absolute;left:96px;top:330px;width:560px;font:400 24px/1.45 var(--sans);color:var(--ink2)">
      <div><b style="color:var(--mint)">LCAT</b> · HDLko kolesterola esterifikatzen du</div>
      <div style="margin-top:10px"><b style="color:var(--lav)">Koagulazio-faktoreak</b> · katean aktibatzen dira → fibrina</div></div>`);
    add(layer, `<div class="kicker fx d1" data-b="1-1" style="position:absolute;left:1190px;top:318px">Zelula barruan jarduten dute</div>`);
    add(layer, `<div class="fx d2" data-b="1-1" style="position:absolute;left:1186px;top:362px;font:600 64px/1 var(--sans);letter-spacing:-.02em"><span style="color:var(--coral)">CK</span><span style="color:#C9CED8;font-weight:300"> · </span><span style="color:var(--blue)">LDH</span><span style="color:#C9CED8;font-weight:300"> · </span><span style="color:var(--gold)">ALT</span></div>`);
    add(layer, `<div class="key d3" data-b="1-1" style="left:1190px;top:470px;bottom:auto;max-width:640px;font-size:54px;line-height:1.1">Odolean <em>jarduera txikia</em></div>`);
    add(layer, `<div class="fx d4" data-b="1-1" style="position:absolute;left:1190px;top:612px;width:600px;font:400 26px/1.4 var(--sans);color:var(--ink2)">zelula-berritzea eta oinarrizko askapena</div>`);
    // activity card: stopwatch + live product trace
    this.uEl = add(layer, `<div class="card r" data-b="2-2" style="left:1100px;top:228px;width:740px;padding:24px 30px 22px">
      <h4 style="color:var(--amber)">Jarduera katalitikoa</h4>
      <div style="font:400 54px/1.1 var(--serif);margin:6px 0 4px">1 U <span style="color:var(--mute)">=</span> 1 µmol <span style="font-size:32px;color:var(--ink2)">/ min</span></div>
      <p style="font-size:22px">substratu eraldatua minutuko, <b style="color:var(--ink)">saiakuntzaren baldintzetan</b></p>
      <div style="display:flex;gap:18px;margin-top:16px;align-items:flex-start">
        <div style="width:150px;text-align:center">
          <svg viewBox="0 0 80 96" width="118" height="142"><rect x="33" y="2" width="14" height="7" rx="2" fill="${MUTE}"/><circle cx="40" cy="48" r="31" fill="${PAPER}" stroke="${LINE2}" stroke-width="4"/>
            <path class="m-arc" fill="${alpha(PAL.amber, .22)}" d=""/><line class="m-hand" x1="40" y1="48" x2="40" y2="22" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="48" r="4" fill="${INK}"/>
            <text x="40" y="95" text-anchor="middle" font-size="15" font-weight="650" fill="${MUTE}">1 min</text></svg>
          <div style="font:600 22px/1.45 var(--sans);margin-top:4px;text-align:left;padding-left:8px"><span style="color:var(--teal)">● substratua</span><br><span style="color:var(--pink)">● produktua</span></div>
        </div>
        <div class="m-chart" style="position:relative;width:${CW + 70}px;height:${CH + 64}px"></div>
      </div>
      <div style="display:flex;gap:34px;margin-top:6px;font:600 25px/1 var(--sans);align-items:baseline">
        <span style="color:${PAL.amber}">A · <span class="mono m-ra">–</span> <small style="font-weight:400;font-size:22px;color:var(--ink2)">/ min</small></span>
        <span style="color:${PAL.coral}">B · <span class="mono m-rb">–</span> <small style="font-weight:400;font-size:22px;color:var(--ink2)">/ min</small></span>
        <span style="color:var(--ink2);font-weight:500">malda = <b style="color:var(--amber)">jarduera</b> → U/L</span></div>
      <p style="margin-top:14px;font-size:22px;color:var(--mute)">Jarduera eta kontzentrazioa lotuta daude, baina balioa metodoaren araberakoa da</p></div>`);
    this.cntA = this.uEl.querySelector('.m-ra'); this.cntB = this.uEl.querySelector('.m-rb');
    this.arc = this.uEl.querySelector('.m-arc'); this.hand = this.uEl.querySelector('.m-hand');
    // chart
    const svg = el('svg', { width: CW + 70, height: CH + 64, viewBox: `-46 -14 ${CW + 70} ${CH + 64}`, style: 'overflow:visible' }, this.uEl.querySelector('.m-chart'));
    for (let m = 1; m <= SPAN; m++) el('line', { x1: m / SPAN * CW, x2: m / SPAN * CW, y1: 0, y2: CH, stroke: LINE, 'stroke-width': 1.5 }, svg);
    el('path', { d: `M0 -6 V${CH} H${CW + 8}`, fill: 'none', stroke: AXIS, 'stroke-width': 2 }, svg);
    for (let m = 0; m <= SPAN; m++) { const tx = el('text', { x: m / SPAN * CW, y: CH + 24, 'text-anchor': 'middle', 'font-size': 22, fill: MUTE }, svg); tx.textContent = m; }
    const xl = el('text', { x: CW, y: CH + 50, 'text-anchor': 'end', 'font-size': 22, fill: INK2 }, svg); xl.textContent = 'denbora (min)';
    const yl = el('text', { x: 10, y: 2, 'font-size': 22, 'font-weight': 600, fill: INK }, svg); yl.textContent = 'Produktua';
    const yl2 = el('text', { x: 124, y: 2, 'font-size': 22, fill: MUTE }, svg); yl2.textContent = '(absorbantzia)';
    const sc = el('text', { x: -16, y: CH, 'font-size': 22, fill: MUTE, 'font-style': 'italic', transform: `rotate(-90 -14 ${CH})` }, svg); sc.textContent = 'eskematikoa';
    LANES.forEach(L => {
      L.fit = el('line', { stroke: L.txt, 'stroke-width': 2, 'stroke-dasharray': '6 6', opacity: 0 }, svg);
      L.path = el('path', { fill: 'none', stroke: L.txt, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, svg);
      L.dot = el('circle', { r: 6, fill: L.txt, stroke: PAPER, 'stroke-width': 2.5 }, svg);
      L.tag = el('text', { 'font-size': 22, 'font-weight': 700, fill: L.txt }, svg); L.tag.textContent = L.name;
    });
    const q = [['tissue', 'Zein ehunetatik?', 'etor daiteke entzima', COL.coral], ['gauge', 'Zenbatekoa?', 'da aldaketa', COL.amber], ['clock', 'Noiz?', 'hartu da lagina', COL.blue], ['patient', 'Zer datu kliniko?', 'ditu pazienteak', COL.mint]];
    q.forEach(([ic, a, b2, c], i) => add(layer, `<div class="fx d${i + 2}" data-b="3" style="position:absolute;left:${96 + i * 440}px;top:672px;width:410px;padding-top:22px;border-top:2px solid ${c}">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">${icon(ic, 46, c)}<span style="font:500 22px/1 var(--mono);color:${c}">0${i + 1}</span></div>
      <div style="font:400 46px/1.08 var(--serif);color:var(--ink);letter-spacing:-.01em">${a}</div>
      <div style="font:400 24px/1.35 var(--sans);color:var(--ink2);margin-top:8px">${b2}</div></div>`));
    add(layer, `<div class="kicker fx d1" data-b="3" style="position:absolute;left:96px;top:620px">Emaitza bat interpretatzeko · lau galdera</div>`);
    this.detLab = LANES.map((L, i) => new Label(layer, `detektagailua<small><span class="m-abs mono">abs. 0.00</span></small>`, { color: INK2, anchor: V(1.38, L.y + .26, 0), obj: this.big, b: '2-2' }));
    this.absEl = this.detLab.map(l => l.el.querySelector('.m-abs'));
    this.labs = [
      new Label(layer, 'HDL<small>esterrak nukleoan metatzen dira</small>', { color: PAL.orange, anchor: V(-.55, 1.62, 0), obj: this.plasma, b: '0-0' }),
      new Label(layer, 'LCAT<small>kolesterola → esterra</small>', { color: PAL.mint, anchor: V(0, 0, 0), obj: this.plasma, side: 'r', b: '0-0' }),
      new Label(layer, 'Koagulazio-faktoreak<small>inaktibo → aktibo, katean</small>', { color: PAL.lav, anchor: V(-.45, -.5, 0), obj: this.plasma, b: '0-0' }),
      new Label(layer, 'trombina', { color: PAL.violet, anchor: V(-1.6 + 4 * .58 + .05, -.72, 0), obj: this.plasma, b: '0-0' }),
      new Label(layer, 'fibrinogenoa → fibrina', { color: PAL.violet, anchor: V(1.78, -.12, 0), obj: this.plasma, b: '0-0' }),
      new Label(layer, 'Zelula (ehuna)', { color: PAL.coral, anchor: V(1.15, -1.3, 0), obj: cell.group, side: 'r', b: '1-1' }),
      new Label(layer, 'oinarrizko askapena<small>banan-banan</small>', { color: PAL.coral, anchor: V(2.1, -.6, 0), obj: cell.group, b: '1-1' }),
      new Label(layer, 'Plasma<small>bertan jarduten dutenak</small>', { color: PAL.mint, anchor: V(2.75, .1, 0), obj: this.plasma, side: 'r', b: '3' }),
      new Label(layer, 'Ehuna<small>zelula barrukoak</small>', { color: PAL.coral, anchor: V(-1.75, 0, 0), obj: cell.group, side: 'l', b: '3' }),
      new Label(layer, 'A lagina<small>entzima 1×</small>', { color: PAL.amber, anchor: V(0, LANES[0].y + .5, 0), obj: this.big, b: '2-2' }),
      new Label(layer, 'B lagina<small>entzima 2×</small>', { color: PAL.coral, anchor: V(0, LANES[1].y + .5, 0), obj: this.big, b: '2-2' }),
      new Label(layer, 'argi-iturria', { color: INK2, anchor: V(-1.38, LANES[0].y + .22, 0), obj: this.big, b: '2-2' }),
      new Label(layer, 'kubeta', { color: INK2, anchor: V(-.3, LANES[0].y - .3, 0), obj: this.big, side: 'l', b: '2-2' }),
    ];
    this.tmp = new THREE.Vector3(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = new THREE.Vector3(); this.ax = new THREE.Vector3(.3, 1, .2).normalize();
  },
  enter(b) { this.currentBeat=b;this.travel=0; const s = this.shots[b]; this.rig.arrive(s[0], s[1], s[2]); this.bigK.set(b === 2 ? 1 : 0); this.cellK.set(b === 0 ? 0 : 1); this.plasmaK.set(b === 1 ? 0 : 1); if (b === 2) this.startAssay(); else this.running = false; },
  beat(b, dir) {
    this.currentBeat=b;this.travel=0;
    if (dir) { const s = this.shots[b]; this.rig.go(s[0], s[1], 2.0, s[2]); }
    this.bigK.to(b === 2 ? 1 : 0, 1.2, ease.out);
    this.frameK.to(b === 3 ? 1 : 0, 1.2);
    this.plasmaK.to(b === 1 ? 0 : 1, b === 1 ? .7 : 1.2, b === 1 ? ease.in : ease.out, b === 1 ? 0 : .3);
    this.cellK.to(b === 0 ? 0 : 1, b === 0 ? .8 : 1.4, b === 0 ? ease.in : ease.out, b === 0 ? 0 : .3);
    if (b === 2 && dir) this.startAssay();
    if (b !== 2) this.running = false;
  },
  // restart the assay: empty chart, clear solutions; enzymes get their first turnover shortly after the substrate starts flowing
  startAssay() {
    const t = this.lastT || 0;
    this.running = true; this.assayT0 = t + .6;
    for (const p of this.parts) p.on = false;
    for (const e of this.enz) e.next = this.assayT0 + TIN * .6 + Math.random() * .7;
    for (const L of LANES) { L.count = 0; L.d = `M0 ${CH}`; L.lastX = 0; L.lastY = CH; L.path.setAttribute('d', ''); L.fit.setAttribute('opacity', 0); L.abs = 0; }
    this.cntA.textContent = '–'; this.cntB.textContent = '–';
  },
  // one product molecule = one step on the lane's trace (and a little more colour in the cuvette)
  turnover(e, tArr) {
    const L = LANES[e.lane]; L.count++; e.flash = 1;
    const x = clamp((tArr - this.assayT0) / (MIN * SPAN)) * CW, y = CH - Math.min(1, L.count / YMAX) * CH;
    L.d += `H${x.toFixed(1)}V${y.toFixed(1)}`; L.lastX = x; L.lastY = y;
  },
  freePart() { for (const p of this.parts) if (!p.on) return p; return null; },
  // a random point in the solution of a lane's cuvette (big-group local)
  inCuvette(L, out) { const r0 = this.spec.rows[0], r = r0.inner / 2; return out.set((Math.random() * 2 - 1) * r, L.y + r0.liqY + (Math.random() - .5) * r0.liqH * .8, (Math.random() * 2 - 1) * r); },
  update(dt, t) {
    this.lastT = t;
    if(this.travel<2.4&&(this.travel+=dt)>=2.4&&(this.currentBeat===0||this.currentBeat===2)){
      const [p,l,f]=this.shots[this.currentBeat],offset=this.currentBeat===0?V(.26,-.26,0):V(0,-.22,0);
      this.rig.go(p.clone().add(offset),l.clone().add(offset),2.4,f);
    }
    this.rig.update(t); this.S.dust.update(t);
    const fk = this.frameK.v; this.frames[0].material.opacity = fk * .3; this.frames[1].material.opacity = fk * .45;
    const ck = this.cellK.v; this.cell.group.visible = ck > .01; this.cell.group.scale.setScalar(Math.max(.001, ck)); this.cell.group.position.x = -3.5 - (1 - ck) * 1.2;
    // tissue enzymes jiggle; every so often one slips out (basal release)
    if (this.cell.group.visible) {
      this.nextLeak -= dt;
      if (this.nextLeak < 0) { this.nextLeak = 1.35 + Math.random() * .3; const a = this.ag[Math.floor(Math.random() * this.inN)]; if (a.out < 0) a.out = 0; }
      for (let i = 0; i < this.inN; i++) {
        const a = this.ag[i];
        if (a.out >= 0) {
          a.out += dt * .45;
          const k = a.out; a.p.set(a.home.x + k * 5.2, a.home.y + Math.sin(k * 3) * .4, a.home.z + k * .4); a.s = clamp(1.6 - k * .9, 0, 1);
          if (k > 1.8) { a.out = -1; a.p.copy(a.home); a.s = 0; }
        } else { a.s = Math.min(1, a.s + dt * .8); a.p.set(a.home.x + Math.sin(t * .9 + a.ph) * .07, a.home.y + Math.cos(t * .7 + a.ph) * .07, a.home.z + Math.sin(t * .6 + a.ph * 2) * .07); }
        this.q.setFromAxisAngle(this.ax, t * .5 + a.ph); this.sv.setScalar(Math.max(.001, a.s));
        this.m4.compose(a.p, this.q, this.sv); this.inner.setMatrixAt(i, this.m4);
      }
      this.inner.instanceMatrix.needsUpdate = true;
      this.cell.nucleus.rotation.y = t * .1;
    }
    // plasma enzymes at work (skipped while the camera is down at the assay or the group is off stage)
    const pk = this.plasmaK.v; this.plasma.visible = pk > .01; this.plasma.scale.setScalar(Math.max(.001, pk));
    if (this.bigK.v < .99 && this.plasma.visible) {
      this.hdl.update(t); this.casc.update(t);
      this.hdl.group.rotation.y = Math.sin(t * .2) * .15;
      this.labs[1].anchor.copy(this.hdl.lcat.position).applyEuler(this.hdl.group.rotation).add(this.hdl.group.position); this.labs[1].anchor.x += .32;
    }
    for (const l of this.labs) l.update(this.camera);
    for (const l of this.detLab) l.update(this.camera);
    this.updateAssay(dt, t);
  },
  updateAssay(dt, t) {
    const bk = this.bigK.v; this.big.scale.setScalar(Math.max(.001, bk)); this.big.visible = bk > .01;
    if (!this.big.visible && !this.running) return;
    for (const e of this.enz) { e.m.rotation.y = Math.sin(t * .4 + e.k * 2 + e.lane) * .25; e.m.rotation.x = Math.sin(t * .3 + e.k) * .12;
      e.flash = Math.max(0, e.flash - dt * 2.5); e.fl.material.opacity = e.flash * .8; e.m.scale.setScalar(1 + e.flash * .06); }
    if (this.running) {
      if (t - this.assayT0 > MIN * SPAN) this.startAssay();
      // schedule: a substrate starts drifting TIN before the enzyme's next turnover, so it arrives exactly on time
      for (const e of this.enz) {
        while (t + TIN >= e.next) {
          const p = this.freePart();
          if (p) { p.on = true; p.e = e; p.tArr = e.next; p.counted = false; const L = LANES[e.lane]; this.inCuvette(L, p.from); this.inCuvette(L, p.to); }
          e.next += TURN();
        }
      }
    }
    let n = 0;
    for (const p of this.parts) {
      if (!p.on) continue;
      const u = t - p.tArr; let s;
      if (u < 0) { const k = clamp(1 + u / TIN); this.tmp.lerpVectors(p.from, p.e.site, ease.io(k)); s = clamp(k * 5); this.sph.setColorAt(n, this.cSub); }
      else if (u < TOUT) {
        if (!p.counted) { p.counted = true; this.turnover(p.e, p.tArr); }
        const k = u / TOUT; this.tmp.lerpVectors(p.e.site, p.to, ease.out(k)); s = clamp((1 - k) * 4); this.sph.setColorAt(n, this.cProd);
      } else { if (!p.counted) this.turnover(p.e, p.tArr); p.on = false; continue; }
      this.sv.setScalar(Math.max(.001, s)); this.q.identity(); this.m4.compose(this.tmp, this.q, this.sv); this.sph.setMatrixAt(n++, this.m4);
    }
    this.sph.count = n; this.sph.instanceMatrix.needsUpdate = true; if (this.sph.instanceColor) this.sph.instanceColor.needsUpdate = true;
    // chart: step traces extended to "now", dashed line from the origin with the average slope
    const ela = t - this.assayT0, xNow = clamp(ela / (MIN * SPAN)) * CW, mins = ela / MIN;
    LANES.forEach((L, i) => {
      // the solution colours with the product formed; the detector sees the transmitted light dim (absorbance, schematic)
      const aT = Math.min(1, L.count / YMAX); L.abs = (L.abs || 0) + (aT - (L.abs || 0)) * Math.min(1, dt * 4);
      this.spec.set(i, L.abs, t);
      const txt = 'abs. ' + L.abs.toFixed(2); if (this.absEl[i].textContent !== txt) this.absEl[i].textContent = txt;
      if (L.count) L.path.setAttribute('d', L.d + `H${Math.max(L.lastX, xNow).toFixed(1)}`);
      L.dot.setAttribute('cx', xNow.toFixed(1)); L.dot.setAttribute('cy', L.lastY.toFixed(1));
      L.tag.setAttribute('x', (xNow + 12).toFixed(1)); L.tag.setAttribute('y', (L.lastY + 6).toFixed(1));
      if (mins > .35 && L.count) {
        const rate = L.count / mins, y2 = CH - Math.min(1, rate * SPAN / YMAX) * CH;
        L.fit.setAttribute('x1', 0); L.fit.setAttribute('y1', CH); L.fit.setAttribute('x2', CW); L.fit.setAttribute('y2', y2.toFixed(1)); L.fit.setAttribute('opacity', .55);
        const txt2 = String(Math.round(rate)); const c = i ? this.cntB : this.cntA; if (c.textContent !== txt2) c.textContent = txt2;
      }
    });
    // stopwatch: one sweep = one minute of the assay
    const swPh = ela <= 0 ? 0 : (ela % MIN) / MIN;
    const an = swPh * Math.PI * 2, hx = 40 + Math.sin(an) * 26, hy = 48 - Math.cos(an) * 26;
    this.hand.setAttribute('x2', hx.toFixed(1)); this.hand.setAttribute('y2', hy.toFixed(1));
    const ax = 40 + Math.sin(an) * 29, ay = 48 - Math.cos(an) * 29;
    this.arc.setAttribute('d', swPh < .002 ? '' : `M40 48 L40 19 A29 29 0 ${swPh > .5 ? 1 : 0} 1 ${ax.toFixed(1)} ${ay.toFixed(1)} Z`);
  },
};
