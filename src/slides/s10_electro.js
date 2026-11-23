// 10 · Electrophoresis separates the LDH isoenzymes. Each band moves toward the anode (+) with a mobility that grows with
// its number of H subunits (more negative charge), and spreads by diffusion as the run proceeds. Two samples are run side
// by side: their isoenzyme amounts come from the same binomial shares as slide 9 (H-rich vs M-rich tissue), so the band
// pattern and the densitometer trace point to the origin. The gel shader and the trace use the same band model.
import { THREE, Tw, add, ease, clamp, Label, screenOf } from '../core.js';
import { makeScene, Pts, C, halo, contactShadow } from '../lib3d.js';
import { PAL, COL3, INK, MUTE, PAPER, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { el } from '../chart.js';
import { binomialShares } from '../sim.js';

const WELL = 3.0, TRAVEL = 6.0, GW = 7.4, GD = 3.2;
const NH = [4, 3, 2, 1, 0];
const MOB = NH.map(n => .1 + .9 * n / 4);           // relative mobility toward +: LDH1 fastest, LDH5 hardly moves
const LANES = [{ z: -.75, p: .82, col: PAL.red, name: '1. lagina' }, { z: .75, p: .12, col: PAL.blue, name: '2. lagina' }];
const GAIN = 4.2, S0 = .06;
const sigma = r => Math.sqrt(S0 * S0 + .012 * r);   // diffusion: width grows with √time
const STAIN = '#4A2E9C';                              // formazan-like purple of a stained LDH zymogram

function bandMat(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uX[5]; uniform float uS[5]; uniform float uA0[5]; uniform float uA1[5]; uniform float uLoad, uWell; uniform vec3 uAbs;
      varying vec2 vUv;
      float lane(float z, float c){ return 1. - smoothstep(.42, .5, abs(z - c)); }
      void main(){
        float x = (vUv.x - .5) * ${GW.toFixed(1)}, z = (.5 - vUv.y) * ${GD.toFixed(1)};
        float d0 = 0., d1 = 0.;
        for (int i = 0; i < 5; i++){ float q = (x - uX[i]) / uS[i]; float g = exp(-q * q); d0 += uA0[i] * g; d1 += uA1[i] * g; }
        float m0 = lane(z, ${LANES[0].z.toFixed(2)}), m1 = lane(z, ${LANES[1].z.toFixed(2)});
        float d = (d0 * m0 + d1 * m1) * uLoad;
        float well = (1. - smoothstep(.07, .1, abs(x - uWell))) * (1. - smoothstep(.38, .44, min(abs(z - ${LANES[0].z.toFixed(2)}), abs(z - ${LANES[1].z.toFixed(2)}))));
        // stain absorbs light (Beer–Lambert): transmitted = exp(−density · absorbance per channel); multiplied onto the gel
        vec3 T = exp(-min(d, 2.5) * uAbs) * (1. - well * .3);
        // pale agarose: faint cool tint, brighter towards the middle, slightly darker near the edges
        vec2 e = abs(vUv - .5) * 2.;
        vec3 gel = vec3(.74, .81, .88) * (1.02 - .06 * pow(max(e.x, e.y), 6.)) + .015 * sin(vUv.x * 40. + vUv.y * 17.) * 0.;
        gl_FragColor = vec4(gel * T, 1.);
      }`,
  });
}

// rounded box: a subdivided box whose vertices are pulled onto a box of radius-r rounded edges
function roundBox(w, h, d, r, seg = 5) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c); if (v.lengthSq() > 1e-9) v.setLength(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// a cable: tube along a smooth curve
const cable = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 10), mat);
// LCD read-out of the power supply (voltage is schematic)
function lcdTex() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const x = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, draw(on) {
    x.fillStyle = on ? '#16302A' : '#2A3238'; x.fillRect(0, 0, 256, 96);
    x.font = '700 62px Consolas, Menlo, monospace'; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillStyle = on ? '#7CF5C8' : '#56636B'; x.fillText(on ? '100 V' : '  0 V', 236, 52);
    tex.needsUpdate = true;
  } };
}

export default {
  id: 'electro', chapter: 3, beats: 5, title: 'Isoentzimak: elektroforesia', bloom: .8,
  build(layer) {
    const S = makeScene({ gx: .5, gy: .55 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    const A = [V(.9, 11.2, 5.0), V(.8, .2, -1.0), 34], B = [V(0, 12.4, 5.4), V(0, .2, -1.0), 36];
    this.shots = [A, B, B, B, B];
    this.rig = new CamRig(this.camera, A[0], A[1], { fov: 36, drift: .03 });
    const gel = new THREE.Group(); gel.scale.setScalar(.86); this.scene.add(gel); this.gel = gel;
    // light acrylic tray, translucent agarose slab
    const tray = new THREE.Mesh(new THREE.BoxGeometry(8.6, .12, 3.9), new THREE.MeshStandardMaterial({ color: '#C9D5E2', roughness: .55, transparent: true, opacity: .6, envMapIntensity: .45, depthWrite: false })); tray.position.y = -.17; gel.add(tray);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(GW, .2, GD), new THREE.MeshStandardMaterial({ color: '#D3DEE8', roughness: .4, envMapIntensity: .5 }));
    gel.add(slab);
    gel.add(new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: C(COL3.glass), transparent: true, opacity: .45 })));
    const sh = contactShadow({ size: 1, opacity: .2 }); sh.scale.set(10, 5.2, 1); sh.position.y = -.24; gel.add(sh);
    // electrodes (platinum wires on coloured posts)
    const mkEl = (x, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.14, .22, 3.5), new THREE.MeshStandardMaterial({ color: C(col), roughness: .45, envMapIntensity: .6 })); m.position.set(x, -.02, 0); gel.add(m); return m; };
    mkEl(-4.05, COL3.red); mkEl(4.05, COL3.ink);
    // ---------------------------------------------------------------- the real set-up around the gel
    // buffer tank (clear acrylic walls), buffer over the gel, end reservoirs where the platinum electrodes sit
    const tankG = new THREE.BoxGeometry(10.2, .9, 4.7);
    // inner faces only, so the walls never veil the gel
    const tank = new THREE.Mesh(tankG, new THREE.MeshPhysicalMaterial({ color: '#DCE7F2', roughness: .15, transparent: true, opacity: .22, envMapIntensity: .8, depthWrite: false, side: THREE.BackSide }));
    tank.position.y = .05; tank.renderOrder = 2; gel.add(tank);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tankG), new THREE.LineBasicMaterial({ color: C(COL3.glass), transparent: true, opacity: .55 })); edges.position.y = .05; gel.add(edges);
    const resMat = new THREE.MeshPhysicalMaterial({ color: '#A9CBEA', roughness: .1, clearcoat: 1, transparent: true, opacity: .4, envMapIntensity: 1, depthWrite: false });
    for (const x of [-4.6, 4.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, 4.4), resMat); r.position.set(x, -.12, 0); gel.add(r); }
    const ptMat = new THREE.MeshStandardMaterial({ color: '#D9DEE6', metalness: .9, roughness: .25, envMapIntensity: 1.2 });
    this.wireX = [-4.6, 4.6];
    for (const x of this.wireX) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 4.2, 8), ptMat); w.rotation.x = Math.PI / 2; w.position.set(x, -.25, 0); gel.add(w); }
    // connectors at the front corners, leads to the power supply on the right
    const capR = new THREE.MeshPhysicalMaterial({ color: C(COL3.red), roughness: .4, clearcoat: .6 }), capK = new THREE.MeshPhysicalMaterial({ color: '#2B3140', roughness: .4, clearcoat: .6 });
    const post = (x, m) => { const g = new THREE.Group(); g.position.set(x, .5, 2.05); gel.add(g);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .3, 20), m); a.position.y = .15; g.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .2, 12), ptMat); b.position.y = -.05; g.add(b); };
    post(-4.6, capR); post(4.6, capK);
    const PS = V(6.55, -.05, 1.75);
    const leadR = new THREE.MeshPhysicalMaterial({ color: C(COL3.red), roughness: .45, clearcoat: .5 }), leadK = new THREE.MeshPhysicalMaterial({ color: '#2B3140', roughness: .45, clearcoat: .5 });
    // the red lead drops outside the tank wall and runs on the bench under the tank's clear front strip (in front of the
    // gel slab, so it stays visible through the acrylic all the way) to the supply
    gel.add(cable([V(-4.6, .8, 2.05), V(-4.85, .55, 2.45), V(-5.25, -.2, 2.45), V(-4.8, -.47, 2.2), V(-2, -.47, 2.15), V(2.5, -.47, 2.15), V(5.0, -.47, 2.2), V(5.5, -.3, 2.45), V(PS.x - .55, .2, PS.z + .75), V(PS.x - .35, .36, PS.z + .4)], .055, leadR));
    gel.add(cable([V(4.6, .8, 2.05), V(4.8, .55, 2.35), V(5.3, .1, 2.4), V(PS.x - .15, .45, PS.z + .8), V(PS.x + .05, .36, PS.z + .4)], .055, leadK));
    // power supply: rounded case, LCD read-out and an indicator that lights while the current flows
    const ps = new THREE.Group(); ps.position.copy(PS); gel.add(ps); this.ps = ps;
    const body = new THREE.Mesh(roundBox(1.5, .62, 1.35, .12), new THREE.MeshPhysicalMaterial({ color: '#B9C4D2', roughness: .5, clearcoat: .4, envMapIntensity: .8 })); body.position.y = .31 - .3; ps.add(body);
    const sps = contactShadow({ size: 1, opacity: .22 }); sps.scale.set(2.3, 2, 1); sps.position.y = -.31; ps.add(sps);
    this.lcd = lcdTex(); this.lcd.draw(false); this.lcdOn = false;
    const lcdM = new THREE.Mesh(new THREE.PlaneGeometry(.92, .345), new THREE.MeshBasicMaterial({ map: this.lcd.tex, toneMapped: false })); lcdM.rotation.x = -Math.PI / 2; lcdM.position.set(-.12, .325, -.12); ps.add(lcdM);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), new THREE.MeshBasicMaterial({ color: '#4B5560' })); this.led.position.set(.5, .33, -.12); ps.add(this.led);
    this.ledOn = C('#3DF08F').multiplyScalar(2.2); this.ledOff = C('#4B5560');
    this.ledGlow = halo('#3DF08F', .42, 0, { additive: true }); this.ledGlow.position.set(.5, .42, -.12); ps.add(this.ledGlow);
    for (const [x, m] of [[-.35, capR], [.05, capK]]) { const j = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .06, 16), m); j.position.set(x, .33, .38); ps.add(j); }
    // electrolysis bubbles on the platinum wires while the current is on
    this.bub = new Pts(48); gel.add(this.bub.mesh); this.bubC = C('#FFFFFF');
    // band model uniforms (shared by the gel shader and the densitometer trace)
    this.U = { uX: { value: [0, 0, 0, 0, 0] }, uS: { value: [S0, S0, S0, S0, S0] }, uA0: { value: [0, 0, 0, 0, 0] }, uA1: { value: [0, 0, 0, 0, 0] }, uLoad: { value: 0 }, uWell: { value: WELL }, uAbs: { value: new THREE.Vector3(2.7, 3.5, 1.15) } };
    this.shares = LANES.map(l => binomialShares(l.p, 4));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD), bandMat(this.U)); top.rotation.x = -Math.PI / 2; top.position.y = .108; gel.add(top);
    // the sample drops into the two wells
    this.drops = LANES.map(l => { const m = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 14), new THREE.MeshStandardMaterial({ color: C(STAIN), roughness: .3 })); m.position.set(WELL, 1, l.z); gel.add(m); return m; });
    // anions drifting toward + while the current is on
    this.ions = new Pts(60); gel.add(this.ions.mesh); this.ionC = C(COL3.teal);
    this.glowP = halo(COL3.red, 1.6, 0); this.glowP.position.set(-4.05, .3, 0); gel.add(this.glowP);
    // densitometer head
    this.scanner = new THREE.Mesh(new THREE.BoxGeometry(.05, .06, 3.3), new THREE.MeshBasicMaterial({ color: C(COL3.teal), transparent: true, opacity: .9 })); this.scanner.position.set(-3.7, .2, 0); gel.add(this.scanner);
    this.scanGlow = halo(COL3.teal, 1, .35); this.scanGlow.scale.set(.6, 3, 1); this.scanner.add(this.scanGlow);
    this.load = new Tw(0); this.run = new Tw(0); this.scan = new Tw(0); this.traceOn = new Tw(0); this.live = new Tw(0);
    // 3D labels
    this.lp = new Label(layer, '<span style="font:700 50px/1 var(--sans)">+</span>', { color: PAL.red, anchor: V(-4.05, .3, -1.9), obj: gel });
    this.ln = new Label(layer, '<span style="font:700 50px/1 var(--sans)">−</span>', { color: INK, anchor: V(4.05, .3, -1.9), obj: gel });
    this.lw = new Label(layer, 'Lagina', { color: INK, anchor: V(WELL, .2, -1.3), obj: gel, b: '0-1' });
    this.lanes = LANES.map(l => new Label(layer, `<b>${l.name}</b>`, { color: l.col, anchor: V(4.3, .12, l.z), obj: gel, side: 'r' }));
    this.lscan = new Label(layer, 'Densitometroa', { color: PAL.teal, anchor: V(0, .25, 1.75), obj: this.scanner, b: '2-2' });
    // densitometric traces (svg overlay)
    this.svg = el('svg', { class: 'chart', width: 1920, height: 1080, viewBox: '0 0 1920 1080' }); this.svg.style.left = '0px'; this.svg.style.top = '0px'; layer.appendChild(this.svg);
    this.base = el('line', { stroke: alpha(INK, .5), 'stroke-width': 2 }, this.svg);
    this.traces = LANES.map(l => el('path', { fill: alpha(l.col, .14), stroke: l.col, 'stroke-width': 4, 'stroke-linejoin': 'round' }, this.svg));
    this.peakT = NH.map((n, i) => { const t = el('text', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: INK, opacity: 0 }, this.svg); t.textContent = `LDH${i + 1}`; return t; });
    this.originOn = new Tw(0);
    this.origin = add(layer, `<div class="abs" style="left:96px;top:920px;width:1100px;font:600 27px/1.45 var(--sans);opacity:0">
      <div><b style="color:var(--red)">1. lagina</b>: LDH1, LDH2 nagusi → <b>miokardioa</b> edo <b>eritrozitoak</b>?</div>
      <div><b style="color:var(--blue)">2. lagina</b>: LDH5 nagusi → <b>gibela</b> edo <b>hezur-muskulua</b>?</div></div>`);
    this.yAx = el('text', { 'font-size': 20, 'font-weight': 600, fill: MUTE, opacity: 0 }, this.svg); this.yAx.textContent = 'Absorbantzia';
    // HTML
    add(layer, `<div class="eyebrow"><b>4</b>Isoentzimen ekarpena</div>`);
    add(layer, `<div class="h1">Isoentzimak <em>elektroforesi</em> bidez bereiztea</div>`);
    add(layer, `<div class="key" data-b="-1" style="top:236px;bottom:auto;font-size:34px">Eremu elektrikoan, <em>mugikortasunaren</em> arabera bereizten dira</div>`);
    this.amp = add(layer, `<div class="pill" data-b="1-1" style="position:absolute;left:96px;top:300px;color:var(--red)"><span class="dotp" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--red);margin-right:10px;vertical-align:1px"></span>Korrontea piztuta</div>`);
    this.dotp = this.amp.querySelector('.dotp');
    add(layer, `<div class="note" data-b="1-1" style="left:96px;top:944px;font-size:26px;max-width:1500px">H azpiunitateek karga negatibo gehiago → <b style="color:var(--red);font-style:normal">LDH1</b> azkarren doa (+) polorantz · <b style="color:var(--blue);font-style:normal">LDH5</b> ia ez da mugitzen</div>`);
    add(layer, `<div class="key" data-b="2-2" style="top:236px;bottom:auto;font-size:34px">Banden patroia → forma bakoitzaren <em>ekarpen erlatiboa</em> → <em>jatorria</em></div>`);
    add(layer, `<div class="note" data-b="2-2" style="right:96px;top:972px;font-size:20px;text-align:right">Patroi eskematikoa: altuerak eta zabalerak ez dira neurketa-balioak</div>`);
    const uses = [['Jatorria kokatzeko', 'Jarduera osoaren igoeran zein formak parte hartzen duen'], ['Jatorri posibleak bereizteko', 'Aldaketak ehun jakin batekin bateragarriagoak diren'], ['Emaitza osoa osatzeko', 'Forma bakoitzaren jarduerari buruzko informazioa']];
    uses.forEach(([h, p], i) => add(layer, `<div class="card pop d${i + 1}" data-b="3-3" style="left:${96 + i * 584}px;top:854px;width:556px;padding:18px 26px"><h4 style="color:var(--violet)">${i + 1}. ${h}</h4><p style="font-size:22px">${p}</p></div>`));
    add(layer, `<div class="key" data-b="3-3" style="top:236px;bottom:auto;font-size:34px">Isoentzimen neurketa <em>hiru egoeratan</em> da erabilgarria</div>`);
    add(layer, `<div class="key" data-b="4" style="top:236px;bottom:auto;font-size:34px;max-width:1700px">Ehun batek baino gehiagok isoentzima bera izan dezake → patroia = <em>aztarna</em></div>`);
    add(layer, `<div class="card" data-b="4" style="left:420px;top:866px;width:1080px;display:flex;gap:40px;padding:22px 34px;justify-content:center;font:500 27px/1.3 var(--sans)">
      <div><b style="color:var(--coral)">CK-MB</b> → miokardioa <span style="color:var(--mute)">+</span> hezur-muskulua</div><div><b style="color:var(--red)">LDH1</b> → miokardioa <span style="color:var(--mute)">+</span> eritrozitoak</div></div>`);
    add(layer, `<div class="note" data-b="4" style="left:0;right:0;top:968px;text-align:center;font-size:24px">Laginaren kalitatea, beste markatzaileak eta pazientearen datuak patroiarekin batera</div>`);
    this._v = V(0, 0, 0);
  },
  enter(b) { const s = this.shots[b]; this.rig.arrive(s[0], s[1], s[2]); this.apply(b, true); },
  beat(b) { const s = this.shots[b]; this.rig.go(s[0], s[1], 1.8, s[2]); this.apply(b, false); },
  apply(b, inst) {
    this.b = b;
    if (b === 0) { if (inst) this.load.set(0); this.load.to(1, 1.8, ease.out, inst ? .6 : .2); this.run.to(0, inst ? .01 : .8); }
    else if (b === 1) { this.load.to(1, .01); if (inst) this.run.set(0); this.run.to(1, 6, ease.lin, inst ? .8 : .3); }
    else { this.load.to(1, .01); this.run.to(1, inst ? .01 : .6); }
    this.live.to(b === 1 ? 1 : 0, inst ? .01 : .8);
    if (b === 2) { this.scan.set(0).to(1, 3.4, ease.io, inst ? 1 : .5); }
    else this.scan.to(b > 2 ? 1 : 0, .01);
    this.traceOn.to(b >= 2 ? 1 : 0, inst ? .01 : .6);
    this.originOn.to(b === 2 ? 1 : 0, inst ? .01 : .6, ease.io, b === 2 && !inst ? 3.6 : 0);
  },
  // band density of lane l at gel position x (same formula as the shader)
  dens(l, x) {
    const u = this.U, A = l ? u.uA1.value : u.uA0.value; let d = 0;
    for (let i = 0; i < 5; i++) { const q = (x - u.uX.value[i]) / u.uS.value[i]; d += A[i] * Math.exp(-q * q); }
    return d * u.uLoad.value;
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const L = this.load.v, Rn = this.run.v, running = this.b === 1 && this.run.b > 0 && Rn > 0; // current on for the whole beat the pill says so
    // band model: position by mobility × time, width by diffusion, amount by isoenzyme share
    const u = this.U, sg = sigma(Rn);
    for (let i = 0; i < 5; i++) {
      u.uX.value[i] = WELL - TRAVEL * MOB[i] * Rn; u.uS.value[i] = sg;
      u.uA0.value[i] = this.shares[0][i] * GAIN * S0 / sg; u.uA1.value[i] = this.shares[1][i] * GAIN * S0 / sg;
    }
    const dropK = clamp(L * 1.5);
    u.uLoad.value = clamp((L - .62) / .3);
    this.drops.forEach(m => { m.position.y = .12 + (1 - ease.in(dropK)) * 1.6; m.visible = dropK < .99 && L > .001; m.scale.set(1, 1 - .5 * clamp((dropK - .8) / .2), 1); });
    // current
    for (let i = 0; i < 60; i++) { const ph = ((t * .25 + i / 60) % 1); const on = running ? 1 : 0;
      this.ions.set(i, 3.9 - ph * 7.8, .16 + Math.sin(i * 7) * .03, ((i * 37) % 25) / 10 - 1.2, .05, this.ionC, on * .55 * Math.sin(ph * Math.PI)); }
    this.ions.commit();
    this.glowP.material.opacity = running ? .3 + .1 * Math.sin(t * 4) : 0;
    if (running !== this.lcdOn) { this.lcdOn = running; this.lcd.draw(running); }
    this.led.material.color.copy(running ? this.ledOn : this.ledOff);
    this.ledGlow.material.opacity = running ? .55 + .15 * Math.sin(t * 5) : 0;
    for (let i = 0; i < 48; i++) { const ph = (t * (.5 + (i % 7) * .06) + i * .618) % 1, side = i % 2, x = this.wireX[side] + Math.sin(i * 3.1 + t) * .06;
      this.bub.set(i, x, -.2 + ph * .4, ((i * 0.37) % 1) * 4 - 2, .045 + (i % 3) * .015, this.bubC, running ? .75 * Math.sin(ph * Math.PI) : 0); }
    this.bub.commit();
    this.dotp.style.opacity = running ? (.5 + .5 * Math.sin(t * 6)).toFixed(2) : .25;
    // scanner
    const sc = this.scan.v, xs = -3.8 + sc * 7.3;
    this.scanner.position.x = xs; this.scanner.visible = this.b === 2 && sc > 0 && sc < 1; this.lscan.vis = this.scanner.visible ? 1 : 0;
    this.origin.style.opacity = this.originOn.v.toFixed(3);
    this.lw.vis = 1 - clamp((Rn - .9) / .05); // the well label gives way to the LDH5 peak name
    this.lp.update(this.camera); this.ln.update(this.camera); this.lw.update(this.camera); this.lscan.update(this.camera);
    for (const l of this.lanes) l.update(this.camera);
    // traces above the gel: x follows the gel on screen
    const tOn = Math.max(this.traceOn.v, this.live.v * .7);
    if (tOn > .001) {
      const v = this._v, g = this.gel;
      const x0 = screenOf(v.set(-3.8, .12, -1.65), this.camera, g), x1 = screenOf(v.set(3.6, .12, -1.65), this.camera, g);
      const base = Math.min(x0.y, x1.y) - 34, Hpx = 130;
      const xEnd = this.b === 2 ? xs : (this.b > 2 ? 3.6 : 3.6);
      const N = 150;
      this.traces.forEach((p, l) => {
        let d = '', lastX = x0.x;
        for (let k = 0; k <= N; k++) {
          const gx = -3.8 + 7.4 * k / N; if (gx > xEnd + 1e-6) break;
          const sx = x0.x + (x1.x - x0.x) * k / N; lastX = sx;
          const y = Math.min(1.35, this.dens(l, gx));
          d += (k ? 'L' : 'M') + sx.toFixed(1) + ' ' + (base - y * Hpx).toFixed(1);
        }
        p.setAttribute('d', d ? d + `L${lastX.toFixed(1)} ${base} L${x0.x.toFixed(1)} ${base}Z` : '');
        p.setAttribute('opacity', tOn.toFixed(3));
        p.setAttribute('fill-opacity', this.traceOn.v.toFixed(3));
      });
      this.base.setAttribute('x1', x0.x); this.base.setAttribute('x2', x1.x); this.base.setAttribute('y1', base); this.base.setAttribute('y2', base); this.base.setAttribute('opacity', tOn);
      this.yAx.setAttribute('x', x0.x); this.yAx.setAttribute('y', base - Hpx - 30); this.yAx.setAttribute('opacity', this.traceOn.v);
      // peak names under the baseline, once the bands have separated and the scan has passed them
      const xmap = gx => x0.x + (x1.x - x0.x) * (gx + 3.8) / 7.4;
      this.peakT.forEach((tx, i) => { const gx = u.uX.value[i]; tx.setAttribute('x', xmap(gx).toFixed(1)); tx.setAttribute('y', base + 28); tx.setAttribute('opacity', (Rn > .95 && gx <= xEnd + .05 ? tOn : 0).toFixed(2)); });
    } else {
      this.traces.forEach(p => p.setAttribute('opacity', 0)); this.base.setAttribute('opacity', 0); this.yAx.setAttribute('opacity', 0);
      this.peakT.forEach(tx => tx.setAttribute('opacity', 0));
    }
  },
};
