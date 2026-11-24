// 5 · Lesion intensity vs enzyme activity: two different injuries can give the same plasma value.
// Live arithmetic: every coral dot is one enzyme. Damaged cells release their dots, the dots fly into the tube,
// and the counters tick: damaged cells × enzymes per cell = enzymes in plasma (schematic numbers).
import { THREE, Tw, add, ease, rng, clamp, screenOf } from '../core.js';
import { makeScene, glassCylinder, C, COL3, contactShadow } from '../lib3d.js';
import { PAL, INK, MUTE, LINE, LINE2, AXIS, PAPER, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { balanceModel } from '../sim.js';
import { el } from '../chart.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const COLS = 11, ROWS = 8, HR = .2, NCELL = COLS * ROWS;
const FLY = 1.3;       // flight time of one enzyme (s of beat time)
const KEND = 4.7;      // the whole release plays in this many seconds
const TOTAL = 30;      // both sides end with 30 enzymes in plasma
const TUBE_Y = 1.25, TUBE_H = 1.9, FILL_MAX = 1.5;
const SIDES = [
  { x: -2.75, nd: 30, per: 1, gap: 2.6 / 30, title: 'Ehun asko kaltetuta', sub: 'entzima gutxi zelulako' },
  { x: 2.75, nd: 5, per: 6, gap: .6, title: 'Ehun gutxi kaltetuta', sub: 'entzima asko zelulako' },
];
const RING = [[0, 0]]; for (let j = 0; j < 6; j++) RING.push([Math.cos(j / 6 * 6.283 + .5) * .1, Math.sin(j / 6 * 6.283 + .5) * .1]);

// light tissue: pale cytosol hex cells; a damaged cell shrinks, empties to grey and flashes once as it breaks
export function tissueSlab() {
  const geo = new THREE.CylinderGeometry(HR * .93, HR * .93, .22, 6); geo.rotateY(Math.PI / 6);
  const aDmg = new Float32Array(NCELL);
  geo.setAttribute('aDmg', new THREE.InstancedBufferAttribute(aDmg, 1));
  const mat = new THREE.MeshStandardMaterial({ color: '#F3BFA8', roughness: .55, metalness: 0, envMapIntensity: .75 });
  const flash = { value: C(COL3.coral) };
  mat.onBeforeCompile = s => {
    s.uniforms.uFl = flash;
    s.vertexShader = 'attribute float aDmg; varying float vDmg;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vDmg = aDmg; transformed.y *= 1. - aDmg * .62; transformed.xz *= 1. - aDmg * .14;');
    s.fragmentShader = 'uniform vec3 uFl; varying float vDmg;\n' + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34,.36,.47), vDmg);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uFl * vDmg * (1. - vDmg) * 1.6;');
  };
  const m = new THREE.InstancedMesh(geo, mat, NCELL);
  const pos = []; const d = new THREE.Object3D(); const w = Math.sqrt(3) * HR;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c; const x = (c - (COLS - 1) / 2 + (r % 2) * .5) * w, z = (r - (ROWS - 1) / 2) * 1.5 * HR;
    d.position.set(x, 0, z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); pos.push(V(x, 0, z));
  }
  return { mesh: m, pos, aDmg, geo };
}

const dotGeo = new THREE.IcosahedronGeometry(.05, 1);
const dotMat = new THREE.MeshStandardMaterial({ color: COL3.coral, roughness: .4, envMapIntensity: .7, emissive: C(COL3.coral), emissiveIntensity: .08 });
const KM = balanceModel({ peak: .8, k: 6, onset: .02, tRise: .14, shape: 2.2 });
const REF = .18;

export default {
  id: 'intensity', chapter: 1, beats: 4, title: 'Lesioaren intentsitatea eta entzimen jarduera', bloom: .5,
  bridgeIn: { focus() { return this.sc[0].g.getWorldPosition(_bf); } },
  bridge: { mode: 'register', scaleRatio: 1.12, focus() { return this.sc[1].tube.getWorldPosition(_bf); } },
  build(layer) {
    const S = makeScene({ glow: '#FFF1E6', gx: .5, gy: .6 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    const A0 = [V(0, 1.85, 15.5), V(0, .12, 0), 34], A1 = [V(4.05, 2.3, 19.8), V(4.05, -.1, 0), 34]; // framed so counters clear the title and the equations end above y = 970 // card on the right: both slabs shift left, clear of it
    this.shots = [A0, [V(.42,1.65,15.6),V(.18,.1,0),34], A1, A1];
    this.rig = new CamRig(this.camera, this.shots[0][0], this.shots[0][1], { fov: 34, drift: .04 });
    const R = rng(9);
    const m4 = new THREE.Matrix4();
    this.sc = SIDES.map(cfg => {
      const g = new THREE.Group(); g.position.set(cfg.x, -1.15, 0); g.rotation.x = .38; this.scene.add(g);
      const s = tissueSlab(); g.add(s.mesh); g.updateMatrixWorld(true);
      const sh = contactShadow({ size: 1, opacity: .14 }); sh.scale.set(5.2, 3, 1); sh.position.set(cfg.x, -1.62, .3); this.scene.add(sh);
      // damaged cells: a patch around the centre (big patch on the left, a small one on the right)
      const order = s.pos.map((p, i) => [p.length() + R() * .18, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
      const dmg = order.slice(0, cfg.nd).map((i, k) => ({ i, st: k * cfg.gap }));
      const dmgOf = new Map(dmg.map(d => [d.i, d]));
      // one dot per enzyme, sitting on its cell
      const n = NCELL * cfg.per; const dots = new THREE.InstancedMesh(dotGeo, dotMat, n); dots.frustumCulled = false;
      dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(dots);
      const movers = []; let k = 0;
      for (let c = 0; c < NCELL; c++) for (let j = 0; j < cfg.per; j++, k++) {
        const o = cfg.per === 1 ? RING[0] : RING[j + 1];
        const p = s.pos[c].clone(); p.x += o[0]; p.z += o[1]; p.y = .17; g.localToWorld(p);
        m4.makeTranslation(p.x, p.y, p.z); dots.setMatrixAt(k, m4);
        const d = dmgOf.get(c);
        if (d) movers.push({ k, rest: p, launch: d.st + .25 + j * .07, ph: R() * 6.28 });
      }
      movers.sort((a, b) => a.launch - b.launch); movers.forEach((mv, i) => { mv.slot = i; });
      const tube = glassCylinder({ r: .36, h: TUBE_H }); tube.position.set(cfg.x, TUBE_Y, -.2); this.scene.add(tube);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.13,32),new THREE.MeshStandardMaterial({color:'#98714c',roughness:.55})); cap.position.y=TUBE_H/2; cap.castShadow=true; tube.add(cap); s.mesh.castShadow=true;
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, 1, 40), new THREE.MeshPhysicalMaterial({ color: COL3.coral, transparent: true, opacity: .34, roughness: .3, depthWrite: false }));
      fill.position.set(cfg.x, TUBE_Y - TUBE_H / 2, -.2); this.scene.add(fill);
      const meniscus = new THREE.Mesh(new THREE.TorusGeometry(.307, .022, 8, 40),
        new THREE.MeshBasicMaterial({ color: '#934c41' }));
      meniscus.rotation.x = Math.PI / 2;
      meniscus.position.copy(fill.position);
      this.scene.add(meniscus);
      // The same graduation scale lets the audience compare the two final levels directly.
      const strokes = [];
      for (let n = 0; n <= TOTAL; n += 5) {
        const y = TUBE_Y - TUBE_H / 2 + n / TOTAL * FILL_MAX;
        const len = n % 10 === 0 ? .20 : .11;
        strokes.push(cfg.x+.16,y,.12,cfg.x+.16+len,y,.12);
      }
      const marks = new THREE.BufferGeometry();
      marks.setAttribute('position',new THREE.Float32BufferAttribute(strokes,3));
      this.scene.add(new THREE.LineSegments(marks,new THREE.LineBasicMaterial({color:'#695d58',transparent:true,opacity:.68})));
      // DOM: equation under the slab, live count above the tube
      const eqEl = add(layer, `<div class="abs" style="left:0;top:0;width:420px;text-align:center;text-shadow:var(--halo)">
        <div style="font:700 26px/1.2 var(--sans);color:${INK}">${cfg.title}<span style="display:block;font-weight:400;font-size:23px;color:${MUTE}">${cfg.sub}</span></div>
        <div style="font:400 54px/1.05 var(--serif);color:${INK};margin-top:4px"><b class="nd" style="font-weight:600">0</b><span style="color:${MUTE};margin:0 14px">×</span><b style="font-weight:600;color:${PAL.coral}">${cfg.per}</b></div>
        <div style="font:500 22px/1.25 var(--sans);color:${MUTE}">zelula kaltetuta × entzima zelulako</div><div style="font:italic 400 22px/1.2 var(--serif);color:${MUTE}">eskematikoa</div></div>`);
      const numEl = add(layer, `<div class="abs" style="left:0;top:0;width:260px;text-align:center;text-shadow:var(--halo)">
        <div class="ar" style="font:500 70px/1 var(--serif);font-variant-numeric:lining-nums tabular-nums;letter-spacing:-.045em;color:${PAL.coral}">0</div>
        <div style="font:500 22px/1.2 var(--sans);color:${MUTE};margin-top:4px">entzima plasman</div></div>`);
      return { cfg, g, s, dmg, dots, movers, tube, fill, meniscus, eqEl, numEl, ndEl: eqEl.querySelector('.nd'), arEl: numEl.querySelector('.ar'), lastNd: -1, lastAr: -1,
        aTop: V(cfg.x, TUBE_Y + TUBE_H / 2 + .12, -.2), aBot: V(cfg.x, -1.7, 1.55) };
    });
    this.aEq = V(0, TUBE_Y + TUBE_H / 2 + .12, -.2);
    this.k = new Tw(0); this.m4 = m4; this.b = 0;

    add(layer, `<div class="eyebrow"><b>2</b>Igoeraren intentsitatea</div>`);
    add(layer, `<div class="h1">Lesioaren <em>intentsitatea</em> eta jarduera</div>`);
    add(layer, `<div class="key" data-b="-0" style="left:650px;width:620px;top:370px;bottom:auto;text-align:center;font-size:42px">Igoera handiagoa<br>= lesio handiagoa?</div>`);
    add(layer, `<div class="key" data-b="1-1" style="left:650px;width:620px;top:370px;bottom:auto;text-align:center;font-size:42px">Balio <em>bera</em>,<br>lesio <em>desberdinak</em></div>`);
    this.eq = add(layer, `<div class="abs" style="left:0;top:0;font:400 96px/1 var(--serif);color:var(--amber);text-shadow:var(--halo);opacity:0;transition:opacity .6s">=</div>`);

    // ---- beat 2: the four factors, with a live demo of the fourth (sampling time)
    const f = [['tissue', 'Zenbat ehun kaltetu den', '30 ↔ 5'], ['tube', 'Ehunak zenbat entzima duen', '1 ↔ 6'], ['muscle', 'Zelulek zenbat askatzen duten', ''], ['clock', 'Lagina noiz hartu den', '↓']];
    const card = add(layer, `<div class="card r" data-b="2-2" style="left:1225px;top:250px;width:615px">
      <h4>Balio berean eragiten dute:</h4>${f.map(([ic, txt, hint], i) => `<div class="fx d${i + 1}" data-b="2-2" style="display:flex;gap:18px;align-items:center;margin-top:14px;font:500 27px/1.2 var(--sans)">${icon(ic, 50, PAL.amber)}<span style="flex:1">${txt}</span><span style="font:600 22px/1 var(--sans);color:${PAL.coral}">${hint}</span></div>`).join('')}
      <div class="fx d5 demo" data-b="2-2" style="margin-top:14px;padding-top:12px;border-top:1px solid ${LINE}"></div>
      <p style="margin-top:14px;color:var(--mute);font-size:22px">Magnitudeak orientazioa ematen du, baina ezin da zuzenean lesioaren larritasun bihurtu</p></div>`);
    // mini simulation: the same lesion, sampled at a sweeping moment
    const svg = el('svg', { width: 580, height: 150, viewBox: '0 0 580 150', style: 'display:block;overflow:visible' }); card.querySelector('.demo').appendChild(svg);
    const X0 = 30, XW = 400, Y0 = 18, YH = 104, YM = .9, X = t => X0 + t * XW, Y = v => Y0 + YH - v / YM * YH;
    el('rect', { x: X0, y: Y(REF), width: XW, height: Y0 + YH - Y(REF), fill: alpha(INK, .05) }, svg);
    el('line', { x1: X0, x2: X0 + XW, y1: Y(REF), y2: Y(REF), stroke: LINE2, 'stroke-dasharray': '5 6', 'stroke-width': 1.5 }, svg);
    el('path', { d: `M${X0} ${Y0 - 4} V${Y0 + YH} H${X0 + XW + 10}`, fill: 'none', stroke: AXIS, 'stroke-width': 1.8 }, svg);
    let d = ''; for (let i = 0; i <= 120; i++) { const t = i / 120; d += (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(KM.A(t)).toFixed(1); }
    el('path', { d, fill: 'none', stroke: PAL.coral, 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: .85 }, svg);
    const tx = (x, y, s, txt, attrs = {}) => { const e = el('text', { x, y, 'font-size': s, fill: MUTE, 'font-family': 'var(--sans)', ...attrs }, svg); e.textContent = txt; return e; };
    tx(X0 + 6, Y0 - 8, 22, 'Lesio bera, lagin-une desberdinak');
    tx(X0 + XW + 10, Y0 + YH + 28, 22, 'lagin-unea', { 'text-anchor': 'end' });
    el('rect', { x: 476, y: Y0, width: 34, height: YH, rx: 8, fill: 'none', stroke: LINE2, 'stroke-width': 1.5 }, svg);
    this.dm = {
      line: el('line', { y1: Y0, y2: Y0 + YH, stroke: alpha(INK, .5), 'stroke-width': 1.6, 'stroke-dasharray': '3 5' }, svg),
      dot: el('circle', { r: 7, fill: PAL.coral, stroke: PAPER, 'stroke-width': 2.5 }, svg),
      bar: el('rect', { x: 480, width: 26, rx: 6, fill: alpha(PAL.coral, .75) }, svg),
      read: tx(493, Y0 + YH + 28, 22, '', { 'text-anchor': 'middle', 'font-weight': 700 }), X, Y,
    };
    el('line', { x1: 470, x2: 516, y1: Y(REF), y2: Y(REF), stroke: LINE2, 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }, svg);
    this.dmT0 = 0;

    add(layer, `<div class="card r" data-b="3" style="left:1225px;top:270px;width:615px">
      <h4><span style="color:var(--gold)">ALT</span> eta <span style="color:var(--orange)">AST</span> gibelean</h4>
      <div style="display:flex;gap:26px;margin-top:24px">
        <div style="flex:1;text-align:center"><svg viewBox="0 0 200 120" width="220"><path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="${LINE}" stroke-width="16" stroke-linecap="round"/><path d="M20 110 A80 80 0 0 1 166 70" fill="none" stroke="${PAL.gold}" stroke-width="16" stroke-linecap="round"/><line x1="100" y1="110" x2="158" y2="62" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="110" r="7" fill="${INK}"/></svg>
          <div style="font:700 25px/1.2 var(--sans);color:var(--gold)">Lesioa</div><p style="font-size:22px">zelulen kaltearen adierazlea</p></div>
        <div style="flex:1;text-align:center"><svg viewBox="0 0 200 120" width="220"><path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="${LINE2}" stroke-width="16" stroke-linecap="round" stroke-dasharray="4 10"/><text x="100" y="100" text-anchor="middle" font-size="64" fill="${MUTE}" font-family="Georgia">?</text></svg>
          <div style="font:700 25px/1.2 var(--sans);color:var(--ink2)">Funtzioa</div><p style="font-size:22px">bestelako datuak behar dira</p></div></div>
      <p style="margin-top:26px;font-size:25px;color:var(--ink)">Entzima-jarduera eta organoaren funtzioa <b style="color:var(--amber)">bereizita</b> interpretatu</p></div>`);
  },
  enter(b) { const s = this.shots[b]; this.rig.arrive(s[0], s[1], s[2]); this.k.set(b >= 1 ? KEND : 0); this.b = b; },
  beat(b, dir) {
    const s = this.shots[b]; this.rig.go(s[0], s[1], 1.8, s[2]); this.b = b;
    this.compareTime=b===1?0:-1;
    if (b >= 1) this.k.to(KEND, b === 1 && dir > 0 ? KEND : .01, ease.lin); else this.k.to(0, .6);
    if (b === 2) this.dmT0 = -1;
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    if(this.compareTime>=0){this.compareTime+=dt;if(this.compareTime>2.15){this.compareTime=-1;this.rig.go(V(.48,1.66,15.2),V(.18,.06,0),2.5,34); /* slight push-in: both equations stay above y = 970 */}}
    const k = this.k.v, m4 = this.m4, cam = this.camera;
    let done = true;
    for (const s of this.sc) {
      const { aDmg } = s.s; let nd = 0;
      for (const d of s.dmg) { aDmg[d.i] = clamp((k - d.st) * 3); if (k > d.st + .001) nd++; }
      s.s.geo.attributes.aDmg.needsUpdate = true;
      let arrived = 0; const { x } = s.cfg;
      for (const mv of s.movers) {
        const u = clamp((k - mv.launch) / FLY);
        const li = Math.floor(mv.slot / 5), an = (mv.slot % 5) / 5 * 6.283 + li * .63;
        const tx = x + Math.cos(an) * .19, ty = TUBE_Y - TUBE_H / 2 + .14 + li * .25 + Math.sin(t * 1.3 + mv.ph) * .025, tz = -.2 + Math.sin(an) * .19;
        let px, py, pz;
        if (u <= 0) { px = mv.rest.x; py = mv.rest.y; pz = mv.rest.z; }
        else if (u >= 1) { px = tx; py = ty; pz = tz; arrived++; }
        else { const e = ease.io(u); px = mv.rest.x + (tx - mv.rest.x) * e; pz = mv.rest.z + (tz - mv.rest.z) * e; py = mv.rest.y + (ty - mv.rest.y) * e + Math.sin(u * Math.PI) * 1.5; }
        m4.makeTranslation(px, py, pz); s.dots.setMatrixAt(mv.k, m4);
      }
      s.dots.instanceMatrix.needsUpdate = true;
      const lvl = arrived / TOTAL * FILL_MAX;
      s.fill.scale.y = Math.max(.001, lvl); s.fill.position.y = TUBE_Y - TUBE_H / 2 + lvl / 2; s.fill.visible = lvl > .002;
      s.meniscus.visible = s.fill.visible;
      s.meniscus.position.y = s.fill.position.y + lvl / 2;
      if (nd !== s.lastNd) { s.ndEl.textContent = nd; s.lastNd = nd; }
      if (arrived !== s.lastAr) { s.arEl.textContent = arrived; s.lastAr = arrived; }
      if (arrived < TOTAL) done = false;
      const pb = screenOf(s.aBot, cam), pt = screenOf(s.aTop, cam);
      s.eqEl.style.transform = `translate(${(pb.x - 210).toFixed(1)}px,${pb.y.toFixed(1)}px)`;
      s.numEl.style.transform = `translate(${(pt.x - 130).toFixed(1)}px,${(pt.y - 108).toFixed(1)}px)`;
    }
    // "=" between the two live counts, once both are complete
    const pe = screenOf(this.aEq, cam);
    this.eq.style.transform = `translate(${(pe.x - 28).toFixed(1)}px,${(pe.y - 104).toFixed(1)}px)`;
    this.eq.style.opacity = this.b >= 1 && done ? 1 : 0;
    // mini demo: the sampling moment sweeps across the same curve
    if (this.b === 2) {
      if (this.dmT0 < 0) this.dmT0 = t;
      const ts = clamp(((t - this.dmT0) % 6.5) / 5.2) * .96 + .02, v = KM.A(ts), dm = this.dm;
      const x = dm.X(ts), y = dm.Y(v);
      dm.line.setAttribute('x1', x); dm.line.setAttribute('x2', x); dm.dot.setAttribute('cx', x); dm.dot.setAttribute('cy', y);
      dm.bar.setAttribute('y', y); dm.bar.setAttribute('height', Math.max(0, dm.Y(0) - y));
      const hi = v > REF; dm.read.textContent = hi ? '▲ altu' : 'tartean'; dm.read.setAttribute('fill', hi ? PAL.coral : MUTE);
    }
  },
};
