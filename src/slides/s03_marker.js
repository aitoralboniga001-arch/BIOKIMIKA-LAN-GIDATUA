// 3 · What makes a useful enzyme marker (four properties) + substrate vs tissue specificity.
// Beat 1: a 3D enzyme turning substrate over (the measured signal) feeds, with the other data, into the interpretation.
// Beats 2–5 use a tissue-and-tube bench and two three-dimensional targets.
// Beat 6: lock and key (the right substrate fits the slot-shaped active site, a wrong molecule bounces off) next to a
// glass body whose organs are coloured by their ALT content (schematic tissue distribution).
import { THREE, Tw, add, clamp, ease, Label } from '../core.js';
import { makeScene, contactShadow, Pts, C, COL3 } from '../lib3d.js';
import { PAL, INK, INK2, alpha } from '../theme.js';
import { el } from '../chart.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { markerBench } from './marker_bench.js';
import { makeDockEnzyme, makeBody } from './s03_marker_3d.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const TUBES = `<span style="display:inline-block;width:52px;height:52px;color:${INK2};vertical-align:middle"><svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
  [12, 28, 44].map((x0, i) => `<path d="M${x0 - 3} 10h14M${x0} 10v34a4 4 0 0 0 8 0V10"/><path d="M${x0} ${26 + i * 5}h8v18a4 4 0 0 1-8 0Z" fill="currentColor" fill-opacity=".3"/>`).join('') + `<path d="M6 34h52M6 34v20M58 34v20"/></svg></span>`;

const CSS = `<style>
@keyframes mkflow{to{stroke-dashoffset:-36}} .mkflow{animation:mkflow 1.1s linear infinite}
.mk-node>span:first-child{flex-shrink:0} .mk-node{position:absolute;display:flex;gap:16px;align-items:center;padding:14px 22px 14px 16px;border-radius:var(--r);background:rgba(255,255,255,.86);border:1px solid var(--line);box-shadow:0 8px 22px -12px rgba(30,45,80,.25);font:500 27px/1.15 var(--sans);color:var(--ink2);letter-spacing:-.005em}
.mk-chip{display:inline-flex;gap:10px;align-items:center;padding:9px 20px 10px;border-radius:999px;border:1.5px solid ${alpha(INK, .16)};background:rgba(255,255,255,.75);font:600 23px/1 var(--sans);color:var(--mute);transition:all .5s}
.mk-chip b{font:700 22px/1 var(--sans);opacity:.8}
.mk-chip.act{color:var(--ink);background:#fff;box-shadow:0 8px 24px rgba(30,45,80,.14);transform:scale(1.06)}
.mk-panel{position:absolute;left:96px;top:300px;width:660px;height:600px;display:flex}
.mk-panel .num{display:flex;align-items:center;gap:16px;font:500 22px/1 var(--mono);margin:0 0 26px}
.mk-panel .num span{color:var(--mute)} .mk-panel .num i{display:block;width:56px;height:2px;border-radius:1px;background:currentColor}
.mk-panel h4{margin:0 0 20px;font:400 60px/1.02 var(--serif);color:var(--ink);letter-spacing:-.015em;text-wrap:balance}
.mk-panel p{margin:0;font:400 30px/1.38 var(--sans);color:var(--ink2);max-width:600px}
.mk-panel .key{position:static;margin-top:44px;font:italic 400 32px/1.3 var(--serif);color:var(--ink);text-shadow:none;max-width:560px}
.mk-bar{display:grid;grid-template-columns:232px 1fr;gap:16px;align-items:center;font:600 24px/1 var(--sans);color:var(--ink2);margin-top:20px}
.mk-bar i{display:block;height:22px;border-radius:11px;background:${PAL.gold};width:100%;transform:scaleX(0);transform-origin:left;transition:transform 1.2s cubic-bezier(.3,0,.2,1)}
</style>`;

// screen px -> world (z = 0) for the fixed camera at z = 10, fov 40
const WH = 2 * 10 * Math.tan(20 * Math.PI / 180), WW = WH * 16 / 9;
const SX = px => (px / 1920 - .5) * WW, SY = py => (.5 - py / 1080) * WH;
// enzyme placement per beat: [screen x, screen y, scale]
const ENZ = { 0: [520, 600, 1.3], 5: [455, 719, 1.04] };
const ALT = { liver: 1, kidney: .42, heart: .16, muscle: .1 }; // relative ALT content (schematic: liver >> kidney > heart > skeletal muscle)
const PER0 = 1.6, PER5 = 5.4;
const bez = (o, a, b, c, k) => { const u = 1 - k; return o.set(u * u * a.x + 2 * u * k * b.x + k * k * c.x, u * u * a.y + 2 * u * k * b.y + k * k * c.y, u * u * a.z + 2 * u * k * b.z + k * k * c.z); };

export default {
  id: 'marker', chapter: 1, beats: 6, title: 'Markatzaile entzimatiko on bat', bloom: .6,
  // the glass body of beat 6 match-cuts into the glass body of the tissues slide
  bridgeIn: { focus() { return this.E.group.getWorldPosition(_bf); } },
  bridge: { mode: 'dive', focus() { return this.B.group.localToWorld(_bf.set(0, .05, 0)); } },
  build(layer) {
    const S = makeScene({ gx: .5, gy: .5, dust: 90 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 40, drift: .03 });
    // ---- the hero enzyme (beat 1) that becomes the lock of the lock-and-key model (beat 6)
    const E = makeDockEnzyme(); this.E = E; this.scene.add(E.group);
    E.group.add(this.sub2 = E.sub.clone()); this.prods = [...E.prod, E.prod[0].clone(), E.prod[1].clone()]; E.group.add(this.prods[2], this.prods[3]);
    this.enzX = new Tw(SX(ENZ[0][0])); this.enzY = new Tw(SY(ENZ[0][1])); this.enzS = new Tw(ENZ[0][2]);
    const shadow = contactShadow({ size: 2.6, opacity: .16 }); shadow.position.set(0, -1.15, 0); E.group.add(shadow);
    // fixed points of the docking paths (enzyme-local)
    const P = E.pocket, d = E.d;
    this.pt = {
      dock: P.clone().addScaledVector(d, .1),
      ent: P.clone().addScaledVector(d, .75),
      s0: P.clone().addScaledVector(d, 1.1).add(V(-.52, .48, 0)),
      exitR: P.clone().addScaledVector(d, .9).add(V(1.35, .7, 0)), // products leave towards the "signal" line and vanish before reaching the title
      w0: P.clone().addScaledVector(d, .86).add(V(1.0, -.25, 0)),
      wHit: P.clone().addScaledVector(d, .86),
      w1: P.clone().addScaledVector(d, .86).add(V(.85, -.55, 0)),
      wMid: P.clone().addScaledVector(d, .86).add(V(.5, -.08, 0)),
    };
    this.tp = V(0, 0, 0); this.tq = V(0, 0, 0);
    // ---- glass body with ALT distribution (beat 6)
    const B = makeBody(ALT); this.B = B; this.scene.add(B.group);
    B.group.position.set(SX(1110), SY(690) - .08, 0); this.bodyK = new Tw(0); B.group.scale.setScalar(.001);
    this.spark = new Pts(26); B.group.add(this.spark.mesh); this.cGold = C(COL3.gold);

    // ---- text
    layer.insertAdjacentHTML('beforeend', CSS);
    add(layer, `<div class="eyebrow"><b>2</b>Igoeraren jatorria</div>`);
    add(layer, `<div class="h1">Markatzaile entzimatiko <em>erabilgarri</em> bat</div>`);
    // beat 1: the measurement is the starting point; the other data complete the interpretation
    add(layer, `<div class="abs fx d1" data-b="0-0" style="left:${520 - 220}px;top:830px;width:440px;text-align:center">
      <span class="pill" style="color:var(--amber);font-size:27px">Entzima bat neurtzea</span>
      <div style="margin-top:10px;font:italic 400 28px/1 var(--serif);color:var(--ink2);text-shadow:var(--halo)">= abiapuntua</div></div>`);
    const svg = el('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', class: 'fx fade d3', style: 'position:absolute;left:0;top:0;overflow:visible' }); svg.dataset.b = '0-0'; layer.appendChild(svg);
    const NODES = [['tubes', 'beste markatzaileak', 400], ['clock', 'laginaren unea', 600], ['patient', 'datu klinikoak', 800]];
    const IX = 1470, IY = 600;
    const enzPath = `M720 560 C840 200 1300 190 ${IX} ${IY - 30}`;
    el('path', { d: enzPath, fill: 'none', stroke: alpha(PAL.amber, .22), 'stroke-width': 12, 'stroke-linecap': 'round' }, svg);
    el('path', { d: enzPath, fill: 'none', stroke: PAL.amber, 'stroke-width': 5, 'stroke-dasharray': '3 15', 'stroke-linecap': 'round', class: 'mkflow' }, svg);
    NODES.forEach(([, , y]) => {
      const dd = `M1265 ${y} C1360 ${y} 1370 ${IY} ${IX} ${IY}`;
      el('path', { d: dd, fill: 'none', stroke: alpha(INK, .14), 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
      el('path', { d: dd, fill: 'none', stroke: INK2, 'stroke-width': 3.5, 'stroke-dasharray': '3 15', 'stroke-linecap': 'round', class: 'mkflow' }, svg);
    });
    add(layer, `<div class="abs fx d2" data-b="0-0" style="left:1000px;top:236px;font:700 24px/1 var(--sans);color:var(--amber);text-shadow:var(--halo);letter-spacing:.5px">jarduera · U/L</div>`);
    NODES.forEach(([ic, txt, y], i) => add(layer, `<div class="mk-node fx pop d${i + 2}" data-b="0-0" style="left:888px;top:${y - 40}px;width:377px;white-space:nowrap">${ic === 'tubes' ? TUBES : icon(ic, 52, INK2)}<span>+ ${txt}</span></div>`));
    add(layer, `<div class="mk-node fx pop d5" data-b="0-0" style="left:${IX}px;top:${IY - 78}px;width:350px;flex-direction:column;gap:10px;padding:22px 20px;border:2px solid ${alpha(INK, .5)}">
      ${icon('target', 64, INK)}<span style="font:700 34px/1 var(--sans);color:var(--ink)">interpretazioa</span></div>`);

    // beats 2-5: one property at a time, big; the others wait as chips in a row
    const cards = [
      ['Ehun-espezifikotasuna', 'Aldaketa jatorri tisular jakin batekin lotzea', 'ALT gibelean nagusitzen da; LDH ehun askotan dago', PAL.gold],
      ['Sentikortasuna', 'Ehunaren aldaketak odolean hautematea', 'Markatzaile sentikorrak kalte txikia ere hautematen du', PAL.blue],
      ['Errepikagarritasuna', 'Baldintza berean, emaitza antzekoak', 'Lagin bera, behin eta berriz neurtuta', PAL.teal],
      ['Zehaztasun analitikoa', 'Jarduera katalitikoa fidagarritasunez neurtzea', 'Errepikagarria izatea ez da zehatza izatea', PAL.amber],
    ];
    const chipRow = add(layer, `<div class="abs" style="display:none"></div>`); // (the property tabs are gone: each property is named in the text block)
    this.chips = cards.map(([h4], i) => { const c = document.createElement('div'); c.className = 'mk-chip'; c.innerHTML = `<b>${i + 1}</b>${h4}`; c.style.setProperty('--c', cards[i][3]); chipRow.appendChild(c); return c; });
    this.panels = cards.map(([h4, p, key, c], i) => add(layer, `<div class="mk-panel fx l" data-b="${i + 1}-${i + 1}">
      <div style="width:660px;display:flex;flex-direction:column">
        <div class="num" style="color:${c}">0${i + 1}<span>/ 04</span><i></i></div><h4>${h4}</h4><p>${p}</p>
        <div class="key" style="border-left:2px solid ${c};padding-left:22px">${key}</div></div>
      </div>`));
    this.caption=add(layer,'<div class="abs" data-b="1-4" style="left:855px;right:130px;top:860px;text-align:center;font:600 26px/1.4 var(--sans)"> </div>');
    add(layer,'<div class="note" data-b="1-4" style="left:855px;right:130px;top:916px;text-align:center">eskematikoa</div>');
    this.bench=markerBench(this.scene,layer);
    this.b = 0;

    // beat 6: substrate specificity (lock and key, left) vs tissue specificity (ALT in the body, right)
    const head = (x, c, t, p, cls) => add(layer, `<div class="abs fx ${cls}" data-b="5" style="left:${x}px;top:246px;width:800px">
      <div style="width:48px;height:2px;border-radius:1px;background:${c};margin-bottom:16px"></div>
      <div style="font:400 44px/1.08 var(--serif);color:var(--ink);letter-spacing:-.01em">${t}</div>
      <div style="font:400 27px/1.4 var(--sans);color:var(--ink2);margin-top:8px">${p}</div></div>`);
    head(110, PAL.teal, 'Substratuarekiko espezifikotasuna', 'Entzimak <b style="color:var(--ink);font-weight:600">zer molekulari</b> eragiten dion', 'l');
    head(1024, PAL.gold, 'Ehun-espezifikotasuna', '<b style="color:var(--ink);font-weight:600">Zein ehunetan</b> dagoen eta zenbateraino nagusitzen den', 'r d1');
    add(layer, `<div class="abs" style="left:916px;top:250px;width:84px;height:760px;display:flex;justify-content:center"><div class="fx fade" data-b="5" style="width:2px;height:100%;background:linear-gradient(${alpha(INK, 0)},${alpha(INK, .16)} 15%,${alpha(INK, .16)} 85%,${alpha(INK, 0)})"></div></div>`);
    const bars = [['liver', 'Gibela'], ['kidney', 'Giltzurruna'], ['heart', 'Bihotza'], ['muscle', 'Muskulu eskeletikoa']];
    const bp = add(layer, `<div class="abs fx r d2" data-b="5" style="left:1322px;top:470px;width:510px">
      <div style="font:700 26px/1 var(--sans);color:var(--gold);text-shadow:var(--halo)">ALT ehunetan <span style="font:italic 400 22px/1 var(--serif);color:var(--mute)">· eskematikoa</span></div>
      ${bars.map(([k, n]) => `<div class="mk-bar"><span>${n}</span><div style="height:22px;border-radius:11px;background:${alpha(PAL.gold, .1)}"><i data-k="${k}"></i></div></div>`).join('')}</div>`);
    this.barEls = [...bp.querySelectorAll('i')];
    this.labs = [
      new Label(layer, 'substratua ✓', { color: PAL.teal, b: '5' }),
      new Label(layer, '✗ ez da sartzen', { color: PAL.violet, b: '5' }),
      new Label(layer, 'gune aktiboa', { color: PAL.teal, anchor: P.clone().addScaledVector(E.e, -.5).addScaledVector(d, -.1).add(V(0, -.12, 0)), obj: E.group, side: 'l', b: '5' }),
      // organs named on the body, same order as the bars
      ...[['liver', 'Gibela', 'l'], ['kidney', 'Giltzurrunak', 'r'], ['heart', 'Bihotza', 'r'], ['muscle', 'Muskulua', 'l']].map(([k, n, sd]) => {
        const o = this.B.organs.find(z => z.key === k), m = o.meshes[0];
        const a = m.position.clone(); a.x += sd === 'l' ? -m.scale.x * 1.05 : m.scale.x * 1.05;
        if (k === 'kidney') a.copy(o.meshes[1].position).add(V(.07, 0, 0));
        if (k === 'muscle') a.x = m.position.x - .1;
        return new Label(layer, n, { color: o.level > .5 ? PAL.gold : INK2, anchor: a, obj: this.B.group, side: sd, b: '5' }); }),
    ];
    for (let i = 3; i < 7; i++) this.labs[i].el.querySelector('.t').style.fontSize = '22px';
    this.labs[2].el.classList.add('bg');
    this.m4 = new THREE.Matrix4();
  },
  enter(b) { this.rig.arrive(V(0, 0, 10), V(0, 0, 0), 40); this.beat(b, 0, true); },
  beat(b, dir, instant) {
    this.b = b; this.focusDelay=b===5?2.5:0; const aim=b===3||b===4?.17:0;
    this.rig.go(V(aim,0,10-aim*2.2),V(aim,0,0),1.8,40);
    this.chips.forEach((c, i) => { const on = i + 1 === b; c.classList.toggle('act', on); c.style.color = on ? c.style.getPropertyValue('--c') : ''; c.style.borderColor = on ? c.style.getPropertyValue('--c') : ''; });
    const pose = ENZ[b];
    const d = instant ? 0 : 1.3;
    if (pose) { this.enzX.to(SX(pose[0]), d, ease.io); this.enzY.to(SY(pose[1]), d, ease.io); this.enzS.to(pose[2], instant ? 0 : 1.1, ease.out); }
    else this.enzS.to(0, instant ? 0 : .7, ease.in);
    this.bodyK.to(b === 5 ? 1 : 0, instant ? 0 : 1.2, b === 5 ? ease.out : ease.in);
    if (b === 5 && this.t5 == null) this.t5 = -1; // restart the docking cycle on arrival
    if (b !== 5) this.t5 = null;
    this.barEls.forEach((e, i) => { e.style.transitionDelay = b === 5 ? (.5 + i * .15) + 's' : '0s'; e.style.transform = 'scaleX(' + (b === 5 ? ALT[e.dataset.k] : 0) + ')'; });
  },
  // place one moving piece (enzyme-local) with a scale
  put(m, p, s) { m.position.copy(p); m.scale.setScalar(Math.max(.001, s)); m.visible = s > .002; },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const E = this.E, pt = this.pt, b = this.b;
    // enzyme pose
    const es = this.enzS.v; E.group.visible = es > .01;
    E.group.position.set(this.enzX.v, this.enzY.v + Math.sin(t * .7) * .03, 0); E.group.scale.setScalar(Math.max(.001, es));
    E.group.rotation.set(Math.sin(t * .4) * .05, Math.sin(t * .31) * .08 - .1, 0);
    for (const m of [E.sub, this.sub2, ...this.prods, E.wrong]) m.visible = false;
    let flash = 0;
    const subVis = [0, 0];
    if (E.group.visible && b === 0) {
      // a steady stream of turnovers: substrate docks, is converted, two products leave towards the "signal" line
      for (let j = 0; j < 2; j++) {
        const ev = Math.floor(t / PER0) - j, u = t - ev * PER0, sub = j ? this.sub2 : E.sub, odd = ((ev % 2) + 2) % 2;
        if (u < 1.2) { const k = ease.io(u / 1.2); bez(this.tp, pt.s0, pt.ent, pt.dock, k); this.put(sub, this.tp, clamp(u * 4)); }
        else if (u < 1.6) { this.put(sub, pt.dock, 1); flash = Math.max(flash, Math.sin((u - 1.2) / .4 * Math.PI)); }
        else if (u < 2.9) { const k = (u - 1.6) / 1.3;
          for (let q = 0; q < 2; q++) { const pr = this.prods[odd * 2 + q]; bez(this.tp, pt.dock, pt.ent, pt.exitR, ease.out(k)); this.tp.addScaledVector(E.e, (q ? .16 : -.16) * (1 + k * 2)); this.tp.y += (q ? .1 : -.1) * k;
            this.put(pr, this.tp, clamp((1 - k) * 4)); pr.rotation.z = k * (q ? 2 : -2); } }
      }
    }
    if (E.group.visible && b === 5) {
      if (this.t5 === -1) this.t5 = t;
      const u = (t - this.t5) % PER5;
      // the right substrate fits the slot and is converted
      if (u < 1.4) { bez(this.tp, pt.s0, pt.ent, pt.dock, ease.io(u / 1.4)); this.put(E.sub, this.tp, clamp(u * 4)); subVis[0] = clamp(u * 3); }
      else if (u < 2.1) { this.put(E.sub, pt.dock, 1); flash = Math.sin((u - 1.4) / .7 * Math.PI); subVis[0] = 1; }
      else if (u < 3.3) { const k = (u - 2.1) / 1.2;
        for (let q = 0; q < 2; q++) { const pr = this.prods[q]; this.tp.lerpVectors(pt.dock, pt.ent, ease.out(clamp(k * 2))); this.tp.addScaledVector(E.d, k * 1.2).addScaledVector(E.e, (q ? .16 : -.16) + (q ? 1 : -1) * k * .9);
          this.put(pr, this.tp, clamp((1 - k) * 3)); pr.rotation.z = k * (q ? 2 : -2); } }
      // a molecule of the wrong shape bumps against the rim and bounces off
      const w = E.wrong;
      if (u > 2.6 && u < 5.2) {
        let s = 1, sq = 0;
        if (u < 3.7) { const k = ease.in(clamp((u - 2.6) / 1.1)); bez(this.tp, pt.w0, pt.wMid, pt.wHit, k); s = clamp((u - 2.6) * 3); }
        else if (u < 3.9) { this.tp.copy(pt.wHit); sq = Math.sin((u - 3.7) / .2 * Math.PI); }
        else { const k = ease.out(clamp((u - 3.9) / 1.3)); this.tp.lerpVectors(pt.wHit, pt.w1, k); s = 1 - clamp((u - 4.6) / .6); w.rotation.z = k * 4; w.rotation.x = k * 2; }
        if (u < 3.9) { w.rotation.z = Math.sin(t * 2) * .3; w.rotation.x = .3; }
        this.put(w, this.tp, s); const ws = s * 1.3; w.scale.set(ws * (1 + sq * .18), ws * (1 - sq * .22), ws);
        subVis[1] = clamp((u - 2.8) * 3) * (1 - clamp((u - 4.8) * 3));
      }
    }
    E.siteHalo.material.opacity = flash * .7;
    E.mesh.scale.setScalar(1 + flash * .025);
    if (subVis[0]) {E.sub.getWorldPosition(this.labs[0].anchor); this.labs[0].anchor.x-=.45*es;}
    if (subVis[1]) E.wrong.getWorldPosition(this.labs[1].anchor).y += .3 * es; // label above the molecule: it never reaches the divider
    this.labs[0].vis = subVis[0]; this.labs[1].vis = subVis[1]; this.labs[2].vis = E.group.visible && b === 5 ? 1 : 0;
    // body: organs glow by their ALT content; ALT-coloured specks drift off the liver
    const bk = this.bodyK.v, B = this.B; B.group.visible = bk > .01; B.group.scale.setScalar(Math.max(.001, bk * 1.28));
    if (B.group.visible) {
      B.group.rotation.y = Math.sin(t * .35) * .22;
      for (const o of B.organs) o.halo.material.opacity = o.level * (.42 + .14 * Math.sin(t * 2 + o.ph)) * bk;
      const L = B.organs[0].meshes[0].position;
      for (let i = 0; i < 26; i++) { const u = (t * .25 + i / 26) % 1, a = i * 2.4;
        this.spark.set(i, L.x + Math.cos(a) * (.12 + u * .35), L.y + Math.sin(a * 1.3) * .08 + u * .25, L.z + .12 + Math.sin(a) * .1, .05, this.cGold, Math.sin(u * Math.PI) * .9 * bk); }
      this.spark.commit();
    }
    for (let i = 3; i < 7; i++) this.labs[i].vis = clamp(bk * 2 - 1);
    for (const l of this.labs) l.update(this.camera);
    // run only the simulation that is on stage
    this.bench(b,t,this.caption,this.camera); if(b===5&&this.focusDelay>0&&(this.focusDelay-=dt)<=0) this.rig.go(V(.14,.01,9.83),V(.14,.01,0),2.2,40);
  },
};
