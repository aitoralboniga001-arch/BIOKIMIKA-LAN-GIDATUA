// 3D pieces for slide 1: an HDL particle worked on by LCAT, the clotting cascade ending in a fibrin mesh,
// and a two-cuvette spectrophotometer for the activity assay. Each factory returns { group, update(t, dt) } plus handles.
import { THREE, clamp, ease, rng } from '../core.js';
import { glassMat } from '../optics.js';
import { blobGeo, proteinMat, fresnelMat, halo, rbcGeo, rbcMat, C, COL, COL3 } from '../lib3d.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- HDL + LCAT
// A lipoprotein sphere: a shell of phospholipid head groups around a core of cholesteryl esters. Free cholesterol (gold)
// lands on the surface, drifts to LCAT, is esterified (turns orange) and sinks into the core, which visibly fills up.
export function makeHDL({ R = .7 } = {}) {
  const group = new THREE.Group();
  const NH = 240, NC = 9, CYC = 16;
  // phospholipid heads on a Fibonacci sphere
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.058, 12, 8), new THREE.MeshPhysicalMaterial({ color: C('#F1E6D2'), roughness: .5, clearcoat: .3, envMapIntensity: .8 }), NH);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dirs = []; for (let i = 0; i < NH; i++) { const y = 1 - (i + .5) / NH * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; dirs.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); }
  group.add(heads);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), fresnelMat({ color: COL3.plasma, power: 1.8, intensity: .5, base: .06 }));
  group.add(shell);
  const coreMat = new THREE.MeshPhysicalMaterial({ color: C(COL3.orange), roughness: .35, clearcoat: .6, emissive: C(COL3.orange), emissiveIntensity: .08, envMapIntensity: .8 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), coreMat); group.add(core);
  // LCAT docked on the surface, facing the viewer
  const site = V(.55, .35, .76).normalize();
  const lcat = new THREE.Mesh(blobGeo(31, .3, { lumps: 9, amp: .2, cleft: .7, cleftDir: [.2, .5, 1] }), proteinMat(COL3.mint, { glow: .04 }));
  group.add(lcat);
  const flash = halo(COL.orange, .9, 0); group.add(flash);
  // cholesterol molecules (small capsules)
  const chol = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.055, .13, 4, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .4, clearcoat: .5, envMapIntensity: .8 }), NC);
  chol.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < NC; i++) chol.setColorAt(i, C(COL3.gold)); group.add(chol);
  const Rn = rng(12), ag = [];
  for (let i = 0; i < NC; i++) ag.push({ land: V(Rn() - .5, Rn() - .2, Rn() * .8 + .2).normalize(), from: V(Rn() - .5, Rn() - .5, Rn() - .5).normalize().multiplyScalar(2.4), ph: i / NC });
  const cGold = C(COL3.gold), cEst = C(COL3.orange), cT = C('#fff');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = V(1, 1, 1), p = V(0, 0, 0), d = V(0, 0, 0), up = V(0, 1, 0), spV = V(0, 0, 0);
  const o = { group, lcat, site, fill: 0, R, core,
    update(t) {
      // the core fills over one cycle (nascent -> mature HDL), then the particle relaxes back for the next round
      const c = (t % CYC) / CYC, fill = c < .82 ? smooth(c / .82) : 1 - smooth((c - .82) / .18);
      o.fill = fill;
      const Rr = R * (.9 + .14 * fill); o.Rr = Rr;
      shell.scale.setScalar(Rr * .985); core.scale.setScalar(Rr * (.3 + .42 * fill));
      for (let i = 0; i < NH; i++) { const w = Math.sin(t * 1.3 + i * 1.7) * .012; p.copy(dirs[i]).multiplyScalar(Rr * (1 + w)); sv.setScalar(1); q.identity(); m4.compose(p, q, sv); heads.setMatrixAt(i, m4); }
      heads.instanceMatrix.needsUpdate = true;
      lcat.position.copy(site).multiplyScalar(Rr + .2); lcat.rotation.set(Math.sin(t * .4) * .2, t * .2, 0);
      const sp = spV.copy(site).multiplyScalar(Rr * 1.02);
      let fl = 0;
      for (let i = 0; i < NC; i++) {
        const a = ag[i], u = ((t / 4.2 + a.ph) % 1) * 4.2; let s = 1, col = cGold;
        if (u < 1.1) { const k = ease.out(u / 1.1); d.copy(a.land).multiplyScalar(Rr * 1.03); p.lerpVectors(a.from, d, k); s = clamp(u * 4); }
        else if (u < 2.3) { const k = ease.io((u - 1.1) / 1.2); d.copy(a.land).lerp(site, k).normalize(); p.copy(d).multiplyScalar(Rr * 1.03); }
        else if (u < 2.7) { p.copy(sp); col = cT.copy(cGold).lerp(cEst, (u - 2.3) / .4); fl = Math.max(fl, Math.sin((u - 2.3) / .4 * Math.PI)); }
        else if (u < 3.7) { const k = ease.io((u - 2.7) / 1); p.copy(sp).multiplyScalar(1 - k * .85); col = cEst; s = 1 - k * .6; }
        else { s = 0; }
        q.setFromUnitVectors(up, d.copy(p).normalize()); sv.setScalar(Math.max(.001, s)); m4.compose(p, q, sv); chol.setMatrixAt(i, m4); chol.setColorAt(i, col);
      }
      chol.instanceMatrix.needsUpdate = true; chol.instanceColor.needsUpdate = true;
      flash.position.copy(sp).multiplyScalar(1.08); flash.material.opacity = fl * .55;
    } };
  o.update(0); return o;
}

// ---------------------------------------------------------------- clotting cascade -> fibrin
// NF precursors (each a slightly different shape) switch on one after another (grey -> violet); a spark runs along the
// arrows that link them, so the chain reads as a cascade. The last factor (thrombin) acts on soluble fibrinogen: small
// trinodular rods (D-E-D) that drift in the plasma, line up on the growing fibres and are absorbed into them. The fibres
// polymerise into an irregular, branching, slightly wavy 3D network of thin strands of varying thickness, which finally
// traps two red cells. One cycle = CYC s, then everything relaxes back.
const mergeGeos = list => {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni); let ov = 0, oi = 0;
  for (const g of list) { pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov; ov += g.attributes.position.count; oi += ix.length; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
};
// fibrinogen: a central E nodule and two D nodules at the ends, joined by coiled-coil rods (long axis = y)
function fibrinogenGeo(L = .3) {
  return mergeGeos([new THREE.SphereGeometry(.036, 12, 9), new THREE.SphereGeometry(.03, 12, 9).translate(0, L / 2, 0), new THREE.SphereGeometry(.03, 12, 9).translate(0, -L / 2, 0),
    new THREE.CylinderGeometry(.011, .011, L, 6, 1, true)]);
}
export function makeCascade({ NF = 5, x0 = -1.85, dx = .6, y = -.95, mesh = V(1.95, -.72, 0), size = V(2.0, 1.45, .8) } = {}) {
  const group = new THREE.Group(), CYC = 14.5;
  const cOff = C('#B9B6C8'), cOn = C(COL3.violet), cArrOff = C('#C9C6D4');
  // --- factors: five different shapes, linked by arched arrows
  const SH = [[.16, 7, .24, [1.2, .88, 1]], [.155, 9, .18, [.95, 1.15, .95]], [.165, 6, .28, [1.28, .82, 1]], [.16, 8, .22, [.95, 1, 1.1]], [.19, 10, .2, [1.1, 1.05, 1]]];
  const facs = [];
  for (let i = 0; i < NF; i++) {
    const [r, lumps, amp, sc] = SH[i % SH.length];
    const mat = proteinMat(COL3.lav, { glow: .02 });
    const m = new THREE.Mesh(blobGeo(50 + i, r, { lumps, amp, cleft: .5 }), mat); m.scale.set(...sc);
    const base = V(x0 + i * dx, y - Math.sin(i / (NF - 1) * Math.PI) * .22, .1 * Math.cos(i * 2));
    m.position.copy(base); group.add(m);
    const hh = halo(COL.lav, 1, 0); hh.position.copy(base); group.add(hh);
    facs.push({ m, mat, hh, base, sc });
  }
  const arrows = [], headGeo = new THREE.ConeGeometry(.055, .13, 14);
  const mkArrow = (a, b, lift) => {
    const mid = a.clone().add(b).multiplyScalar(.5); mid.y += lift; mid.z += .08;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const mat = new THREE.MeshStandardMaterial({ color: cArrOff.clone(), roughness: .5, transparent: true, opacity: .45 });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .018, 6), mat));
    const head = new THREE.Mesh(headGeo, mat), tip = curve.getPoint(1), tg = curve.getTangent(1).normalize();
    head.position.copy(tip).addScaledVector(tg, -.05); head.quaternion.setFromUnitVectors(V(0, 1, 0), tg); group.add(head);
    arrows.push({ curve, mat });
  };
  const trim = (from, to, r1, r2) => { const d = to.clone().sub(from).normalize(); return [from.clone().addScaledVector(d, r1), to.clone().addScaledVector(d, -r2)]; };
  // arrows ride just above the chain, from the top of one factor to the top of the next
  for (let i = 0; i < NF - 1; i++) { const a = facs[i].base.clone().add(V(.02, .2, .12)), b = facs[i + 1].base.clone().add(V(-.1, .2, .12)); mkArrow(a, b, .13); }
  mkArrow(facs[NF - 1].base.clone().add(V(.06, .24, .12)), V(mesh.x - size.x * .5, mesh.y + .2, .1), .2); // thrombin -> fibrinogen
  const spark = halo(COL.violet, .55, 0); group.add(spark);
  const spark2 = halo('#ffffff', .22, 0); group.add(spark2);

  // --- fibrin network: wavy branching fibres merged into one geometry; every vertex knows when the growth front reaches it
  const R = rng(8), fibres = [], hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
  const inBox = v => v.set(mesh.x + (R() * 2 - 1) * hx, mesh.y + (R() * 2 - 1) * hy, mesh.z + (R() * 2 - 1) * hz);
  const wavy = (a, b, n, amp) => { const pts = []; for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n);
    if (k > 0 && k < n) p.add(V((R() - .5) * amp, (R() - .5) * amp, (R() - .5) * amp)); pts.push(p); } return new THREE.CatmullRomCurve3(pts, false, 'centripetal'); };
  const clampBox = v => { v.x = clamp(v.x, mesh.x - hx, mesh.x + hx); v.y = clamp(v.y, mesh.y - hy, mesh.y + hy); v.z = clamp(v.z, mesh.z - hz, mesh.z + hz); return v; };
  // primary fibres: long strands crossing the region in different directions
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11 + R() * .1) * Math.PI, d = V(Math.cos(ang), Math.sin(ang) * .75, (R() - .5) * .5).normalize();
    const c0 = V(mesh.x + (R() - .5) * hx, mesh.y + (R() - .5) * hy, mesh.z + (R() - .5) * hz);
    const L = 1.2 + R() * .8, a = clampBox(c0.clone().addScaledVector(d, -L / 2)), b = clampBox(c0.clone().addScaledVector(d, L / 2));
    fibres.push({ curve: wavy(a, b, 5, .16), r: .013 + R() * .016, t0: R() * 1.2, dur: 1.3 + R() * .7 });
  }
  // branches: start on an existing fibre (when its growth front passes) and mostly run to a point on another fibre, closing loops
  for (let i = 0; i < 34; i++) {
    const par = fibres[Math.floor(R() * fibres.length)], u = .15 + R() * .7, a = par.curve.getPointAt(u), tA = par.t0 + u * par.dur;
    let b = null;
    if (R() < .65) { const o = fibres[Math.floor(R() * fibres.length)]; if (o !== par) b = o.curve.getPointAt(.1 + R() * .8); }
    if (!b || b.distanceTo(a) > 1.0 || b.distanceTo(a) < .25) b = clampBox(a.clone().add(V((R() - .5) * 1.0, (R() - .5) * .8, (R() - .5) * .5)));
    const L = a.distanceTo(b);
    fibres.push({ curve: wavy(a, b, 3, .08 + L * .1), r: .007 + R() * .011, t0: tA, dur: .45 + L * .8 });
  }
  const geos = [], aC = [], aG = [], TS = 22, RS = 6, cp = V(0, 0, 0), vp = V(0, 0, 0);
  for (const f of fibres) {
    const g = new THREE.TubeGeometry(f.curve, TS, f.r, RS, false), pos = g.attributes.position;
    for (let j = 0; j <= TS; j++) { const u = j / TS; f.curve.getPointAt(u, cp); const taper = .35 + .65 * Math.sin(Math.min(1, Math.min(u, 1 - u) * 6) * Math.PI / 2);
      for (let i = 0; i <= RS; i++) { const k = j * (RS + 1) + i; vp.fromBufferAttribute(pos, k).sub(cp).multiplyScalar(taper).add(cp); pos.setXYZ(k, vp.x, vp.y, vp.z); aC.push(cp.x, cp.y, cp.z); aG.push(f.t0 + u * f.dur); } }
    geos.push(g);
  }
  const fg = mergeGeos(geos); fg.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3)); fg.setAttribute('aG', new THREE.Float32BufferAttribute(aG, 1));
  const uT = { value: -1 };
  const fibMat = new THREE.MeshPhysicalMaterial({ color: C('#A893E0'), roughness: .42, clearcoat: .45, clearcoatRoughness: .4, sheen: .4, sheenColor: C('#ffffff'), envMapIntensity: .85 });
  fibMat.onBeforeCompile = sh => { sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aC; attribute float aG; uniform float uT;')
      .replace('#include <begin_vertex>', 'vec3 transformed = mix(aC, position, smoothstep(aG, aG + .22, uT));'); };
  const net = new THREE.Mesh(fg, fibMat); net.frustumCulled = false; group.add(net);
  const GROW = Math.max(...fibres.map(f => f.t0 + f.dur));

  // --- fibrinogen monomers: drift while soluble; once thrombin is active each one docks on a fibre just ahead of its growth front
  const NM = 34, mono = new THREE.InstancedMesh(fibrinogenGeo(), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .45, clearcoat: .4, envMapIntensity: .8 }), NM);
  mono.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mono.frustumCulled = false; group.add(mono);
  const mons = [];
  for (let i = 0; i < NM; i++) {
    const f = fibres[i % fibres.length], u = .12 + R() * .76, tg = f.curve.getTangentAt(u).normalize();
    const home = inBox(V(0, 0, 0)); home.z += .1;
    mons.push({ home, ax: V(R() - .5, R() - .5, R() - .5).normalize(), ph: R() * 6.28, dock: f.curve.getPointAt(u), q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tg), tj: f.t0 + u * f.dur });
  }
  // --- two red cells caught in the mesh at the end
  const rbcG = rbcGeo(.17), rbcM = rbcMat();
  const rbcs = [[V(mesh.x - .3, mesh.y + .2, .05), V(mesh.x - 1.5, mesh.y + .7, .3), .6, .3], [V(mesh.x + .42, mesh.y - .28, -.05), V(mesh.x + 1.3, mesh.y - 1.0, .2), -.4, 1.1], [V(mesh.x+.15,mesh.y+.42,.08),V(mesh.x+1.35,mesh.y+.95,.35),.45,.72]].map(([at, from, rz, ry]) => {
    const m = new THREE.Mesh(rbcG, rbcM); m.rotation.set(1.2, ry, rz); group.add(m); return { m, at, from, rz }; });

  const cFg = C('#D4CCEE'), cFb = C(COL3.violet), col = C('#fff');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = V(1, 1, 1), p = V(0, 0, 0), a = V(0, 0, 0);
  const o = { group, facs, arrows, meshAt: mesh, polym: 0,
    update(t) {
      const c = t % CYC, reset = smooth((c - 12.9) / 1.3);
      const tOn = i => .9 + i * .9, tA = i => tOn(i) + .15; // arrow i lights as the spark leaves factor i
      facs.forEach((f, i) => {
        const on = smooth((c - tOn(i)) * 2.5) * (1 - reset), fl = clamp(1 - Math.abs(c - tOn(i) - .15) * 3) * (1 - reset);
        f.mat.color.lerpColors(cOff, cOn, on); f.mat.emissive.copy(f.mat.color); f.mat.emissiveIntensity = .01 + fl * .05;
        f.hh.material.opacity = on * .08 + fl * .35; const s = .84 + on * .2 + fl * .08; f.m.scale.set(f.sc[0] * s, f.sc[1] * s, f.sc[2] * s); f.m.rotation.y = t * .3 + i;
      });
      arrows.forEach((ar, i) => { const on = smooth((c - tA(i) - .5) * 2.2) * (1 - reset); ar.mat.color.lerpColors(cArrOff, cOn, on); ar.mat.opacity = .4 + on * .55; });
      // the trigger arrives from the left, then runs along each arrow to the next factor and finally to the fibrinogen
      const sp = c - .2; let so = 0;
      if (sp >= 0 && sp < .7) { const k = sp / .7; spark.position.copy(facs[0].base).add(a.set(-.9 * (1 - k), .4 * (1 - k), .3)); so = .9; }
      else if (sp >= .7) { const hp = Math.max(0, (c - tA(0)) / .9), ci = Math.floor(hp), cf = hp - ci;
        if (ci < arrows.length) { arrows[ci].curve.getPoint(ease.io(clamp(cf * 1.35)), spark.position); spark.position.z += .05; so = .95; } }
      spark.material.opacity = so * (1 - reset); spark2.position.copy(spark.position); spark2.material.opacity = so * .9 * (1 - reset);
      // fibrinogen -> fibrin: the network grows once thrombin is active
      const t0 = tA(NF - 1) + .9, g = c - t0;
      uT.value = reset > 0 ? (GROW + .3) * (1 - reset) - .3 : g;
      o.polym = clamp(g / GROW) * (1 - reset);
      const back = smooth((c - 13.2) / 1.0);
      for (let i = 0; i < NM; i++) {
        const mo = mons[i], k = smooth((g - mo.tj + .9) / .8) * (1 - reset), gone = clamp((g - mo.tj - .05) / .35) * (1 - reset);
        p.set(mo.home.x + Math.sin(t * .5 + mo.ph) * .08, mo.home.y + Math.cos(t * .43 + mo.ph) * .08, mo.home.z + Math.sin(t * .3 + mo.ph) * .05);
        q.setFromAxisAngle(mo.ax, t * .5 + mo.ph);
        p.lerp(mo.dock, k); q.slerp(mo.q, k);
        sv.setScalar(Math.max(.001, reset > 0 ? back : 1 - gone)); m4.compose(p, q, sv); mono.setMatrixAt(i, m4); mono.setColorAt(i, col.lerpColors(cFg, cFb, k));
      }
      mono.instanceMatrix.needsUpdate = true; mono.instanceColor.needsUpdate = true;
      // red cells drift in and are caught as the network closes
      rbcs.forEach((r, i) => { const u = g - GROW * .5 - i * .5, k = smooth(u / 1.6), s = smooth(u * 2) * (1 - reset);
        r.m.position.lerpVectors(r.from, r.at, ease.out(k)); r.m.position.y += Math.sin(t * 1.3 + i) * .012 * k;
        r.m.rotation.z = r.rz + (1 - k) * 1.2; r.m.scale.setScalar(Math.max(.001, s)); r.m.visible = s > .01; });
    } };
  o.update(0); return o;
}

// ---------------------------------------------------------------- spectrophotometer with two cuvettes
// rows: [{ y }]. Light goes lamp -> cuvette -> detector along +x. Returns per-row handles to tint the solution and dim the
// transmitted beam as product (coloured) accumulates.
export function makeSpectro(rows, { xL = -1.32, xD = 1.36, cw = .56, chh = .9 } = {}) {
  const group = new THREE.Group();
  const housingMat = new THREE.MeshPhysicalMaterial({ color: C('#3A465C'), roughness: .45, clearcoat: .5, envMapIntensity: .7 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: C('#FFE6A6') });
  const beamGeo = new THREE.CylinderGeometry(.085, .025, 1, 20, 1, true); beamGeo.rotateZ(Math.PI / 2);
  const glassGeo = new THREE.BoxGeometry(cw, chh, cw), edgeGeo = new THREE.EdgesGeometry(glassGeo);
  const out = rows.map(r => {
    const g = new THREE.Group(); g.position.y = r.y; group.add(g);
    // lamp
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.36, .36, .36), housingMat); lamp.position.x = xL - .06; g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.08, 18, 12), bulbMat); bulb.position.x = xL + .14; g.add(bulb);
    const bh = halo('#FFC35A', .7, .55); bh.position.copy(bulb.position); g.add(bh);
    // beam in / through / out
    // A shared wave phase makes the incident beam comparable across both rows.
    // Optical depth accumulates only inside the solution, then stays constant to the detector.
    const clock={value:0}, absorbance={value:0};
    const mk = (x0,x1,opacity) => {
      const material=new THREE.MeshBasicMaterial({color:C('#FFC35A'),transparent:true,opacity,depthWrite:false});
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{uPath:{value:new THREE.Vector2(x0,x1)},uClock:clock,uAbs:absorbance,uWidth:{value:cw}});
        shader.vertexShader='uniform vec2 uPath; varying float vRayX;\n'+shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n vRayX=mix(uPath.x,uPath.y,position.x+.5);');
        shader.fragmentShader='uniform float uClock,uAbs,uWidth; varying float vRayX;\n'+shader.fragmentShader.replace('#include <color_fragment>',
          `#include <color_fragment>
           float depth=clamp(vRayX/uWidth+.5,0.,1.);
           float transmission=pow(10.,-1.2*uAbs*depth);
           float pulse=pow(.5+.5*cos(vRayX*14.-uClock*7.),6.);
           diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.89,.55),pulse);
           diffuseColor.a*=transmission*(.32+.68*pulse);`);
      };
      const m=new THREE.Mesh(beamGeo,material);
      m.scale.x=x1-x0; m.position.x=(x0+x1)/2;g.add(m);return m;
    };
    const bIn = mk(xL + .18, -cw / 2, .6), bMid = mk(-cw / 2, cw / 2, .35), bOut = mk(cw / 2, xD - .17, .6);
    // cuvette: glass box with crisp edges and a solution that colours as product forms
    const liq = new THREE.Mesh(new THREE.BoxGeometry(cw - .06, chh * .74, cw - .06), new THREE.MeshPhysicalMaterial({ color: C('#F4EEF2'), roughness: .2, transparent: true, opacity: .4, depthWrite: false, envMapIntensity: .6 }));
    liq.position.y = -chh * .1; g.add(liq);
    g.add(new THREE.Mesh(glassGeo, glassMat(COL3.glass)));
    g.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: C(COL3.glass), transparent: true, opacity: .55 })));
    // detector
    const det = new THREE.Mesh(new THREE.BoxGeometry(.34, .44, .34), housingMat); det.position.x = xD + .02; g.add(det);
    const win = new THREE.Mesh(new THREE.CircleGeometry(.07, 20), new THREE.MeshBasicMaterial({ color: C('#FFE0A0') })); win.rotation.y = -Math.PI / 2; win.position.x = xD - .155; g.add(win);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(.2, .08), new THREE.MeshBasicMaterial({ color: C(COL3.teal) })); led.position.set(xD + .02, .08, .171); g.add(led);
    return { g, liq, bIn, bMid, bOut, win, bh, led, clock, absorbance, liqY: liq.position.y, liqH: chh * .74, inner: cw - .12 };
  });
  const pale = C('#F4EEF2'), pink = C(COL3.pink);
  return { group, rows: out,
    // a: absorbance 0..1 per row
    set(i, a, t) { const r = out[i], T = Math.pow(10, -a * 1.2);
      r.liq.material.color.lerpColors(pale, pink, clamp(a * 1.1)); r.liq.material.opacity = .4 + a * .3;
      r.clock.value=t; r.absorbance.value=a;
      const pulse=Math.pow(.5+.5*Math.cos((xD-.17)*14-t*7),6);
      const signal=(.42+.58*pulse)*T;
      r.win.material.color.setRGB(.26+.74*signal,.17+.66*signal,.06+.36*signal);
      r.led.material.color.setRGB(.04+.12*signal,.28+.61*signal,.24+.44*signal);
      r.bh.material.opacity = .45 + .08 * Math.sin(t * 9 + i); },
  };
}
