// 0 · Title helper — the magnified plasma shown in the cover's loupe (and, in beat 2, full screen):
// a few enzymes with an active-site cleft turn teal substrate into pink product; every turnover is reported to onEvent.
import { THREE, rng, envTex, ease } from '../core.js';
import { bgQuad, Pts, C, COL3, instancedBlobs, fixSphereSeams, proteinMat } from '../lib3d.js';

export const MCOL = { enz: '#9C8BF2', cleft: '#3E2FA6', site: '#F0A23C', sub: COL3.teal, prod: COL3.pink, bg: '#F7ECCD' };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// two-domain protein with a groove between the domains (opening towards local +z) and a warm active-site spot at its floor
function enzymeGeo(seed = 7) {
  const ws = 80, hs = 60, g = new THREE.SphereGeometry(1, ws, hs), R = rng(seed);
  const lumps = [{ d: V(-.78, .14, .05).normalize(), a: .17, s: 2.3 }, { d: V(.78, -.12, .05).normalize(), a: .17, s: 2.3 }];
  for (let i = 0; i < 26; i++) lumps.push({ d: V(R() - .5, R() - .5, R() - .5).normalize(), a: .02 + R() * .035, s: 9 + R() * 14 });
  const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3), mol = new Float32Array(p.count * 4);
  const cB = C(MCOL.enz), cC = C(MCOL.cleft), cS = C(MCOL.site), tmp = new THREE.Color();
  let site = .5;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = .9;
    for (const l of lumps) d += l.a * Math.exp(-(1 - v.dot(l.d)) * l.s);
    d += .022 * Math.sin(v.x * 11 + seed) * Math.sin(v.y * 13 + seed * .3) * Math.sin(v.z * 9);
    const front = sstep(-.05, .6, v.z);
    const groove = Math.exp(-((v.x / .22) ** 2)) * front * (1 - .6 * v.y * v.y);
    d -= .5 * groove;
    if (v.z > .999) site = d;
    p.setXYZ(i, v.x * d, v.y * d, v.z * d);
    mol[i * 4] = v.x * d; mol[i * 4 + 1] = v.y * d; mol[i * 4 + 2] = v.z * d; mol[i * 4 + 3] = 1 - .7 * Math.min(1, groove * 1.25); // for proteinMat's atom relief / cavity shading
    const spot = Math.exp(-((v.x / .13) ** 2) - (v.y / .2) ** 2) * front;
    tmp.copy(cB).lerp(cC, Math.min(1, groove * 1.15)).lerp(cS, Math.min(.9, spot * spot * 1.2));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('mol', new THREE.BufferAttribute(mol, 4));
  g.computeVertexNormals(); fixSphereSeams(g, ws, hs);
  g.userData.site = site;
  return g;
}

// small molecule: a few fused spheres merged into one non-indexed geometry
function atoms(list) {
  const pos = [], nor = [];
  for (const [x, y, z, r] of list) {
    const s = new THREE.SphereGeometry(r, 18, 12).toNonIndexed(); const a = s.attributes.position.array, n = s.attributes.normal.array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i] + x, a[i + 1] + y, a[i + 2] + z); nor.push(n[i], n[i + 1], n[i + 2]); }
    s.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const molMat = (hex) => new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: .35, clearcoat: .7, clearcoatRoughness: .25, sheen: .3, sheenColor: C('#ffffff'), envMapIntensity: .8, emissive: C(hex), emissiveIntensity: .06 });

function ringTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 34, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.55, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// enzyme layout in the loupe view (camera at z = 6 looking at the origin); [x, y, z, size]
const LAYOUT = [[-.55, .25, .6, .7], [1.45, -.8, -1.6, .55], [-1.55, -1.05, -2.0, .52], [1.2, 1.25, -2.6, .5], [-1.5, 1.4, -3.6, .5], [.4, -1.6, -3.4, .45], [2.8, .2, -5.0, .5], [-3.0, -.2, -5.4, .5], [.85, .45, -4.4, .52], [-.75, -.55, -6.2, .52], [.1, 1.6, -6.8, .5]]; // the last three hide behind the first in the loupe and appear during the dive

export function makeMicro({ onEvent = () => {} } = {}) {
  const scene = new THREE.Scene();
  scene.environment = envTex; scene.environmentIntensity = .85;
  scene.add(bgQuad('#FCF4DE', '#EFDDAE', '#FFF9EA', .42, .58));
  scene.fog = new THREE.Fog(C(MCOL.bg), 6.5, 15);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe0c890, .8));
  const key = new THREE.DirectionalLight(0xfff3e2, 2.0); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd6e4ff, .85); rim.position.set(-5, 2, -4); scene.add(rim);

  const rtCam = new THREE.PerspectiveCamera(40, 1, .05, 60); rtCam.position.set(0, 0, 6); rtCam.lookAt(0, 0, 0);
  const fullCam = new THREE.PerspectiveCamera(20, 16 / 9, .05, 60);

  const R = rng(23);
  // ---- enzymes
  const eGeo = enzymeGeo(7), site = eGeo.userData.site + .02;
  // shared molecular-surface material (atom relief + cavity shading); body / cleft / active-site colours come from vertex colours
  const eMat = proteinMat('#ffffff', { atoms: 7.5 }); eMat.vertexColors = true; eMat.emissiveIntensity = 0; eMat.sheenColor.set('#ece6ff');
  const subGeo = atoms([[0, 0, 0, .075], [.094, .04, 0, .056], [-.082, .05, .024, .052]]);
  const prodGeo = atoms([[0, 0, 0, .072], [.09, -.036, .012, .06]]);
  const nE = LAYOUT.length;
  const subs = new THREE.InstancedMesh(subGeo, molMat(MCOL.sub), nE + 14); subs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); subs.frustumCulled = false; scene.add(subs);
  const prods = new THREE.InstancedMesh(prodGeo, molMat(MCOL.prod), nE * 2 + 8); prods.instanceMatrix.setUsage(THREE.DynamicDrawUsage); prods.frustumCulled = false; scene.add(prods);
  const rT = ringTex(), dT = dotTex();
  const E = LAYOUT.map(([x, y, z, s], i) => {
    const m = new THREE.Mesh(eGeo, eMat); m.position.set(x, y, z); m.scale.setScalar(s); scene.add(m);
    // cleft faces the viewer, turned a little sideways so the groove reads in three-quarter view
    const base = new THREE.Euler((R() - .5) * .7, (x < 0 ? .45 : -.45) + (R() - .5) * .4, R() * 6.28);
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: rT, color: C(COL3.amber), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dT, color: C('#FFE3A6'), transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.renderOrder = core.renderOrder = 10; scene.add(ring, core);
    return { m, s, x, y, z, base, ph: R() * 6.28, st: 0, t0: -R() * 2.5 - .2, wait: .3 + R() * 1.2, dur: 1.5, from: new THREE.Vector3(), side: new THREE.Vector3(),
      pk: 0, prod: [{ on: false, t0: 0, p: new THREE.Vector3(), d: new THREE.Vector3(), rx: 0, ry: 0 }, { on: false, t0: 0, p: new THREE.Vector3(), d: new THREE.Vector3(), rx: 0, ry: 0 }],
      ring, core, flash: -9, fp: new THREE.Vector3() };
  });
  // ---- free substrate / product molecules drifting in the plasma, other plasma proteins, specks
  const free = [];
  for (let i = 0; i < 14; i++) free.push({ x: (R() - .5) * 6.5, y: (R() - .5) * 4.6, z: -R() * 6 - 1.2, ph: R() * 6.28, sp: .15 + R() * .25, rx: R() * 6, ry: R() * 6 });
  const freeP = [];
  for (let i = 0; i < 8; i++) freeP.push({ x: (R() - .5) * 7, y: (R() - .5) * 5, z: -R() * 6.5 - 1.2, ph: R() * 6.28, sp: .12 + R() * .2, rx: R() * 6, ry: R() * 6 });
  const others = instancedBlobs(10, { r: .2, glow: 0, seed: 12, lumps: 5, amp: .14, cleft: 0 }); scene.add(others);
  const oc = ['#B9C3D8', '#CBBFA8', '#C2CADB', '#C8BCD0'].map(C); const oth = []; // other plasma proteins (albumin, globulins): muted, in the back
  for (let i = 0; i < 10; i++) { oth.push({ x: (R() - .5) * 9, y: (R() - .5) * 6, z: -4.5 - R() * 6, ph: R() * 6.28, s: .7 + R() * .6, rx: R() * 6, ry: R() * 6 }); others.setColorAt(i, oc[i % 4]); }
  others.instanceColor.needsUpdate = true;
  const specks = new Pts(90); scene.add(specks.mesh); const sp = [];
  const scol = [C('#C9A85A'), C('#B9C3D8'), C('#D8B98A')];
  for (let i = 0; i < 90; i++) sp.push({ x: (R() - .5) * 9, y: (R() - .5) * 6, z: -R() * 9 + 2, s: .02 + R() * .05, c: scol[i % 3], a: .2 + R() * .3, ph: R() * 6.28 });

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3(), tgt = new THREE.Vector3(), nrm = new THREE.Vector3(), zero = new THREE.Vector3(0, 0, 0);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const siteLocal = new THREE.Vector3(0, 0, site), nLocal = new THREE.Vector3(0, 0, 1);

  function place(mesh, i, p, rx, ry, s) { eu.set(rx, ry, 0); q.setFromEuler(eu); sv.setScalar(s); mtx.compose(p, q, sv); mesh.setMatrixAt(i, mtx); }

  function update(dt, t) {
    for (let i = 0; i < nE; i++) {
      const e = E[i], m = e.m;
      // gentle drift + wobble; induced fit squeezes the domains together while the substrate is bound
      m.position.set(e.x + Math.sin(t * .31 + e.ph) * .06, e.y + Math.sin(t * .23 + e.ph * 2) * .07, e.z);
      m.rotation.set(e.base.x + Math.sin(t * .27 + e.ph) * .14, e.base.y + Math.sin(t * .21 + e.ph * 1.7) * .16, e.base.z + Math.sin(t * .17 + e.ph) * .1);
      let squeeze = 0;
      const u = t - e.t0;
      if (e.st === 0 && u > e.wait) { // pick a start point in front of the cleft
        e.st = 1; e.t0 = t; e.dur = 1.35 + R() * .6;
        m.updateMatrixWorld(); tgt.copy(siteLocal); m.localToWorld(tgt); nrm.copy(nLocal).transformDirection(m.matrixWorld);
        v.set(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(.75); nrm.add(v).normalize();
        e.from.copy(tgt).addScaledVector(nrm, 1.35 + R() * .5); e.side.set(R() - .5, R() - .5, R() - .5).normalize();
      }
      m.updateMatrixWorld(); tgt.copy(siteLocal); m.localToWorld(tgt);
      if (e.st === 1) {
        const k = Math.min(1, (t - e.t0) / e.dur), kk = ease.io(k);
        v.lerpVectors(e.from, tgt, kk).addScaledVector(e.side, Math.sin(k * Math.PI) * .18);
        place(subs, i, v, t * 1.7 + i, t * 1.1, Math.min(1, k * 5) * e.s * 1.25);
        if (k >= 1) { e.st = 2; e.t0 = t; }
      } else if (e.st === 2) {
        const k = Math.min(1, (t - e.t0) / .6);
        squeeze = Math.sin(k * Math.PI);
        place(subs, i, tgt, m.rotation.x, m.rotation.y + k * .6, e.s * 1.25 * (1 - .08 * squeeze));
        if (k >= 1) { // turnover: product released, a small flash, an event for the activity trace
          e.st = 0; e.t0 = t; e.wait = .25 + R() * 1.3; subs.setMatrixAt(i, hide);
          const P = e.prod[e.pk]; e.pk ^= 1; P.on = true; P.t0 = t; P.p.copy(tgt); nrm.copy(nLocal).transformDirection(m.matrixWorld);
          v.set(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(.6); P.d.copy(nrm).add(v).normalize().multiplyScalar(1.5 + R() * .6); P.rx = R() * 6; P.ry = R() * 6;
          e.flash = t; e.fp.copy(tgt); onEvent(i);
        }
      } else subs.setMatrixAt(i, hide);
      m.scale.set(e.s * (1 - .05 * squeeze), e.s * (1 + .02 * squeeze), e.s);
      // products leave the cleft and fade into the plasma
      for (let j = 0; j < 2; j++) {
        const P = e.prod[j], idx = i * 2 + j;
        if (!P.on) { prods.setMatrixAt(idx, hide); continue; }
        const k = (t - P.t0) / 2.6; if (k >= 1) { P.on = false; prods.setMatrixAt(idx, hide); continue; }
        v.copy(P.p).addScaledVector(P.d, ease.out(k));
        place(prods, idx, v, P.rx + t * 1.3, P.ry + t * .9, e.s * 1.25 * Math.min(1, k * 8) * (1 - sstep(.7, 1, k)));
      }
      // flash: an amber ring opening around the active site plus a warm core
      const fk = (t - e.flash) / .7;
      if (fk >= 0 && fk < 1) {
        e.ring.position.copy(e.fp); e.core.position.copy(e.fp);
        e.ring.scale.setScalar(e.s * (.25 + fk * .9)); e.ring.material.opacity = .85 * (1 - fk) * (1 - fk);
        e.core.scale.setScalar(e.s * .55 * (1 - fk * .5)); e.core.material.opacity = .9 * (1 - fk) ** 3;
      } else { e.ring.material.opacity = 0; e.core.material.opacity = 0; }
    }
    for (let i = 0; i < free.length; i++) {
      const f = free[i]; v.set(f.x + Math.sin(t * f.sp + f.ph) * .3, f.y + Math.cos(t * f.sp * .8 + f.ph) * .25, f.z + Math.sin(t * f.sp * .6 + f.ph * 2) * .2);
      place(subs, nE + i, v, f.rx + t * .5, f.ry + t * .4, 1);
    }
    for (let i = 0; i < freeP.length; i++) {
      const f = freeP[i]; v.set(f.x + Math.sin(t * f.sp + f.ph) * .3, f.y + Math.cos(t * f.sp * .8 + f.ph) * .25, f.z);
      place(prods, nE * 2 + i, v, f.rx + t * .5, f.ry + t * .4, .9);
    }
    subs.instanceMatrix.needsUpdate = true; prods.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < oth.length; i++) {
      const o = oth[i]; v.set(o.x + Math.sin(t * .13 + o.ph) * .3, o.y + Math.cos(t * .11 + o.ph) * .25, o.z);
      place(others, i, v, o.rx + t * .1, o.ry + t * .07, o.s);
    }
    others.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < sp.length; i++) { const s = sp[i]; specks.set(i, s.x + Math.sin(t * .2 + s.ph) * .2, s.y + Math.sin(t * .17 + s.ph) * .2, s.z, s.s, s.c, s.a); }
    specks.commit();
  }
  update(0, 0);
  return { scene, rtCam, fullCam, update, zero };
}
