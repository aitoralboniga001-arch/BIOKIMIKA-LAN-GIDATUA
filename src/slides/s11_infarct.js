// 11 · Myocardial infarction: a beating heart, a blocked coronary, an ischaemic zone that spreads, and two enzymes that
// leave it. Plasma CK and LDH come from two one-compartment balance models (sim.js): CK starts earlier and is cleared
// faster (larger k); LDH starts later and is cleared slowly (smaller k). One schematic clock drives the injury, the
// release particles, both chart curves and both sample tubes, so an "early" and a "late" sample read straight off it.
import { THREE, Tw, add, ease, clamp, rng, Label } from '../core.js';
import { makeScene, Pts, C, halo, contactShadow } from '../lib3d.js';
import { coronarySection } from './coronary_section.js';
import { buildHeart } from './s11_heart.js';
import { PAL, COL3, INK, LINE2, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { Chart } from '../chart.js';
import { balanceModel } from '../sim.js';
import { tubeMeter } from './s06_kinetics.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const REF = .18;
// qualitative: CK earlier onset + faster clearance; LDH later onset + slower clearance (time axis is schematic)
const CKM = balanceModel({ base: .06, peak: .85, k: 11, onset: .02, tRise: .06 });
const LDM = balanceModel({ base: .06, peak: .7, k: 2.8, onset: .07, tRise: .13 });
const T_EARLY = .08, T_LATE = .43, T_B1 = .05;
// left column once the chart is shown (sd = 1): heart top-left, clock beside it, the two tubes in a row below the clock
const HX = -3.43, HY = -.35, HS = .79, TUBE_S = .4, TUBE_Y = -1.88, TCX = -2.35, TLX = -1.27;
const spreadOf = tau => .08 + .92 * clamp(tau / .12);   // ischaemic territory vs time after the block
const excessMax = m => { let mx = 0; for (let i = 0; i <= 200; i++) mx = Math.max(mx, m.rel(i / 200) - m.params.k * m.params.base); return mx; };
const XCK = excessMax(CKM), XLD = excessMax(LDM);

export default {
  id: 'infarct', chapter: 4, beats: 6, title: 'Miokardioko infartua: CK, LDH eta denbora', bloom: .5,
  bridgeIn: { focus() { return this.hg.getWorldPosition(_bf); } },
  bridge: { mode: 'dive', focus() { const p = this.tC.tube.plasma; return this.tC.group.localToWorld(_bf.set(0, (p.y0 + p.y1) / 2, 0)); } },
  build(layer) {
    const S = makeScene({ gx: .32, gy: .5 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, .2, 10), V(0, .1, 0), { fov: 34, drift: .03 });
    const root = new THREE.Group(); this.scene.add(root); this.root = root;
    const heart = new THREE.Group(); root.add(heart); this.heart = heart;
    this.shadow = contactShadow({ size: 3.6, opacity: .16 }); this.shadow.position.set(.1, -1.75, 0); root.add(this.shadow);
    // anatomical heart: tilted ventricles, great vessels, atria, coronary tree with the LAD occluded (s11_heart.js)
    const H = buildHeart(); this.H = H; H.group.position.set(-.05, .12, 0); heart.add(H.group); this.hg = H.group;
    this.cutaway = coronarySection(this.scene);
    add(layer, `<div class="abs" data-b="0-1" style="left:1060px;top:350px;width:520px;text-align:center;font:600 25px/1.2 var(--sans);color:var(--ink2)">Koronariaren barrualdea</div>`);
    add(layer, `<div class="note" data-b="0-1" style="left:1060px;top:728px;width:520px;text-align:center;font-size:21px">Luzetarako ebakidura · eskematikoa</div>`);
    this.corC = C('#F2533A'); this.deadC = C('#7A6470');
    this.clot = H.clot; this.clotPos = H.clotP;
    this.clotHalo = halo(COL3.amber, .9, 0); this.clotHalo.position.copy(H.clotP); H.group.add(this.clotHalo);
    // enzymes leaving the injured muscle: emission follows each model's release term
    this.rel = new Pts(180); this.scene.add(this.rel.mesh); const R = rng(8); this.rp = [];
    for (let i = 0; i < 180; i++) this.rp.push({ d: V(R() - .5, R() - .2, R() * .8 + .2).normalize(), ph: R(), sp: .22 + R() * .2, ck: i < 90 });
    this.cc = C(COL3.coral); this.lc = C(COL3.blue); this.wc = V(0, 0, 0);
    this.les = 0; this.occ = new Tw(0); this.side = new Tw(0); this.tau = new Tw(0); this.ckOn = new Tw(0); this.ldOn = new Tw(0);
    this.labs = [new Label(layer, 'Arteria koronarioa<small>buxadura</small>', { color: PAL.amber, anchor: H.clotP.clone().addScaledVector(H.clotP.clone().normalize(), .08), obj: H.group, side: 'l', b: '1-1' }),
      new Label(layer, 'Iskemia-eremua<small>miokardio-lesioa</small>', { color: INK, anchor: H.terrC.clone().addScaledVector(H.terrN, .1), obj: H.group, side: 'r', b: '1-1' }),
      new Label(layer, 'Arteria koronarioak<small>miokardioa hornitzen dute</small>', { color: PAL.coral, anchor: H.cor.lad[6].clone().addScaledVector(H.cor.lad[6].clone().normalize(), .06), obj: H.group, side: 'l', b: '0-0' })];
    this.labs.forEach(l => l.el.classList.add('bg')); // they sit on the red heart: light pill behind the text
    // two sample tubes read the two models at the clock time
    this.tC = tubeMeter(this.scene, { x: TCX, y: TUBE_Y, s: TUBE_S, color: COL3.coral, n: 60, seed: 5 });
    this.tL = tubeMeter(this.scene, { x: TLX, y: TUBE_Y, s: TUBE_S, color: COL3.blue, n: 60, seed: 9 });

    add(layer, `<div class="eyebrow"><b>5</b>Adibide historikoa</div>`);
    add(layer, `<div class="h1">Miokardioko infartua: <span style="color:var(--coral)">CK</span>, <span style="color:var(--blue)">LDH</span> eta <em>denbora</em></div>`);
    add(layer, `<div class="key" data-b="1-1" style="left:96px;top:900px;bottom:auto;font-size:34px;max-width:1500px">Miokardioa kaltetzen denean, zelula barruko entzimak <em>odolera</em> askatu daitezke</div>`);
    this.ch = new Chart(layer, { x: 900, y: 300, w: 900, h: 420, ref: REF, xLabel: 'Infartuaren ondorengo denbora', yLabel: 'Jarduera plasmatikoa', b: '2' });
    this.cC = this.ch.curve(CKM.A, { color: PAL.coral, width: 6, name: 'CK osoa', nameAt: .2, nameDy: -24 });
    this.cL = this.ch.curve(LDM.A, { color: PAL.blue, width: 6, dash: '16 12', name: 'LDH', nameAt: .56, nameDy: -26 });
    const call = (b, html) => add(layer, `<div class="key" data-b="${b}" style="left:900px;top:850px;bottom:auto;font-size:33px;max-width:940px">${html}</div>`);
    call('2-2', `<span style="color:var(--coral)">CK osoa</span>: lehenago igo, lehenago itzuli`);
    call('3-3', `<span style="color:var(--blue)">LDH</span>: beranduago hasi, luzaroago altu`);
    call('4-4', `Lagin <em>goiztiarra</em>: CK igotzen hasia · LDH oraindik ohiko tartean`);
    call('5-5', `Lagin <em>berantiarra</em>: CK jaisten · LDH altu jarraitzen du`);
    add(layer, `<div class="note" data-b="2" style="left:900px;top:926px;font-size:22px">Eskema kualitatiboa · CK osoa (ez CK-MB) · Newsholme eta Leech [2], 3.26 ir.</div>`);
    // schematic clock: one turn of the hand per half chart width, arc = elapsed fraction
    const CIRC = 2 * Math.PI * 44;
    this.clockEl = add(layer, `<div class="abs d6" data-b="2" style="left:490px;top:192px;width:320px;text-align:center;white-space:nowrap">
      <svg width="136" height="136" viewBox="-62 -62 124 124" style="overflow:visible">
        <circle r="54" fill="rgba(255,255,255,.88)" stroke="${LINE2}" stroke-width="2.5"/>
        ${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return `<line x1="${(Math.sin(a) * 48).toFixed(1)}" y1="${(-Math.cos(a) * 48).toFixed(1)}" x2="${(Math.sin(a) * 52).toFixed(1)}" y2="${(-Math.cos(a) * 52).toFixed(1)}" stroke="${alpha(INK, .45)}" stroke-width="2"/>`; }).join('')}
        <circle class="arc" r="44" fill="none" stroke="${PAL.amber}" stroke-width="7" stroke-linecap="round" transform="rotate(-90)" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${CIRC.toFixed(1)}" opacity=".8"/>
        <line class="hand" x1="0" y1="6" x2="0" y2="-38" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <circle r="5" fill="${INK}"/></svg>
      <div style="font:600 22px/1.2 var(--sans);color:var(--ink2);margin-top:8px">Infartutik igarotako denbora</div>
      <div style="font:italic 400 22px/1.2 var(--serif);color:var(--mute)">eskematikoa</div></div>`);
    this.arc = this.clockEl.querySelector('.arc'); this.hand = this.clockEl.querySelector('.hand'); this.CIRC = CIRC;
    // tube read-outs
    const tag = (x, name, col, b, cls) => add(layer, `<div class="abs ${cls}" data-b="${b}" style="left:${x - 95}px;top:486px;width:190px;text-align:center"><div style="font:700 28px/1 var(--sans);color:${col}">${name}</div><div class="st" style="font:600 22px/1.2 var(--sans);margin-top:6px;color:var(--mute)"></div></div>`).querySelector('.st');
    this.stC = tag(556, 'CK', PAL.coral, '2', 'd6'); this.stL = tag(747, 'LDH', PAL.blue, '3', '');
    this.ch.svg.classList.add('d6');   // the chart, clock and CK read-out appear once the heart has moved aside
    this.flash = add(layer, `<div class="pill" data-b="4-5" style="position:absolute;left:556px;top:436px;width:190px;box-sizing:border-box;text-align:center;color:var(--ink)">Lagina</div>`);
    this.stTxt = ['', ''];
    this.atrS = H.atria.map(m => m.scale.clone()); this.clotS = H.clot.scale.clone();
  },
  enter(b) { this.rig.arrive(V(0, .2, 10), V(0, .1, 0), 34); this.apply(b, true, 1); },
  beat(b, dir) { this.apply(b, false, dir); },
  apply(b, inst, dir = 1) {
    this.ch.sampledCurves=b>=3?2:1;
    this.b = b; const d = inst ? .01 : 1.6, back = dir < 0;
    this.occ.to(b >= 1 ? 1 : 0, inst ? .01 : (back ? .8 : 2.4), ease.io);
    // going back to the centred heart: the read-outs leave first, then the heart moves (they never overlap)
    this.side.to(b >= 2 ? 1 : 0, d, ease.io, !inst && back && b < 2 ? .45 : 0);
    this.ckOn.to(b >= 2 ? 1 : 0, inst ? .01 : b >= 2 ? .8 : .35, ease.io, !inst && b === 2 && !back ? 1.25 : 0);
    const x=b===1?-.08:0,y=b===1?-.04:.1;
    this.rig.go(V(x,y+.12,b===1?9.45:10),V(x,y,0),2.2,34);
    if (inst) this.les = b >= 3 ? 1 : 0; this.ldOn.to(b >= 3 ? 1 : 0, inst ? .01 : .8);
    if (b === 0) this.tau.to(0, inst ? .01 : .6);
    if (b === 1) { if (back) this.tau.to(T_B1, .8); else { this.tau.set(0).to(T_B1, 3.5, ease.lin, inst ? 2.2 : 2.0); } }
    if (b === 2) { if (back) this.tau.to(1, .01); else this.tau.to(1, 7.5, ease.lin, inst ? 1.2 : .9); }
    if (b === 3) { if (back) this.tau.to(1, .01); else this.tau.set(0).to(1, 7.5, ease.lin, inst ? 1.2 : .4); }
    if (b === 4) this.tau.to(T_EARLY, inst ? .01 : 1.8, ease.io);
    if (b === 5) this.tau.to(T_LATE, inst ? .01 : 1.8, ease.io);
    this.ch.cursor(b >= 2, null, .4, b === 4 ? 'goiztiarra' : b === 5 ? 'berantiarra' : '');
    if (b < 2) { this.cC.reveal.set(0); this.cL.reveal.set(0); }
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const tau = this.ch.scrub ?? this.tau.v, b = this.b;
    // heartbeat (lub-dub): atria first, then the ventricles; the ischaemic wall follows late and weakly (shader)
    const bt = t * 1.05, ph = bt % 1;
    const pulse = Math.exp(-Math.pow((ph - .1) / .06, 2)) + .55 * Math.exp(-Math.pow((ph - .32) / .07, 2));
    const phL = (bt - .16) % 1, lag = Math.exp(-Math.pow((phL - .1) / .09, 2)) * (.8 + .2 * Math.sin(t * 2.3));
    const ap = Math.exp(-Math.pow(((bt + .12) % 1 - .1) / .07, 2));
    const sd = this.side.v, HU = this.H.U;
    this.root.position.set(-1.75*(1-sd)+HX*sd, -.62 + (HY + .62) * sd, 0); this.root.scale.setScalar(.92 + (HS - .92) * sd);
    this.heart.rotation.y = -.28 + Math.sin(t * .20) * .175; this.heart.rotation.x = .04;
    HU.uPulse.value = pulse; HU.uLag.value = lag; HU.uT.value = t;
    for (let i = 0; i < 4; i++) this.H.atria[i].scale.copy(this.atrS[i]).multiplyScalar(1 - .05 * ap);
    // occlusion + ischaemic territory downstream of the clot, spreading with time after the block
    const o = this.occ.v;
    this.cutaway(dt,t,o,1-sd);
    // lesion progress: follows the clock while the infarct develops (beats 0–2), then never regresses when the clock is replayed
    if (b <= 1) this.les = spreadOf(tau); else if (b === 2) this.les = Math.max(this.les, spreadOf(this.tau.v)); else this.les += (1 - this.les) * (1 - Math.exp(-dt * 3));
    const spread = this.ch.scrub==null?this.les:spreadOf(tau);
    HU.uIk.value = clamp((o - .3) / .7); HU.uIR.value = .6 * spread;
    this.clot.scale.copy(this.clotS).multiplyScalar(Math.max(.001, clamp(o * 3)));
    this.clotHalo.material.opacity = Math.sin(clamp(o * 2) * Math.PI) * .55;
    this.H.distMat.color.copy(this.corC).lerp(this.deadC, clamp(o * 1.5));
    this.H.flowD.value = 1 - clamp(o * 2);
    // chart: CK drawn while the clock runs on beat 2, LDH on beat 3; cursor = the clock
    this.cC.reveal.set(b === 2 ? this.tau.v : b >= 3 ? 1 : 0);
    this.cL.reveal.set(b === 3 ? this.tau.v : b >= 4 ? 1 : 0);
    this.ch.curT.set(this.tau.v); this.ch.update();
    // clock
    if (b >= 2) { this.arc.setAttribute('stroke-dashoffset', (this.CIRC * (1 - tau)).toFixed(1)); this.hand.setAttribute('transform', `rotate(${(tau * 720).toFixed(1)})`); }
    // tubes read the models at the clock time
    const aC = CKM.A(tau), aL = LDM.A(tau), con = this.ckOn.v, lon = this.ldOn.v;
    this.tC.group.scale.setScalar(TUBE_S * Math.max(.001, con)); this.tL.group.scale.setScalar(TUBE_S * Math.max(.001, lon));
    this.tC.group.visible = con > .002; this.tL.group.visible = lon > .002;
    if (con > .002) this.tC.update(t, dt, clamp(aC / .9));
    if (lon > .002) this.tL.update(t, dt, clamp(aL / .9));
    const st = (m, a, col) => { const s = m.A(Math.min(1, tau + .01)) - a, tr = a > .075 ? (s > .006 ? 'igotzen' : s < -.006 ? 'jaisten' : '') : '';
      return (a > REF ? `<span style="color:${col}">▲ tartetik gora</span>` : 'ohiko tartean') + (tr ? `<br><span style="font-weight:400">${tr}</span>` : ''); };
    const sC = st(CKM, aC, PAL.coral), sL = st(LDM, aL, PAL.blue);
    if (sC !== this.stTxt[0]) { this.stC.innerHTML = sC; this.stTxt[0] = sC; }
    if (sL !== this.stTxt[1]) { this.stL.innerHTML = sL; this.stTxt[1] = sL; }
    // release particles: rate ∝ each model's release term above the basal level
    const wc = this.wc.copy(this.H.terrC).addScaledVector(this.H.terrN, .08); this.hg.localToWorld(wc);
    const relK = o * (b >= 2 ? 1 : .8);
    const nCK = clamp((CKM.rel(tau) - CKM.params.k * CKM.params.base) / XCK) * 90 * relK;
    const nL = clamp((LDM.rel(tau) - LDM.params.k * LDM.params.base) / XLD) * 90 * relK * lon;
    for (let i = 0; i < 180; i++) { const p = this.rp[i]; const life = (t * p.sp + p.ph) % 1; const idx = p.ck ? i : i - 90; const n = p.ck ? nCK : nL;
      const a = clamp(n - idx) * Math.sin(life * Math.PI) * .9; const r = life * (2.4 - 1.75 * sd);   // aside: a tight cloud, clear of the clock and tubes
      const towardCurve=sd*life, chartX=(this.ch.x+this.ch.X(tau)-960)*.00565, chartY=(540-this.ch.y-this.ch.Y(p.ck?aC:aL))*.00565;
      const envelope=Math.sin(life*Math.PI), arc=p.ck?.60:-.41;
      this.rel.set(i,wc.x+(chartX-wc.x)*towardCurve+p.d.x*r*(1-towardCurve),
        wc.y+(chartY-wc.y)*towardCurve+(sd*arc+p.d.y*.16)*envelope,
        wc.z*(1-towardCurve)+p.d.z*.15*envelope,.12+sd*.018,p.ck?this.cc:this.lc,a);
    }
    this.rel.commit();
    for (const l of this.labs) l.update(this.camera);
  },
};
