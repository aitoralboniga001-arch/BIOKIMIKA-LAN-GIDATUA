// 6 · Appearance kinetics, driven by the one-compartment balance model (sim.js):
// plasma activity changes by (arrival from the tissue) − (removal from the plasma). Both flows are shown as particle streams
// and bars whose sizes come from rel(t) and elim(t); the curve is drawn by the running simulation; the tube reads the cursor.
import { THREE, Tw, add, ease, rng, clamp, smooth, Label } from '../core.js';
import { makeScene, bloodTube, instancedBlobs, C, COL, COL3, halo, Pts, contactShadow } from '../lib3d.js';
import { PAL, INK, MUTE, LINE, PAPER, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { Chart, el } from '../chart.js';
import { balanceModel } from '../sim.js';
import { hexPatch, clearZone } from './s06_kinetics_parts.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

// a sample tube whose plasma holds as many enzymes as the curve says
export function tubeMeter(scene, { x = -3.3, y = -1.6, s = .82, color = COL.coral, n = 70, seed = 5, label = false } = {}) {
  const tb = bloodTube({ label }); const g = tb.group; g.position.set(x, y, 0); g.scale.setScalar(s); g.rotation.z = -.05; scene.add(g);
  const bl = instancedBlobs(n, { r: .05, glow: .4, seed }); g.add(bl);
  const R = rng(seed * 13); const A = []; const { y0, y1, r } = tb.plasma;
  for (let i = 0; i < n; i++) { const an = R() * 6.28, rr = Math.sqrt(R()) * r; A.push({ x: Math.cos(an) * rr, y: y0 + R() * (y1 - y0), z: Math.sin(an) * rr, ph: R() * 6.28, sp: .4 + R() * .6, k: R() }); bl.setColorAt(i, C(color)); }
  bl.instanceColor.needsUpdate = true;
  const glow = halo(color, 2.4, 0); glow.position.set(0, (y0 + y1) / 2, .1); g.add(glow);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = V(1, 1, 1), p = V(0, 0, 0), ax = V(.2, 1, .1).normalize();
  let vs = 0;
  return {
    group: g, tube: tb,
    update(t, dt, v) {
      vs += (v - vs) * (1 - Math.exp(-dt * 5));
      const shown = vs * n; g.rotation.y = Math.sin(t * .4) * .3;
      for (let i = 0; i < n; i++) { const a = A[i]; const on = clamp(shown - i, 0, 1);
        p.set(a.x + Math.sin(t * a.sp + a.ph) * .05, a.y + Math.sin(t * a.sp * .7 + a.ph) * .06, a.z + Math.cos(t * a.sp + a.ph) * .05);
        q.setFromAxisAngle(ax, t * a.sp + a.ph); sv.setScalar(Math.max(.001, on)); m4.compose(p, q, sv); bl.setMatrixAt(i, m4); }
      bl.instanceMatrix.needsUpdate = true;
      glow.material.opacity = clamp(vs * 1.3) * .3;
      tb.plasmaMat.uniforms.uI.value = .25 + vs * .5;
    },
  };
}

// particle streams along quadratic Bézier paths; emission rate is set every frame from a model flow
const _r = rng(31), _blank = new THREE.Color(1, 1, 1);
export class Flow {
  constructor(scene, n = 160, size = .12) {
    this.pts = new Pts(n); scene.add(this.pts.mesh); this.n = n; this.size = size; this.next = 0; this.scene = scene; this.frag = null;
    this.P = Array.from({ length: n }, () => ({ live: false, age: 0, life: 1, a: V(0, 0, 0), b: V(0, 0, 0), c: V(0, 0, 0), col: _blank, out: false }));
  }
  // from(out, rnd) / to(out, rnd) fill a start / end point; out: true = the particle fades away at the end (removal)
  // sink: true = the particle keeps its colour until the end point, then breaks into three fragments that drift apart and fade (degraded)
  stream({ from, ctrl, to, color, life = 1.1, out = false, sink = false, jit = .25 }) {
    if (sink && !this.frag) { this.frag = new Pts(this.n * 3); this.scene.add(this.frag.mesh); }
    return { from, ctrl, to, col: C(color), life, out, sink, jit, acc: 0 };
  }
  emit(s, rate, dt) {
    s.acc += rate * dt;
    while (s.acc >= 1) {
      s.acc -= 1; const p = this.P[this.next]; this.next = (this.next + 1) % this.n;
      p.live = true; p.age = 0; p.life = s.life * (.85 + _r() * .3); p.col = s.col; p.out = s.out; p.sink = s.sink; p.ph = _r() * 6.28;
      s.from(p.a, _r); p.b.copy(s.ctrl); p.b.x += (_r() - .5) * s.jit; p.b.y += (_r() - .5) * s.jit; s.to(p.c, _r);
    }
  }
  clear() { for (const p of this.P) p.live = false; }
  update(dt) {
    const F = this.frag;
    for (let i = 0; i < this.n; i++) {
      const p = this.P[i];
      if (p.live) { p.age += dt; if (p.age >= p.life) p.live = false; }
      if (!p.live || !p.sink) if (F) for (let j = 0; j < 3; j++) F.set(i * 3 + j, 0, 0, 0, 0, _blank, 0);
      if (!p.live) { this.pts.set(i, 0, 0, 0, 0, _blank, 0); continue; }
      const u = p.age / p.life, w = 1 - u;
      let x = w * w * p.a.x + 2 * w * u * p.b.x + u * u * p.c.x, y = w * w * p.a.y + 2 * w * u * p.b.y + u * u * p.c.y, z = w * w * p.a.z + 2 * w * u * p.b.z + u * u * p.c.z;
      if (p.sink) {   // flight to the zone (first 62 %), then the molecule falls apart: three fragments drift apart and fade
        const v = clamp((u - .62) / .38), vs = smooth(clamp(v * 3)), u2 = Math.min(1, u / .62), w2 = 1 - u2;
        x = w2 * w2 * p.a.x + 2 * w2 * u2 * p.b.x + u2 * u2 * p.c.x; y = w2 * w2 * p.a.y + 2 * w2 * u2 * p.b.y + u2 * u2 * p.c.y; z = w2 * w2 * p.a.z + 2 * w2 * u2 * p.b.z + u2 * u2 * p.c.z;
        this.pts.set(i, x, y, z, this.size * (1 - .8 * vs), p.col, Math.min(1, u * 7) * (1 - vs));
        const fa = v > 0 ? (1 - smooth(clamp((v - .35) / .65))) * .95 : 0, d = .05 + .2 * v;
        for (let j = 0; j < 3; j++) { const an = p.ph + j * 2.094 + v * 1.5;
          F.set(i * 3 + j, x + Math.cos(an) * d, y + Math.sin(an) * d, z + .02, this.size * (.42 - .18 * v), p.col, fa); }
        continue;
      }
      const a = Math.min(1, u * 7) * (p.out ? 1 - smooth(clamp((u - .45) / .55)) : 1 - smooth(clamp((u - .82) / .18)));
      this.pts.set(i, x, y, z, this.size * (p.out ? 1 - .45 * u : 1), p.col, a);
    }
    this.pts.commit(); if (F) F.commit();
  }
}

const M = balanceModel({ peak: .8, k: 6, onset: .02, tRise: .14, shape: 2.2 });
const REF = .18, TP = M.tPeak, PW = .045;          // the "peak" window: arrival and removal within a few % of each other
let RMAX = 0; for (let i = 0; i <= 200; i++) RMAX = Math.max(RMAX, M.rel(i / 200), M.elim(i / 200));
const SAMPLES = [.12, .26, .45, .7];
const T_RISE = TP - PW - .02, T_EARLY = .06, T_LATE = .92;
const TUBE_X = -2.75, TUBE_Y = -2.1, TUBE_S = .5;
const PATCH = V(-4.36, -.40, 0), SINK = V(-4.31, -1.83, .1);
// cumulative lesion release (0 → 1): the fraction of the damaged cells that have broken by time t
const DMG = (() => { const n = 400, a = new Float32Array(n + 1), b = M.params.k * M.params.base; let s = 0;
  for (let i = 1; i <= n; i++) { s += Math.max(0, M.rel(i / n) - b); a[i] = s; } for (let i = 0; i <= n; i++) a[i] /= s || 1;
  return t => { const x = clamp(t) * n, i = Math.min(n - 1, Math.floor(x)); return a[i] + (a[i + 1] - a[i]) * (x - i); }; })();
// damaged cells shown: injury runs ahead of the cumulative release (a damaged cell keeps leaking), so cells are already
// damaged as soon as the release starts (early sample: a few damaged cells, little enzyme in the plasma yet)
const DV = t => Math.pow(DMG(t), .45);

// the sign of dA/dt in words (same thresholds for the bars and the verdict)
export function verdict(rel, elim, A, rmax, peak) {
  const d = (rel - elim) / rmax;
  if (d > .05) return ['Iristea > kentzea', '▲ jarduera igotzen', PAL.coral];
  if (d < -.05) return ['Kentzea > iristea', '▼ jarduera jaisten', PAL.blue];
  if (A > .5 * peak) return ['Iristea = kentzea', '● gailurra', PAL.amber];
  return ['Iristea ≈ kentzea', 'oreka', MUTE];
}

export default {
  id: 'kinetics', chapter: 2, beats: 7, title: 'Entzimen agerpen-zinetika', bloom: .5,
  bridgeIn: { focus() { return this.tm.group.getWorldPosition(_bf); } },
  bridge: { mode: 'dive', focus() { return (this.b >= 4 ? this.cursorTube : this.patch.mesh).getWorldPosition(_bf); } },   // from the injured tissue patch ...
  build(layer) {
    const S = makeScene({ glow: '#FFF1E6', gx: .2, gy: .55 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 34, drift: .03 });
    this.tm = tubeMeter(this.scene, { x: TUBE_X, y: TUBE_Y, s: TUBE_S, color: COL3.coral });
    const sh = contactShadow({ size: 1, opacity: .18 }); sh.scale.set(1.2, .6, 1); sh.position.set(TUBE_X, TUBE_Y - .02, 0); this.scene.add(sh);
    // the injured tissue: a hex-cell patch (as on slide 5); a damage front spreads through it in step with the release
    const pg = new THREE.Group(); pg.position.copy(PATCH); pg.rotation.set(1.02, -.12, 0); this.scene.add(pg);
    this.patch = hexPatch({ cols: 7, rows: 6, hr: .106, seed: 4 }); pg.add(this.patch.mesh); pg.updateMatrixWorld(true);
    this.cellW = this.patch.pos.map(p => pg.localToWorld(p.clone()));
    this.nDmg = Math.round(this.patch.n * .62);                // cells that will break in this lesion
    const psh = contactShadow({ size: 1, opacity: .14 }); psh.scale.set(1.7, .55, 1); psh.position.set(PATCH.x, PATCH.y - .42, -.2); this.scene.add(psh);
    // clearance zone beside the tube: removed molecules are broken down there
    this.sink = clearZone({ r: .4 }); this.sink.group.position.copy(SINK); this.scene.add(this.sink.group);
    // flows: tissue → plasma (arrival) and plasma → sink (removal), same particle scale so the two rates compare directly
    this.flow = new Flow(this.scene, 190, .12);
    const pl = this.tm.tube.plasma, pBot = TUBE_Y + (pl.y0 + .1) * TUBE_S, pTop = TUBE_Y + (pl.y1 - .05) * TUBE_S;
    const front = () => { const f = Math.floor(DV(this.ch.curT.v) * this.nDmg); return this.patch.order[Math.max(0, Math.min(this.nDmg - 1, f - Math.floor(_r() * 4)))]; };
    this.sIn = this.flow.stream({ color: COL3.coral, life: 1.2,
      from: (o, r) => { const c = this.cellW[DV(this.ch.curT.v) > .002 ? front() : this.patch.order[Math.floor(r() * this.patch.n)]]; o.set(c.x + (r() - .5) * .08, c.y + .06, c.z + .1); },
      ctrl: V(-3.55, .55, .25),
      to: (o, r) => o.set(TUBE_X + (r() - .5) * .3, pBot + r() * (pTop - pBot), .05) });
    this.sOut = this.flow.stream({ color: COL3.coral, life: 1.45, sink: true,
      from: (o, r) => o.set(TUBE_X + (r() - .5) * .3, pBot + r() * (pTop - pBot), .05),
      ctrl: V(-3.3, -2.2, .25),
      to: (o, r) => o.set(SINK.x + (r() - .5) * .16, SINK.y + (r() - .5) * .16, SINK.z + .05) });
    this.flowArrows=[COL3.coral,COL3.blue].map((color,i)=>{
      const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color});
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.40,12),mat);g.add(stem);
      const head=new THREE.Mesh(new THREE.ConeGeometry(.09,.15,14),mat);head.position.y=.265;g.add(head);
      g.rotation.z=i?Math.PI+.36:-.36;g.position.set(TUBE_X+(i?.43:-.43),-.92,.16);this.scene.add(g);return g;
    });
    this.flowOn = new Tw(0);

    add(layer, `<div class="eyebrow"><b>3</b>Agerpena eta iraupena</div>`);
    add(layer, `<div class="h1">Entzimen <em>agerpen-zinetika</em></div>`);
    this.ch = new Chart(layer, { x: 760, y: 270, w: 1040, h: 470, ref: REF, xLabel: 'Lesioaren ondorengo denbora', yLabel: 'Jarduera plasmatikoa' });
    this.c = this.ch.curve(M.A, { color: PAL.coral, width: 6 });
    // Keep the physical trace registered with the projected axes while the camera tracks the sampling time.
    this.chartSpace=new THREE.Group();this.scene.add(this.chartSpace);
    const at=(time,activity,out=new THREE.Vector3())=>{
      const py=this.ch.y+this.ch.Y(activity), depth=10+(540-py)/162* Math.tan(Math.PI/15);
      const units=2*Math.tan(17*Math.PI/180)*depth/1080;
      return out.set((this.ch.x+this.ch.X(time)-960)*units,(540-py)*units,-depth);
    };
    // Sample by model time so the leading cross section always reaches the current sample.
    const vertices=[],indices=[],sections=192;
    const p=new THREE.Vector3();
    for(let i=0;i<=sections;i++){
      const t=i/sections;at(t,M.A(t),p);
      vertices.push(p.x,p.y,p.z+.075, p.x,p.y-.074,p.z+.075, p.x,p.y-.074,p.z-.075, p.x,p.y,p.z-.075);
      if(i<sections)for(let j=0;j<4;j++){
        const a=i*4+j,b=i*4+(j+1)%4;indices.push(a,b,a+4,b,b+4,a+4);
      }
    }
    const ribbonGeo=new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ribbonGeo.setIndex(indices);ribbonGeo.computeVertexNormals();
    this.ribbon=new THREE.Mesh(ribbonGeo,new THREE.MeshStandardMaterial({color:COL3.coral,roughness:.33,side:THREE.DoubleSide}));
    this.chartSpace.add(this.ribbon);this.c.p.style.display=this.c.glow.style.display='none';
    this.cursorTube=new THREE.Group();
    const sampleMesh=(geometry,color,y,opacity=1)=>{
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.33,transparent:opacity<1,opacity,depthWrite:opacity===1}));
      mesh.position.y=y;this.cursorTube.add(mesh);
    };
    sampleMesh(new THREE.CylinderGeometry(.102,.102,.48,20),'#b7d7df',-.32,.41);
    sampleMesh(new THREE.CylinderGeometry(.077,.077,.29,20),'#ac464d',-.41);
    sampleMesh(new THREE.CylinderGeometry(.12,.12,.095,20),'#cb984d',-.073);
    this.chartSpace.add(this.cursorTube);
    this.mechanismObjects=[pg,psh,sh,this.sink.group,this.tm.group,this.flow.pts.mesh,this.flow.frag?.mesh,...this.flowArrows].filter(Boolean);
    const dial=new THREE.Group();dial.position.set(-3.22,-.36,.03);dial.rotation.set(-.11,.23,-.03);this.scene.add(dial);this.dial=dial;
    const dialBody=new THREE.Mesh(new THREE.CylinderGeometry(.94,.96,.15,56),new THREE.MeshStandardMaterial({color:'#bbc7c8',roughness:.38}));dialBody.rotation.x=Math.PI/2;dial.add(dialBody);
    const face=new THREE.Mesh(new THREE.CircleGeometry(.875,48),new THREE.MeshStandardMaterial({color:'#fff9eb',roughness:.75}));face.position.z=.082;dial.add(face);
    const ticks=new THREE.InstancedMesh(new THREE.BoxGeometry(.024,.105,.026),new THREE.MeshStandardMaterial({color:'#4b6270'}),12);
    const mark=new THREE.Object3D();for(let j=0;j<12;j++){const a=j*Math.PI/6;mark.position.set(.77*Math.sin(a),.77*Math.cos(a),.11);mark.rotation.z=-a;mark.updateMatrix();ticks.setMatrixAt(j,mark.matrix);}dial.add(ticks);
    this.clockHand=new THREE.Group();dial.add(this.clockHand);
    const handMesh=new THREE.Mesh(new THREE.BoxGeometry(.078,.70,.038),new THREE.MeshStandardMaterial({color:COL3.coral}));handMesh.position.set(0,.27,.14);this.clockHand.add(handMesh);
    this.curveAt=at;
    // captions: the rise is left-aligned and the narrow peak window's caption is nudged right, so the two never touch
    const ph = (t0, t1, lab, sub, col, b, align = 'middle', dx = 0) => { const g = this.ch.phase(t0, t1, lab, col, b);
      const x = (align === 'start' ? this.ch.X(t0) + 18 : (this.ch.X(t0) + this.ch.X(t1)) / 2) + dx;
      const head = g.querySelector('text'); head.setAttribute('x', x); head.setAttribute('text-anchor', align);
      const s = el('text', { x, y: 60, 'text-anchor': align, 'font-size': 22, 'font-weight': 500, fill: PAL.ink2 }, g); s.textContent = sub; };
    ph(0, TP - PW, '1 · Igoera', 'iristea > kentzea', alpha(PAL.amber, .08), '1-3', 'start');
    ph(TP - PW, TP + PW, '2 · Gailurra', 'iristea = kentzea', alpha(PAL.coral, .1), '2-3', 'middle', 28);
    ph(TP + PW, 1, '3 · Jaitsiera', 'kentzea > iristea', alpha(PAL.blue, .06), '3-3');
    // probe: the measured point of a single sample (flash ring + reading line to the axis)
    // During serial sampling, connect the two actual samples being compared.
    this.sampleChord = el('path', { fill:'none', stroke:INK, 'stroke-width':3,
      'stroke-linecap':'round', 'stroke-dasharray':'7 7', opacity:0 }, this.ch.marksG);
    this.probe = el('g', { opacity: 0 }, this.ch.marksG);
    this.pLine = el('line', { x1: 0, stroke: alpha(INK, .45), 'stroke-dasharray': '4 7', 'stroke-width': 2 }, this.probe);
    this.pRing = el('circle', { r: 12, fill: 'none', stroke: INK, 'stroke-width': 3, class: 'snapring' }, this.probe);
    this.pDot = el('circle', { r: 11, fill: INK, stroke: PAPER, 'stroke-width': 3 }, this.probe);
    this.pTag = el('text', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 600, fill: INK }, this.probe);
    layer.insertAdjacentHTML('beforeend', '<style>@keyframes snapr{0%{transform:scale(1);opacity:.9}70%,100%{transform:scale(4.2);opacity:0}} .snapring{transform-box:fill-box;transform-origin:center;animation:snapr 2.2s ease-out infinite}</style>');
    SAMPLES.forEach((t, i) => { const g = this.ch.mark(t, 0, '6', { color: PAL.amber }); g.classList.add('d' + (i + 1)); });
    // trend between consecutive samples
    for (let i = 0; i < SAMPLES.length - 1; i++) {
      const a = SAMPLES[i], b = SAMPLES[i + 1], up = M.A(b) > M.A(a);
      const tx = el('text', { x: this.ch.X((a + b) / 2), y: Math.min(this.ch.Y(M.A(a)), this.ch.Y(M.A(b))) - 18, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 700, style: `fill:${up ? PAL.coral : PAL.blue}`, 'data-b': '6' }, this.ch.marksG);
      tx.textContent = up ? '▲' : '▼'; tx.classList.add('d' + (i + 2));
    }

    // flux panel: both model flows as bars on one scale, and what their difference does
    this.fp = add(layer, `<div class="abs fx l" data-b="1-3" style="left:96px;top:214px;width:560px">
      ${[['Iristea', 'ehunetik odolera', PAL.coral, 'bi'], ['Kentzea', 'odoletik kanpora', PAL.blue, 'bo']].map(([n, s, c, k]) => `
      <div style="display:flex;align-items:center;gap:14px;margin:4px 0 14px">
        <div style="width:210px"><div style="font:600 26px/1.1 var(--sans);letter-spacing:-.01em;color:${c}">${n}</div><div style="font:400 22px/1.25 var(--sans);color:${MUTE};margin-top:3px">${s}</div></div>
        <div style="flex:1;height:10px;border-radius:5px;background:${alpha(INK, .07)};overflow:hidden"><div class="${k}" style="height:100%;width:100%;border-radius:5px;background:${c};transform-origin:0 50%;transform:scaleX(0)"></div></div></div>`).join('')}
      <div style="border-top:1.5px solid ${LINE};padding-top:12px;font:600 25px/1.2 var(--sans);display:flex;justify-content:space-between"><span class="v1"></span><span class="v2"></span></div></div>`);
    this.bi = this.fp.querySelector('.bi'); this.bo = this.fp.querySelector('.bo'); this.v1 = this.fp.querySelector('.v1'); this.v2 = this.fp.querySelector('.v2'); this.lastV = '';
    this.labs = [
      new Label(layer, 'Ehuna<small>zelula kaltetuak</small>', { color: PAL.coral, anchor: V(PATCH.x - .05, PATCH.y + .42, 0), side: 'up', b: '1-3' }),
      new Label(layer, 'Kentzea<small>zirkulaziotik</small>', { color: PAL.blue, anchor: V(SINK.x, SINK.y + .44, SINK.z), side: 'up', b: '1-3' }),
    ];
    for (const l of this.labs) l.el.classList.add('bg');
    // clock: time since the lesion (schematic)
    this.clock = add(layer, `<div class="abs" data-b="1-3" style="left:1470px;top:132px;display:flex;align-items:center;gap:16px">
      <svg width="120" height="120" viewBox="-30 -30 60 60"><circle r="26" fill="${PAPER}" stroke="${alpha(INK, .5)}" stroke-width="2.5"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<line x1="0" y1="-22" x2="0" y2="-18" stroke="${alpha(INK, .4)}" stroke-width="2" transform="rotate(${i * 30})"/>`).join('')}
      <line class="hand" x1="0" y1="3" x2="0" y2="-19" stroke="${PAL.coral}" stroke-width="3.5" stroke-linecap="round"/><circle r="3.5" fill="${INK}"/></svg>
      <div style="font:500 22px/1.25 var(--sans);color:${MUTE};text-shadow:var(--halo)">lesiotik igarotako<br>denbora</div></div>`);
    this.hand = this.clock.querySelector('.hand');
    this.status = add(layer, `<div class="abs" style="left:${Math.round(960 + TUBE_X * 176.6 - 200)}px;top:918px;width:400px;text-align:center;font:700 26px/1.2 var(--sans);text-shadow:var(--halo)"></div>`);
    const call = (b, html) => add(layer, `<div class="key" data-b="${b}" style="left:760px;top:850px;bottom:auto;font-size:36px;max-width:1080px">${html}</div>`);
    call('0-0', `Emaitza = lagina hartu den <em>uneko</em> argazkia`);
    call('1-3', `Jardueraren aldaketa = ehunetik <em>iristen</em> dena − zirkulaziotik <em>kentzen</em> dena`);
    call('4-4', `<em>Goizegi</em>: jarduera oraindik erreferentzia-tartean egon daiteke`);
    call('5-5', `<em>Beranduegi</em>: baliteke tartera itzuli izana`);
    call('6', `Une desberdinetako neurketek <em>igoera</em> eta <em>beherakada</em> bereizten dituzte`);
    this.b = 0; this.t6 = 0; this.i6 = -1; this.lastSt = '';
  },
  enter(b) { this.rig.arrive(V(0, 0, 10), V(0, 0, 0), 34); this.flow.clear(); this.apply(b, true, 1); },
  beat(b, dir) { this.apply(b, false, dir); },
  apply(b, inst, dir) {
    const R = this.c.reveal, Ct = this.ch.curT, prev = this.b; this.b = b;
    const run = (to, d) => { if (inst) { R.set(to); Ct.set(to); } else { R.to(to, d, ease.lin); Ct.to(to, d, ease.lin); } };
    const sampling=b>=4;
    this.dial.visible=sampling;
    for(const obj of this.mechanismObjects)obj.visible=!sampling;
    this.flowOn.to(b >= 1 && !sampling ? 1 : 0, inst ? .01 : .6);
    if (b === 0) { R.to(0, inst ? .01 : .6); Ct.to(.38, inst ? .01 : .6); }
    if (b === 1) { if (!inst && prev === 0) { R.set(0); Ct.set(0); } run(T_RISE, dir > 0 ? 3.4 : .8); }
    if (b === 2) run(TP, dir > 0 ? 1.6 : .8);
    if (b === 3) { if (inst || dir > 0) run(1, 5.5); else { R.set(1); Ct.to(1, 1.2, ease.io); } }
    if (b >= 4) R.to(1, .01);
    if (b === 4) Ct.to(T_EARLY, inst ? .01 : 1.6, ease.io);
    if (b === 5) Ct.to(T_LATE, inst ? .01 : 2.2, ease.io);
    if (b === 6) { this.t6 = -1; this.i6 = -1; }
    this.ch.curOn.to(b >= 1 && b <= 5 ? 1 : 0, .5);
    this.ch.curTag.textContent = b <= 3 ? 'orain' : b === 4 ? 'lagin goiztiarra' : b === 5 ? 'lagin berantiarra' : '';
    this.probe.setAttribute('opacity', b === 0 || b >= 4 ? 1 : 0);
    this.pTag.classList.add('guide-only');
    this.pTag.textContent = b === 0 ? 'lagina' : '';
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    if (this.b === 6) {   // serial samples: the reading jumps from one sample to the next
      if (this.t6 < 0) this.t6 = t;
      const i = Math.floor((t - this.t6) / 1.9) % SAMPLES.length;
      if (i !== this.i6) { this.i6 = i; this.ch.curT.to(SAMPLES[i], .7, ease.io); this.pTag.textContent = ''; }
    }
    this.ch.update();
    const tc = this.ch.sampleTime, A = M.A(tc), rel = M.rel(tc), elim = M.elim(tc), on = this.flowOn.v;
    this.chartSpace.position.copy(this.camera.position);this.chartSpace.quaternion.copy(this.camera.quaternion);
    this.ribbon.geometry.setDrawRange(0,Math.ceil(clamp(this.ch.scrub==null?this.c.reveal.v:1)*192)*24);
    this.cursorTube.visible=this.ch.scrub!=null||this.ch.curOn.v>.05||this.b===0||this.b===6;this.curveAt(tc,A,this.cursorTube.position);this.clockHand.rotation.z=-tc*2*Math.PI;this.cursorTube.position.y+=A<.25?.69:.02;this.cursorTube.position.z+=.13;this.cursorTube.rotation.z=-.22;
    const follow=.22*(tc-.4);this.camera.position.x+=follow;this.chartSpace.position.x+=follow;
    this.flowArrows.forEach((arrow,i)=>{
      const gain=clamp((i?elim:rel)/RMAX);
      arrow.visible=this.b<4&&on>.01;arrow.scale.x=.3+.7*gain;arrow.scale.z=.3+.7*gain;
    });
    // probe
    const px = this.ch.X(tc), py = this.ch.Y(A);
    const pair = this.b === 6 && this.i6 > 0 && this.ch.scrub == null;
    this.sampleChord.setAttribute('opacity', pair ? .78 : 0);
    if (this.b === 6 && this.ch.scrub == null && Math.abs(tc-SAMPLES[this.i6]) < .006) {
      const name = `${this.i6+1}. lagina`;
      if (this.pTag.textContent !== name) this.pTag.textContent = name;
    }
    if (pair) {
      const previous = SAMPLES[this.i6 - 1], x = this.ch.X(previous), y = this.ch.Y(M.A(previous));
      const target=SAMPLES[this.i6], endY=this.ch.Y(M.A(target));
      const progress=clamp((tc-previous)/(target-previous));
      this.sampleChord.setAttribute('stroke', endY<y ? PAL.coral : PAL.blue);
      this.sampleChord.setAttribute('d', `M${x} ${y}L${px} ${y+(endY-y)*progress}`);
    }
    this.pLine.setAttribute('x2', px); this.pLine.setAttribute('y1', py); this.pLine.setAttribute('y2', py);
    this.pRing.setAttribute('cx', px); this.pRing.setAttribute('cy', py); this.pDot.setAttribute('cx', px); this.pDot.setAttribute('cy', py);
    this.pTag.setAttribute('x', px); this.pTag.setAttribute('y', py - 58);
    // flows
    this.flow.emit(this.sIn, 24 * rel / RMAX * on, dt); this.flow.emit(this.sOut, 24 * elim / RMAX * on, dt);
    this.flow.update(dt);
    // damage front: cells break one after another as the cumulative release grows
    const P = this.patch, dk = DV(tc) * this.nDmg;
    for (let i = 0; i < this.nDmg; i++) P.aDmg[P.order[i]] = clamp(dk - i);
    P.geo.attributes.aDmg.needsUpdate = true;
    this.sink.update(dt, elim / RMAX * on);
    for (const l of this.labs) l.update(this.camera);
    this.bi.style.transform = `scaleX(${(rel / RMAX).toFixed(3)})`; this.bo.style.transform = `scaleX(${(elim / RMAX).toFixed(3)})`;
    const [w1, w2, col] = verdict(rel, elim, A, RMAX, M.params.peak);
    if (w1 !== this.lastV) { this.lastV = w1; this.v1.textContent = w1; this.v2.textContent = w2; this.v2.style.color = col; this.v1.style.color = INK; }
    this.hand.setAttribute('transform', `rotate(${(tc * 720).toFixed(1)})`);
    // tube = the sample at the cursor
    this.tm.update(t, dt, clamp(A / .86));
    const st = A > REF ? `<span style="color:var(--coral)">▲ tartetik gora</span>` : `<span style="color:var(--mute)">erreferentzia-tartean</span>`;
    if (st !== this.lastSt) { this.lastSt = st; this.status.innerHTML = `<span style="color:var(--mute);font-weight:500">Lagina · </span>${st}`; }
  },
};
