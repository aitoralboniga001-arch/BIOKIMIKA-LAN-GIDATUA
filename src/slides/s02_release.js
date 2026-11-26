// 2 · Why plasma activity rises: arrival into blood vs removal from it (a live balance simulation).
// Every enzyme is an agent: the cell releases them at a rate, and enzymes are removed from the plasma at a rate
// k × (amount in plasma) (first-order elimination; which enzyme leaves is random, the flux itself is not noisy). The panel on the right reads the same agents: measured inflow,
// outflow = k × amount, and a strip chart of the plasma level, so each mechanism visibly moves the steady state.
import { liquidMat, organMat } from '../optics.js';
import { specimen } from './specimens.js';
import { THREE, Tw, add, ease, rng, Label, clamp, damp, clock } from '../core.js';
import { makeScene, instancedBlobs, glassCylinder, fresnelMat, membraneGeo, Pts, C, COL, COL3, halo } from '../lib3d.js';
import { PAL, INK, INK2, MUTE, LINE2, PAPER, alpha } from '../theme.js';
import { el } from '../chart.js';
import { makeCell } from '../cell.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

// per beat: release rate (enzymes/s), elimination constant (1/s), pores, shatter, synthesis
const MODES = [
  { rate: 1.5, k: .107, pore: 0, shatter: 0, syn: 0 },
  { rate: 6, k: .107, pore: .85, shatter: 0, syn: 0 },
  { rate: 1.2, k: .107, pore: .6, shatter: 1, syn: 0 },   // burst from the broken cell + a trickle from the damaged tissue around it
  { rate: 4.5, k: .107, pore: 0, shatter: 0, syn: 1 },
  { rate: 1.5, k: .02, pore: 0, shatter: 0, syn: 0 },
  { rate: 1.5, k: .107, pore: 0, shatter: 0, syn: 0 },
];
const MAX = 300, CELLN = 56, MITON = 22, BASAL = 14;
const POOL = { x: 1.15, y: -.35, r: .95, y0: -1.45, y1: .75 };
const FULL = 100;                    // enzymes in plasma that fill the meter (headroom above the necrosis peak)
const REF = BASAL * 1.35 / FULL;     // top of the reference band (fraction of the meter)
const SW = 400, SH = 260, NS = 160, DTS = .25; // strip chart: size, samples, seconds per sample (40 s window)
const FMAX = 9;                      // flux that fills a bar (enzymes / s)
const TRICKLE = 4;                   // enzymes in transit at the basal rate (1.5 / s × ~2.4 s path)

export default {
  id: 'release', chapter: 1, beats: 6, title: 'Zergatik igotzen da jarduera plasmatikoa?', bloom: .7,
  bridgeIn: { focus() { return this.cell.group.getWorldPosition(_bf); } },             // ... which becomes the releasing cell
  bridge: { mode: 'register', scaleRatio: 1.28, focus() { return this.exampleFills[2].getWorldPosition(_bf); } },
  build(layer) {
    const S = makeScene({ gx: .45, gy: .5 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(-.2, .62, 14), V(-.2, .12, 0), { fov: 34, drift: .04 });
    const cell = makeCell({ R: 1.6, seed: 4, nMito: 4 }); cell.group.position.set(-3.6, .05, 0); this.scene.add(cell.group); this.cell = cell;
    // plasma pool
    const pool = new THREE.Group(); pool.position.set(POOL.x, POOL.y, 0); this.scene.add(pool); this.pool = pool;
    const H = POOL.y1 - POOL.y0 + .55;
    const glass = glassCylinder({ r: POOL.r + .08, h: H }); glass.position.y = (POOL.y0 + POOL.y1 + .55) / 2 - .02; pool.add(glass);
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(POOL.r + .04, POOL.r + .04, POOL.y1 - POOL.y0 + .1, 64, 1, true), liquidMat(COL3.plasma));
    this.liquid.position.y = (POOL.y0 + POOL.y1) / 2; pool.add(this.liquid);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(POOL.r + .04, 64), new THREE.MeshBasicMaterial({ color: C(COL3.plasma), transparent: true, opacity: .2, depthWrite: false }));
    surf.rotation.x = -Math.PI / 2; surf.position.y = POOL.y1 + .05; pool.add(surf); this.surf = surf;
    // a slow circulating current of faint straw-coloured specks, so the pool reads as flowing blood plasma
    this.flow = new Pts(56); pool.add(this.flow.mesh); this.flowS = []; this.cFlow = C(COL3.plasma).lerp(C(COL3.amber), .35);
    { const Rf = rng(77); for (let i = 0; i < 56; i++) this.flowS.push({ a: Rf() * 6.28, r: .2 + Rf() * (POOL.r - .3), y: POOL.y0 + .15 + Rf() * (POOL.y1 - POOL.y0 - .3), ph: Rf() * 6.28, s: .05 + Rf() * .05 }); }
    const uptake = new THREE.Group(); uptake.position.set(0,POOL.y0-1.2,0); pool.add(uptake);
    const surface=organMat({color:'#a9797c',roughness:.57});
    for(let i=0;i<3;i++){const lobe=new THREE.Mesh(new THREE.SphereGeometry(.28,20,14),surface);
      lobe.scale.set(1.12,.8,.69);lobe.position.set((i-1)*.26,Math.cos(i)*.05,-.12); uptake.add(lobe);}
    // drain
    this.drainR = new Tw(1);
    const pipeMat = new THREE.MeshPhysicalMaterial({ color: C(COL3.blue), roughness: .3, transparent: true, opacity: .35, clearcoat: 1, depthWrite: false });
    this.pipe = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.4, 32, 1, true), pipeMat); this.pipe.position.y = POOL.y0 - .7 - .12; pool.add(this.pipe);
    this.valve = new THREE.Mesh(new THREE.TorusGeometry(.26, .06, 12, 40), new THREE.MeshStandardMaterial({ color: C(COL3.blue), roughness: .4 })); this.valve.rotation.x = Math.PI / 2; this.valve.position.y = POOL.y0 - .55; pool.add(this.valve);
    // stream guide (faint arc from cell to pool); its opacity follows the measured inflow
    this.path = new THREE.QuadraticBezierCurve3(V(-1.9, .35, 0), V(-.5, 2.3, .3), V(POOL.x, POOL.y1 + .6 + POOL.y, 0));
    this.tube = new THREE.Mesh(new THREE.TubeGeometry(this.path, 64, .061, 8), new THREE.MeshBasicMaterial({ color: C(COL3.coral), transparent: true, opacity: .08, depthWrite: false }));
    this.scene.add(this.tube);
    this.p0 = this.path.getPoint(0); this.mouth = V(POOL.x, POOL.y + POOL.y0 - .05, 0); this.outP = V(POOL.x, POOL.y + POOL.y0 - 1.6, 0);
    // agents
    this.blobs = instancedBlobs(MAX, { r: .094, glow: .21, seed: 12 }); this.scene.add(this.blobs);
    this.cCyt = C(COL3.coral); this.cMit = C(COL3.gold); this.cOut = C(COL3.blue); this.cTmp = C('#ffffff');
    this.A = []; const R = rng(31); this.R = R;
    for (let i = 0; i < MAX; i++) this.A.push({ st: 0, p: V(0, 0, 0), cur: V(0, 0, 0), v: V(0, 0, 0), t: 0, s: 0, ph: R() * 6.28, mit: false, home: V(0, 0, 0), from: V(0, 0, 0), m: null });
    this.flare = halo(COL.coral, 4.5, 0); this.flare.position.copy(cell.group.position); this.scene.add(this.flare);
    // coarser membrane tessellation: when it tears, the fragments are shards you can see, not dust
    cell.mem.geometry.dispose(); cell.mem.geometry = membraneGeo(cell.R, 9);
    // necrosis props: the pale ghost left behind, a spray of membrane debris, a gold flash where each mitochondrion bursts
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(cell.R * 1.04, 48, 32), fresnelMat({ color: '#8E98AC', power: 2.2, intensity: .55, base: .05, opacity: 0 }));
    this.ghost.position.copy(cell.group.position); this.scene.add(this.ghost);
    this.debris = new Pts(50); this.scene.add(this.debris.mesh); this.dDir = [];
    for (let i = 0; i < 50; i++) { const v = V(rng(i + 3)() - .5, rng(i + 9)() - .5, rng(i + 17)() - .5).normalize(); this.dDir.push({ v, sp: .6 + rng(i + 5)() * 1.4, s: .05 + rng(i + 7)() * .08 }); }
    this.mFlash = cell.mitos.map(m => { const hh = halo(COL.gold, 1.3, 0); hh.position.copy(m.position); cell.group.add(hh); return hh; });
    this.recover = new Tw(1); this.necT0 = null; this.nk = 0;
    this.synth = new Pts(60); cell.group.add(this.synth.mesh);
    this.mode = MODES[0]; this.acc = 0; this.N = 0; this.Ns = 0;
    this.pore = new Tw(0); this.syn = new Tw(0);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = V(1, 1, 1); this.tmp = V(0, 0, 0); this.ax = V(.3, 1, .2).normalize(); this.off3 = V(0, 0, 0); this.jit = V(0, 0, 0);
    this.inR = 1.5; this.inD = 1.5; this.outD = 1.5; this.arrivals = 0;
    this.hist = new Float32Array(NS); this.hn = 0; this.hAcc = 0; this.verdict = '';
    this.reset();

    // ---- text
    add(layer, `<div class="eyebrow"><b>2</b>Igoeraren jatorria</div>`);
    add(layer, `<div class="h1 fade" data-reveal="fade">Odolera <em>iristea</em> ↔ odoletik <em>desagertzea</em></div>`);
    // balance panel: flux bars, verdict, strip chart + meter on the same vertical scale
    this.panel = add(layer, `<div class="abs" style="left:1330px;top:222px;width:540px;transition:opacity .6s">
      <div style="display:grid;grid-template-columns:180px 330px;row-gap:12px;align-items:center;font:600 24px/1 var(--sans)">
        <span style="color:var(--coral)">Iristea</span><div style="height:10px;border-radius:5px;background:${alpha(PAL.coral, .1)}"><div class="b-in" style="height:100%;width:0;border-radius:5px;background:${PAL.coral}"></div></div>
        <span style="color:var(--blue)">Desagertzea</span><div style="height:10px;border-radius:5px;background:${alpha(PAL.blue, .1)}"><div class="b-out" style="height:100%;width:0;border-radius:5px;background:${PAL.blue}"></div></div>
      </div>
      <div class="b-verdict" style="margin-top:14px;font:500 24px/1.2 var(--sans);color:var(--ink2);text-shadow:var(--halo)">&nbsp;</div>
      <div style="margin-top:6px;font:italic 400 22px/1.2 var(--serif);color:var(--mute)">desagertzea ∝ plasman dagoen kantitatea</div></div>`);
    this.bIn = this.panel.querySelector('.b-in'); this.bOut = this.panel.querySelector('.b-out'); this.bVerdict = this.panel.querySelector('.b-verdict');
    for(const bar of [this.bIn,this.bOut]){bar.style.width='100%';bar.style.transformOrigin='0 50%';}
    const top = 410;
    // Keep the plasma gauge on the same SVG scale as the trace. A CSS capsule with
    // an inset shadow and a clipped, changing fill forced a costly first raster.
    const svg = el('svg', { class: 'chart', width: SW + 120, height: SH + 80, viewBox: `-20 -40 ${SW + 120} ${SH + 80}` }); svg.style.left = (1360 - 20) + 'px'; svg.style.top = (top - 40) + 'px'; svg.style.transition = 'opacity .6s';
    layer.appendChild(svg); this.strip = svg;
    const gaugeX = SW + 33, gaugeWidth = 38;
    el('rect', { x: gaugeX, y: 0, width: gaugeWidth, height: SH, rx: 8, fill: PAPER, stroke: LINE2, 'stroke-width': 2 }, svg);
    el('rect', { x: gaugeX + 2, y: SH * (1 - REF), width: gaugeWidth - 4, height: SH * REF - 2, fill: alpha(INK, .08) }, svg);
    this.fill = el('rect', { x: gaugeX + 5, y: SH, width: gaugeWidth - 10, height: 0, rx: 3, fill: PAL.amber }, svg);
    const yRef = SH - REF * SH;
    el('path', { d: `M${gaugeX - 2} ${yRef}h${gaugeWidth + 4}`, stroke: INK2, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, svg);
    el('rect', { x: 0, y: yRef, width: SW, height: SH - yRef, fill: alpha(INK, .045) }, svg);
    el('line', { x1: 0, x2: SW, y1: yRef, y2: yRef, stroke: LINE2, 'stroke-width': 1.5, 'stroke-dasharray': '6 7' }, svg);
    // the reference band is named below the axis (legend style), so no trace ever runs through its label
    el('rect', { x: 0, y: SH + 13, width: 26, height: 18, rx: 3, fill: alpha(INK, .07), stroke: LINE2, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    const rl = el('text', { x: 36, y: SH + 29, 'font-size': 22, fill: MUTE }, svg); rl.textContent = 'Erreferentzia-tartea';
    el('path', { d: `M0 0 V${SH} H${SW}`, fill: 'none', stroke: alpha(INK, .5), 'stroke-width': 2 }, svg);
    const xl = el('text', { x: SW, y: SH + 28, 'text-anchor': 'end', 'font-size': 22, fill: INK2 }, svg); xl.textContent = 'denbora →';
    // axis title sits above the plot so no trace can run through it
    const yl = el('text', { x: 0, y: -14, 'font-size': 22, 'font-weight': 600, fill: INK }, svg); yl.textContent = 'Jarduera plasmatikoa';
    const sc = el('text', { x: SW, y: -14, 'text-anchor': 'end', 'font-size': 22, fill: MUTE }, svg); sc.textContent = 'eskematikoa';
    this.previous = el('path',{fill:'none',stroke:INK,'stroke-width':2.5,'stroke-dasharray':'6 5',opacity:.32},svg);
    this.previousName = el('text',{x:SW-4,y:29,'text-anchor':'end','font-size':20,fill:MUTE},svg);
    this.area = el('path', { fill: alpha(PAL.amber, .12), stroke: 'none' }, svg);
    this.trace = el('path', { fill: 'none', stroke: PAL.amber, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    this.readLevel = el('path', { fill:'none', stroke:PAL.amber, 'stroke-width':1.8, 'stroke-dasharray':'3 6', opacity:.68 }, svg);
    this.tip = el('circle', { r: 7, fill: PAL.coral, stroke: PAPER, 'stroke-width': 2.5 }, svg);
    // figure-1 style summary: two families of causes
    const step = (n, txt, b) => `<div class="idx-i mech" data-m="${b}"><span class="n">${n}</span>${txt}</div>`;
    this.boxA = add(layer, `<div class="idx" style="left:1330px;top:728px;width:540px;transition:opacity .6s">
      <div class="idx-g" style="--gc:${PAL.coral}"><div class="idx-h">Odolera gehiago iristen da</div>${step('1', 'Iragazkortasuna ↑', 1)}${step('2', 'Nekrosia', 2)}${step('3', 'Sintesi handiagoa', 3)}</div>
      <div class="idx-g" style="--gc:${PAL.blue}"><div class="idx-h">Eliminazioa moteltzen da</div>${step('4', 'Luzaroago odolean', 4)}</div></div>`);
    this.boxB = this.boxA;
    this.mechEls = [...layer.querySelectorAll('.mech')];
    // beat captions near the cell
    const cap = (b, html) => add(layer, `<div class="tag fx" data-b="${b}" style="left:120px;top:250px;font-size:30px;white-space:normal;width:760px">${html}</div>`);
    cap('0-0', `<span style="color:var(--mute);font-weight:400">Oinarrian:</span> askapen txikia = eliminazioa → <span style="color:var(--amber)">oreka</span>`);
    cap('1-1', `Mintza iragazkorrago: zelulak entzimak askatzen ditu <span style="color:var(--amber)">bizirik dagoela ere</span>`);
    cap('2-2', `Nekrosia: mintzaren osotasuna galtzen da<small style="font-size:23px;margin-top:8px">zitosolekoak <b style="color:var(--coral)">●</b> mitokondrioetakoak <b style="color:var(--gold)">●</b> baino errazago askatzen dira</small>`);
    cap('3-3', `Zelulak entzima <span style="color:var(--amber)">gehiago sintetizatzen</span> du`);
    cap('4-4', `Askapena normala, baina <span style="color:var(--blue)">eliminazioa motelagoa</span> → metatu egiten da`);
    const mechanisms=new THREE.Group();
    for(const obj of [...S.scene.children]) if(!obj.isLight && obj!==S.backdrop && obj!==S.dust.mesh) mechanisms.add(obj);
    S.scene.add(mechanisms);this.mechanisms=mechanisms;
    this.exampleStreams=[];
    this.examples=new THREE.Group();S.scene.add(this.examples);
    this.exampleFills=[0,1,2].map(i=>{
      const g=new THREE.Group();g.position.set((i-1)*3.34-.21,-.05,0);this.examples.add(g);
      const organ=specimen(['bone','placenta','muscle'][i]);organ.position.set(-.48,0,0);g.add(organ);
      const stream=new Pts(12);g.add(stream.mesh);this.exampleStreams.push({organ,stream,color:C(i<2?COL3.mint:COL3.coral)});
      const glass=glassCylinder({r:.18,h:1.10});glass.position.set(.66,.02,0);g.add(glass);
      const fill=new THREE.Mesh(new THREE.CylinderGeometry(.155,.155,1,28),liquidMat(i<2?COL3.mint:COL3.coral));glass.add(fill);return fill;
    });
    this.examples.visible=false;
    // physiological rises
    const ph = [['bone', 'Hazkundea', 'hezur-jarduera', 'ALP', COL.mint], ['placenta', 'Haurdunaldia', 'plazentako ALP', 'ALP', COL.mint], ['muscle', 'Ariketa bizia', 'muskulua', 'CK', COL.coral]];
    // a separate idea: the balance scene steps back behind a light frosted scrim and the three cases take a clean stage

    add(layer, `<div class="tag fx d1" data-b="5" style="left:0;right:0;top:290px;text-align:center;font:400 52px/1.1 var(--serif);letter-spacing:-.01em">Igoera <em style="color:var(--acc)">fisiologikoa</em> ere izan daiteke</div>`);
    // no cards: each vignette is named right under its 3D object (title, source, the enzyme that rises)
    ph.forEach(([ic, a, b2, e, c], i) => add(layer, `<div class="abs fx d${i + 2}" data-b="5" style="left:${336 + i * 428}px;top:700px;width:392px;text-align:center">
      <div style="width:40px;height:2px;margin:0 auto 18px;border-radius:1px;background:${c}"></div>
      <div style="font:400 44px/1.05 var(--serif);color:var(--ink);letter-spacing:-.01em">${a}</div><div style="font:400 26px/1.3 var(--sans);color:var(--ink2);margin-top:8px">${b2}</div>
      <div class="pill" style="color:${c};margin-top:18px;font-size:26px">${e} ↑</div></div>`));
    this.labs = [
      new Label(layer, 'Ehuneko zelula', { color: PAL.coral, anchor: V(-1.2, -1.2, 0), obj: cell.group, side: 'l', b: '-4' }),
      // after necrosis the ghost keeps a name, on a pill so the spray of debris never makes it illegible
      new Label(layer, 'Zelula nekrotikoa', { color: PAL.coral, anchor: V(-1.2, -1.2, 0), obj: cell.group, side: 'l', b: '-4' }),
      new Label(layer, 'Plasma <span style="font-weight:400">(odola)</span>', { color: PAL.amber, anchor: V(-.55, POOL.y1 + 1.20, 0), obj: pool, b: '-4' }),
      new Label(layer, 'eliminazioa<small>batez ere katabolismoa</small><small>giltzurruna: entzima txikiak</small>', { color: PAL.blue, anchor: V(-.35, POOL.y0 - .48, 0), obj: pool, side: 'l', b: '-4' }),
    ];
    this.labs[1].el.classList.add('bg');
  },
  reset() {
    for (const a of this.A) a.st = 0;
    const R = this.R; let i = 0;
    for (; i < CELLN; i++) { const a = this.A[i]; a.st = 1; a.mit = false; this.cell.randomInside(R, a.home); a.p.copy(a.home); a.s = 1; }
    for (let j = 0; j < MITON; j++, i++) { const a = this.A[i]; a.st = 2; a.mit = true; a.m = this.cell.mitos[j % this.cell.mitos.length]; a.home.set((R() - .5) * .5, (R() - .5) * .12, (R() - .5) * .12); a.s = 1; }
    // a basal amount already in the plasma
    for (let j = 0; j < BASAL; j++, i++) { const a = this.A[i]; a.st = 4; a.mit = false; this.inPool(a.p); a.v.set(0, 0, 0); a.s = 1; }
    // and the basal trickle already on its way, evenly spaced, so arrivals match removal from the first second
    for (let j = 0; j < TRICKLE; j++, i++) { const a = this.A[i]; a.st = 3; a.mit = false; a.s = 1; a.from.copy(this.p0); a.t = (j + .5) / TRICKLE * .95; }
  },
  inPool(out) { const R = this.R; const ang = R() * 6.28, rr = Math.sqrt(R()) * (POOL.r - .12); return out.set(POOL.x + Math.cos(ang) * rr, POOL.y + POOL.y0 + .15 + R() * (POOL.y1 - POOL.y0 - .3), Math.sin(ang) * rr); },
  free() { for (const a of this.A) if (a.st === 0) return a; return null; },
  count(st) { let n = 0; for (const a of this.A) if (a.st === st) n++; return n; },
  release(a, delay = 0) { this.cell.group.localToWorld(this.tmp.copy(a.p)); if (a.st === 2) a.m.localToWorld(this.tmp.copy(a.home)); a.from.copy(this.tmp); a.st = 3; a.t = -delay * .42; }, // delay in seconds (path progress advances .42 / s)
  enter(b) { this.rig.arrive(V(-.2, .62, 14), V(-.2, .12, 0), 34); this.apply(b, true); },
  beat(b, dir) { if (dir !== 0 || b !== this.b) this.apply(b, false, dir); },
  apply(b, instant, dir = 0) {
    const previousBeat=this.b;
    const names=['','Iragazkortasuna','Nekrosia','Sintesia','Eliminazio motela'];
    if(instant || b!==previousBeat){
      const compare=!instant && b>=1 && b<=4 && previousBeat>=1 && previousBeat<=4 && this.hn>=3 && this.hn<NS;
      this.previous.setAttribute('d',compare?this.trace.getAttribute('d'):'');
      this.previousName.textContent=compare?'– – '+names[previousBeat]:'';
    }
    const M = MODES[b], prev = this.mode; this.mode = M; this.b = b;
    const cx=b===1?-.65:b===4?.32:-.2, dist=b===2?15.1:b===1?13.15:14;
    this.rig.go(V(cx,.62,dist),V(cx,.12,0),2.15,34);
    const d = instant ? 0 : 1.2;
    // every mechanism starts from the basal balance: extra enzymes in the plasma fade away so the meter restarts at the reference range
    // (enzymes still on their way from the previous mechanism fade too, beyond a basal trickle, so each trace starts clean)
    if (!instant) { let n = 0, m = 0; for (const a of this.A) { if (a.st === 4 && ++n > BASAL) { a.st = 6; a.t = 0; } if (a.st === 3 && a.t > 0 && ++m > TRICKLE) { a.st = 6; a.t = 0; a.p.copy(a.cur); } } }
    if (instant) this.reset();
    this.Ns = this.count(4); this.verdict = ''; this.vHold = 0;
    this.inR = this.inD = this.outD = BASAL * .107; this.hn = 0; this.hAcc = 0; this.drawStrip();
    this.pore.to(M.pore, d); this.syn.to(M.syn, d);
    this.drainR.to(M.k < .05 ? .3 : 1, instant ? 0 : 1.4);
    if (M.shatter && (!prev.shatter || instant)) {
      // necrosis timeline (seconds from now): the cell swells, the membrane tears (.55 s) and the cytosol gushes out;
      // the mitochondria swell and burst (~1.9 s) and release theirs; the remains fade to a pale ghost
      this.necT0 = clock.t;
      let n = 0; for (const a of this.A) { if (a.st === 1) this.release(a, .55 + n++ * .016); }
      n = 0; for (const a of this.A) { if (a.st === 2) this.release(a, 1.95 + n++ * .04); }
    }
    if (!M.shatter && prev.shatter && !instant) { this.necT0 = null; this.recover.set(0).to(1, 1.6, ease.io); this.refill(); }
    if (instant && !M.shatter) { this.necT0 = null; this.recover.set(1); this.refill(); }
    // highlight the mechanism being shown (accent marker + ink), the others step back
    this.mechEls.forEach(e => { const n = +e.dataset.m; const on = b === n;
      e.classList.toggle('on', on); e.classList.toggle('dim', !(b === 0 || b === 5 || on)); });
    this.mechanisms.visible=b!==5;this.examples.visible=b===5;this.exampleStart=clock.t;
    const dim = b === 5 ? 0 : 1;
    this.boxA.style.opacity = dim; this.boxB.style.opacity = dim; this.panel.style.opacity = dim; this.strip.style.opacity = dim;
  },
  // necrosis visuals; returns the progress 0..1 (1 = cell gone) used by the label and the release logic
  necrosis(t) {
    const c = this.cell, sm = smooth01;
    let swell = 0, shat = 0, mem = 1, cyto = 1, ghost = 0, mSw = 0, mGone = 0, pyk = 0, fl = 0, mfl = 0, deb = -1, prog = 0;
    if (this.necT0 != null) {
      const u = t - this.necT0;
      swell = sm(u / .55) * .13;                               // oncosis: water rushes in
      shat = .27 * ease.out(clamp((u - .5) / 2.8));             // the membrane tears into drifting fragments
      mem = 1 - sm((u - 2.3) / 1.8); cyto = 1 - sm((u - .45) / .7);
      ghost = sm((u - 2.2) / 1.6); pyk = sm((u - .8) / 2.2);
      mSw = sm((u - .7) / 1.2); mGone = u > 1.9 ? 1 : 0; mfl = clamp(1 - Math.abs(u - 2.05) * 3.5);
      fl = Math.sin(clamp((u - .45) / 1.1) * Math.PI) * .4; deb = u - .5;
      prog = clamp(u / 3.2);
    } else {
      const r = this.recover.v; shat = .5 * (1 - r); mem = r; cyto = r; ghost = 1 - r; pyk = 1 - r; mGone = r < .5 ? 1 : 0; prog = 1 - r;
    }
    c.group.scale.setScalar(1 + swell);
    c.memU.uShatter.value = shat; c.memU.uOpacity.value = mem;
    c.cyto.material.uniforms.uOpacity.value = cyto;
    c.nucleus.scale.setScalar(1 - pyk * .45); c.nucMat.opacity = 1 - pyk * .6; c.nl.material.opacity = 1 - pyk;
    c.mitos.forEach((m, i) => { m.visible = !mGone; m.scale.setScalar(c.R * .62 * (1 + mSw * .75 + Math.sin(t * 9 + i) * .04 * mSw)); m.children[0].material.opacity = .55 + mSw * .25; this.mFlash[i].visible = mfl > .001; this.mFlash[i].material.opacity = mfl * .95; this.mFlash[i].scale.setScalar(.8 + mfl * 1.8); });
    this.flare.visible = fl > .001;
    this.flare.material.opacity = fl;
    this.ghost.material.uniforms.uOpacity.value = ghost; this.ghost.visible = ghost > .01;
    const dv = this.debris.n;
    if (deb > 0 && deb < 3.5) { const cp = c.group.position, R0 = c.R;
      for (let i = 0; i < dv; i++) { const d = this.dDir[i], r = R0 * (1.02 + deb * d.sp * .29); this.debris.set(i, cp.x + d.v.x * r, cp.y + d.v.y * r - deb * deb * .12, cp.z + d.v.z * r, d.s, this.cCyt, (1 - sm(deb / 3.5)) * .8); }
      this.debris.mesh.visible = true; this.debris.commit();
    } else this.debris.mesh.visible = false;
    return prog;
  },
  refill() {
    const R = this.R; let need = CELLN - this.count(1), needM = MITON - this.count(2);
    for (const a of this.A) { if (a.st !== 0) continue;
      if (need > 0) { a.st = 1; a.mit = false; this.cell.randomInside(R, a.home); a.p.copy(a.home); a.s = 0; need--; }
      else if (needM > 0) { a.st = 2; a.mit = true; a.m = this.cell.mitos[needM % this.cell.mitos.length]; a.home.set((R() - .5) * .5, (R() - .5) * .12, (R() - .5) * .12); a.s = 0; needM--; } }
  },
  drawStrip() {
    if(this.hn===NS){this.previous.removeAttribute("d");this.previousName.textContent="";}
    if (!this.hn) { this.readLevel.removeAttribute('d'); this.trace.setAttribute('d', ''); this.area.setAttribute('d', ''); this.tip.setAttribute('opacity', 0); return; }
    let d = '';
    for (let i = 0; i < this.hn; i++) d += (i ? 'L' : 'M') + (i / (NS - 1) * SW).toFixed(1) + ' ' + (SH - this.hist[i] * SH).toFixed(1);
    this.trace.setAttribute('d', d);
    const xe = ((this.hn - 1) / (NS - 1) * SW).toFixed(1);
    this.area.setAttribute('d', d + `L${xe} ${SH}L0 ${SH}Z`);
    const levelY = (SH - this.hist[this.hn - 1] * SH).toFixed(1);
    this.readLevel.setAttribute('d', `M${xe} ${levelY}H${SW + 32}`);
    this.tip.setAttribute('opacity', 1); this.tip.setAttribute('cx', xe); this.tip.setAttribute('cy', (SH - this.hist[this.hn - 1] * SH).toFixed(1));
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    // A brief dolly into the first release keeps the membrane and the chart readable.
    if (this.b === 2 && this.necT0 !== null) {
      const u = clamp((t - this.necT0) / 2.8);
      const focus = Math.sin(Math.PI * u) ** 2;
      this.camera.position.z -= .24 * focus;
      this.camera.position.x -= .10 * focus;
    }
    if(this.b===5){
      this.exampleStreams.forEach(({organ,stream,color},i)=>{
        const age=Math.max(0,t-this.exampleStart-i*.25);
        organ.rotation.y=-.25*(1-ease.out(clamp(age/1.2)))+.13*Math.sin(age*.58);
        organ.rotation.z=.035*Math.sin(age*.44+i);
        for(let j=0;j<12;j++){const f=(t*.53+j/12+i*.17)%1;
          stream.set(j,-.25+.92*f,.08+.65*Math.sin(Math.PI*f)+.23*f,.19,.065,color,Math.sin(Math.PI*f));}
        stream.commit();
      });
      this.exampleFills.forEach((m,i)=>{const u=clamp((t-this.exampleStart-i*.25)/1.1);m.scale.y=.20+.6*ease.io(u);m.position.y=-.53+m.scale.y/2;this.examples.children[i].position.x=(i-1)*3.34-.21+1.25*(1-ease.out(u));});
      for(const l of this.labs)l.update(this.camera);
      return;
    }
    const M = this.mode, R = this.R;
    const pore = this.pore.v; this.cell.memU.uPore.value = pore;
    const sh = this.necrosis(t);
    // synthesis: new enzymes appear around the nucleus and walk out to the cytosol
    const syn = this.syn.v;
    if (M.syn) { this.acc2 = (this.acc2 || 0) + dt * 3.2; while (this.acc2 > 1) { this.acc2--; const a = this.free(); if (a) { a.st = 1; a.mit = false; this.cell.randomInside(R, a.home); a.p.copy(this.cell.nucleus.position); a.s = 0; } } }
    this.synth.mesh.visible = syn > .001;
    if (this.synth.mesh.visible) {
      for (let i = 0; i < 60; i++) { const ang = i / 60 * 6.28 + t * .6, r = .75 + .1 * Math.sin(t * 3 + i); const np = this.cell.nucleus.position;
        this.synth.set(i, np.x + Math.cos(ang) * r, np.y + Math.sin(ang * 2) * .2, np.z + Math.sin(ang) * r, .07, this.cCyt, syn * (.45 + .4 * Math.sin(t * 4 + i))); }
      this.synth.commit();
    }
    // release: from the intact cell (basal, pores, synthesis), or a trickle from the damaged tissue after necrosis
    this.acc += dt * M.rate;
    while (this.acc > 1) { this.acc--;
      if (!M.shatter) { let best = null; for (const a of this.A) if (a.st === 1 && a.s > .9 && (!best || a.home.x > best.home.x)) { best = a; if (R() < .3) break; } if (best) this.release(best); }
      else if (sh > .9) { const a = this.free(); if (a) { a.mit = R() < .25; a.st = 3; a.t = 0; a.s = 1; a.from.copy(this.cell.group.position).add(this.jit.set((R() - .5) * 2, (R() - .5) * 2, (R() - .5))); } }
    }
    if (!M.shatter && sh < .01 && this.count(1) < CELLN * .6) this.refill();
    // elimination: each enzyme in plasma has a constant chance to be cleared
    // (a flux accumulator instead of independent coin flips: with ~14 basal enzymes the coin flips made the level
    //  wander by ±30 %, so the plasma looked out of balance at rest)
    const kk = M.k; let n = 0;
    for (const a of this.A) if (a.st === 4) n++;
    this.rAcc = (this.rAcc || 0) + kk * n * dt;
    while (this.rAcc >= 1 && n > 0) { this.rAcc--; let j = Math.floor(R() * n);
      for (const a of this.A) if (a.st === 4 && j-- === 0) { a.st = 5; a.t = 0; a.from.copy(a.p); break; }
      n--; }
    this.N = n; this.Ns = damp(this.Ns, n, 3, dt);
    // move + draw
    // The cell pose is shared by every agent for the duration of this frame.
    this.cell.group.updateWorldMatrix(true, false);
    for (const mito of this.cell.mitos) mito.updateWorldMatrix(false, false);
    let idx = 0, arrived = 0;
    for (let i = 0; i < MAX; i++) {
      const a = this.A[i]; if (a.st === 0) continue;
      let col = a.mit ? this.cMit : this.cCyt;
      if (a.st === 1) { a.s = Math.min(1, a.s + dt * 1.5); a.p.lerp(a.home, Math.min(1, dt * 1.2)); this.tmp.set(a.p.x + Math.sin(t * .9 + a.ph) * .06, a.p.y + Math.cos(t * .8 + a.ph) * .06, a.p.z + Math.sin(t * .7 + a.ph) * .06); this.tmp.applyMatrix4(this.cell.group.matrixWorld); }
      else if (a.st === 2) { a.s = Math.min(1, a.s + dt); this.tmp.copy(a.home); this.tmp.x += Math.sin(t + a.ph) * .05; this.tmp.applyMatrix4(a.m.matrixWorld); }
      else if (a.st === 3) {
        a.t += dt * .42; if (a.t < 0) { this.tmp.copy(a.from); }
        else { const k = Math.min(1, a.t);
          this.path.getPoint(ease.io(k), this.tmp);
          this.off3.copy(a.from).sub(this.p0).multiplyScalar(1 - smooth01(k * 2.2));
          this.tmp.add(this.off3);
          this.tmp.add(this.jit.set(Math.sin(a.ph + t * 3) * .1, Math.cos(a.ph + t * 2.6) * .1, Math.sin(a.ph * 2 + t * 2) * .12).multiplyScalar(Math.sin(k * Math.PI)));
          if (k >= 1) { a.st = 4; arrived++; a.p.copy(this.tmp); a.v.set((R() - .5) * .8, -1.1 - R() * .6, (R() - .5) * .8); } }
        a.cur.copy(this.tmp);
      }
      else if (a.st === 4) {
        a.v.x += (R() - .5) * dt * 3; a.v.y += (R() - .5) * dt * 3; a.v.z += (R() - .5) * dt * 3; a.v.multiplyScalar(1 - dt * 1.2);
        a.p.addScaledVector(a.v, dt);
        const dx = a.p.x - POOL.x, dz = a.p.z, rr = Math.hypot(dx, dz), lim = POOL.r - .12;
        if (rr > lim) { a.p.x = POOL.x + dx / rr * lim; a.p.z = dz / rr * lim; a.v.x *= -.5; a.v.z *= -.5; }
        const ylo = POOL.y + POOL.y0 + .12, yhi = POOL.y + POOL.y0 + (POOL.y1-POOL.y0)*(.42+.58*clamp(this.Ns/FULL)) - .05;
        if (a.p.y < ylo) { a.p.y = ylo; a.v.y = Math.abs(a.v.y) * .5; } if (a.p.y > yhi) { a.p.y = yhi; a.v.y = -Math.abs(a.v.y) * .5; }
        this.tmp.copy(a.p);
      }
      else if (a.st === 6) { a.t += dt * 1.4; a.s = 1 - smooth01(a.t); this.tmp.copy(a.p); if (a.t >= 1) { a.st = 0; continue; } }
      else if (a.st === 5) {
        a.t += dt * .55; const k = Math.min(1, a.t);
        if (k < .6) this.tmp.lerpVectors(a.from, this.mouth, ease.io(k / .6)); else this.tmp.lerpVectors(this.mouth, this.outP, (k - .6) / .4);
        a.s = 1 - smooth01((k - .7) / .3); col = this.cTmp.copy(col).lerp(this.cOut, k);
        if (k >= 1) { a.st = 0; continue; }
      }
      this.q.setFromAxisAngle(this.ax, t * .6 + a.ph); this.sv.setScalar(Math.max(.001, a.s));
      this.m4.compose(this.tmp, this.q, this.sv); this.blobs.setMatrixAt(idx, this.m4); this.blobs.setColorAt(idx, col); idx++;
    }
    this.blobs.count = idx; this.blobs.instanceMatrix.needsUpdate = true; if (this.blobs.instanceColor) this.blobs.instanceColor.needsUpdate = true;
    // fluxes: measured arrivals (smoothed over ~3 s) vs removal = k × amount in the plasma
    const tau = 1.5; this.inR = this.inR * Math.exp(-dt / tau) + arrived / tau;
    this.inD = damp(this.inD, this.inR, 2, dt); this.outD = damp(this.outD, kk * this.Ns, 2, dt);
    // The bars are 330 design pixels wide; subpixel changes need no style write.
    const inWidth = Math.round(330 * clamp(this.inD / FMAX));
    const outWidth = Math.round(330 * clamp(this.outD / FMAX));
    if (inWidth !== this.lastInWidth) { this.bIn.style.transform = 'scaleX('+inWidth/330+')'; this.lastInWidth = inWidth; }
    if (outWidth !== this.lastOutWidth) { this.bOut.style.transform = 'scaleX('+outWidth/330+')'; this.lastOutWidth = outWidth; }
    // verdict: arrival vs removal as drawn by the bars. A tight threshold (a gap of ~10 % already reads as rising /
    // falling, which is what the strip chart shows) with hysteresis and a short hold, so basal noise never flickers it.
    const diff = this.inD - this.outD, mx = Math.max(this.inD, this.outD), on = .08 * mx + .25, off = .03 * mx + .15;
    const was = this.verdict || 'eq';
    let v = was === 'up' ? (diff > off ? 'up' : diff < -on ? 'down' : 'eq')
      : was === 'down' ? (diff < -off ? 'down' : diff > on ? 'up' : 'eq')
        : (diff > on ? 'up' : diff < -on ? 'down' : 'eq');
    // the level's own trend over the last 1.5 s overrides a lagging flux reading (after the necrosis burst the plasma
    // is already falling while the smoothed inflow still looks high)
    if (this.hn >= 7) { const tr = this.Ns - this.hist[this.hn - 7] * FULL; if (tr < -2.5) v = 'down'; else if (tr > 2.5) v = 'up'; }
    if (!this.verdict) this.vHold = 0; else if (v !== was) { this.vHold += dt; if (this.vHold < .6) v = was; else this.vHold = 0; } else this.vHold = 0;
    this.dbg = [this.inD, this.outD, this.Ns];
    if (v !== this.verdict) { this.verdict = v;
      this.bVerdict.innerHTML = v === 'up' ? `iristea <b style="color:var(--coral)">&gt;</b> desagertzea → <b style="color:var(--coral)">igotzen</b>`
        : v === 'down' ? `iristea <b style="color:var(--blue)">&lt;</b> desagertzea → <b style="color:var(--blue)">jaisten</b>`
          : `iristea <b style="color:var(--ink)">≈</b> desagertzea → <b style="color:var(--amber)">oreka</b>`; }
    this.tube.material.opacity = .12 + clamp(this.inD / FMAX) * .42;
    // pool + meter + strip chart all read the same amount
    const lvl = clamp(this.Ns / FULL);
    const depth=.42+.58*clamp(lvl); this.liquid.scale.y=depth;
    this.liquid.position.y=POOL.y0+(POOL.y1-POOL.y0)*depth/2;
    this.surf.position.y=POOL.y0+(POOL.y1-POOL.y0)*depth+.04;
    this.liquid.material.uniforms.uI.value = .25 + lvl * .5; this.surf.material.opacity = .15 + lvl * .3;
    const dr = this.drainR.v; this.pipe.scale.set(dr, 1, dr); this.valve.scale.setScalar(.6 + dr * .4);
    const levelHeight = Math.round(lvl * SH);
    if (levelHeight !== this.lastLevelHeight) {
      this.fill.setAttribute('height', levelHeight);
      this.fill.setAttribute('y', SH - levelHeight);
      this.lastLevelHeight = levelHeight;
    }
    this.hAcc += dt;
    if (this.hAcc >= DTS) { this.hAcc -= DTS; if (this.hn === NS) { this.hist.copyWithin(0, 1); this.hn--; } this.hist[this.hn++] = lvl; this.drawStrip(); }
    this.labs[0].vis = 1 - clamp(sh * 2.5); this.labs[1].vis = clamp(sh * 2.5 - 1.2); // the healthy-cell label hands over to the necrotic one
    for (let i = 0; i < this.flowS.length; i++) { const f = this.flowS[i], a = f.a + t * .5 / (f.r + .35);
      this.flow.set(i, Math.cos(a) * f.r, POOL.y0 + (f.y-POOL.y0)*depth + Math.sin(t * .7 + f.ph)*.035, Math.sin(a) * f.r, f.s, this.cFlow, .35 + .2 * Math.sin(a * 2 + f.ph)); }
    this.flow.commit();
    for (const l of this.labs) l.update(this.camera);
  },
};
function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
