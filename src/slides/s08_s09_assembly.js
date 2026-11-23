// Random subunit assembly, shared by s08 (CK dimers) and s09 (LDH tetramers).
// A pool of free subunits of two kinds (fraction p of the first kind) floats in a "cell". At a steady rate,
// `size` subunits come together at random and the finished isoenzyme drops into the column of its form.
// The form of each new oligomer is drawn from binomialShares(p, size) (= independent random association),
// using a low-discrepancy sequence so the running mix converges quickly without looking scripted.
// Each column's liquid level is the running share of that form; a dashed ring marks the binomial expectation.
// After a change of tissue (setP) the running share forgets the old mix fast: oligomers formed after the change
// are averaged with weight 1/(k+K0) (k = how many have landed since), falling back to 1/win, so the columns
// settle on the new pattern within ~2 s of clicking while still being built only from the oligomers that land.
import { THREE, clamp, ease, rng, screenOf } from '../core.js';
import { glassCylinder, contactShadow, halo, C, fixSphereSeams } from '../lib3d.js';
import { COL3, INK } from '../theme.js';
import { binomialShares } from '../sim.js';

const PHI = .6180339887;
const JOIN = .4, FLY = .7, SPAWN = .45, K0 = 2;

// ---------------------------------------------------------------- one protein subunit (domain)
// A compact globule with a shallow active-site cleft on its front (+z) and a flattened contact face on +x:
// oligomers put that face against their partners, so every subunit reads as a separate domain joined at an interface.
export const FACE = .8; // distance (in r) from the subunit centre to its contact face
const subCache = new Map();
export function subunitGeo(seed, r, { ws = 44, hs = 30 } = {}) {
  const key = [seed, r, ws, hs].join('|'); if (subCache.has(key)) return subCache.get(key);
  const g = new THREE.SphereGeometry(1, ws, hs), R = rng(seed * 7919 + 13);
  const bumps = []; for (let i = 0; i < 9; i++) bumps.push({ d: new THREE.Vector3(R() - .5, R() - .5, R() - .5).normalize(), a: .06 + R() * .08, s: 5 + R() * 7 });
  const cleft = new THREE.Vector3(-.25, .45, .86).normalize(), cleft2 = new THREE.Vector3(.15, .2, .97).normalize();
  const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = .97;
    for (const b of bumps) d += b.a * Math.exp(-(1 - v.dot(b.d)) * b.s);
    const cl = .17 * Math.exp(-(1 - v.dot(cleft)) * 14) + .11 * Math.exp(-(1 - v.dot(cleft2)) * 16); d -= cl; // groove where the substrate binds
    d += .018 * Math.sin(v.x * 13 + seed) * Math.sin(v.y * 11 - seed) * Math.sin(v.z * 12);
    let x = v.x * d, y = v.y * d * 1.06, z = v.z * d * .92;
    const f = FACE - .06; if (x > f) x = f + .06 * (1 - Math.exp(-(x - f) / .06)); // soft flat contact face
    p.setXYZ(i, x * r, y * r, z * r);
    // baked ambient occlusion in the vertex colour: grooves darker, knobs a touch brighter
    const ao = Math.min(1, Math.max(.55, 1 + (d - 1.02) * 1.6 - cl * 1.8));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); fixSphereSeams(g, ws, hs);
  subCache.set(key, g); return g;
}
// orientation that turns the contact face (+x) toward the oligomer centre from a slot direction
const _X = new THREE.Vector3(1, 0, 0), _d = new THREE.Vector3(), _qr = new THREE.Quaternion();
export function faceIn(q, slot, roll = 0) {
  _d.set(-slot[0], -slot[1], -slot[2]).normalize();
  q.setFromUnitVectors(_X, _d);
  if (roll) q.multiply(_qr.setFromAxisAngle(_X, roll));
  return q;
}

// ---------------------------------------------------------------- letter badge (decal) for a subunit
const badgeCache = new Map();
export function badge(letter, color, size = .4) {
  const key = letter + color;
  let mat = badgeCache.get(key);
  if (!mat) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
    x.shadowColor = 'rgba(20,32,51,.35)'; x.shadowBlur = 18; x.shadowOffsetY = 5;
    x.beginPath(); x.arc(128, 124, 92, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.96)'; x.fill();
    x.shadowColor = 'transparent'; x.lineWidth = 10; x.strokeStyle = color; x.stroke();
    x.fillStyle = color; x.font = '700 132px Inter, Segoe UI, Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letter, 128, 132);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    badgeCache.set(key, mat);
  }
  const s = new THREE.Sprite(mat); s.scale.setScalar(size); s.renderOrder = 5; return s;
}

// instanced subunits with per-instance colour (same daylight material as the old instanced blobs)
function instancedSubunits(n, { seed = 3, r = .12, glow = .15 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .45, clearcoat: .5, clearcoatRoughness: .3, sheen: .3, sheenRoughness: .6, envMapIntensity: .7, vertexColors: true });
  mat.userData.glow = { value: glow };
  mat.onBeforeCompile = (s) => { s.uniforms.uGlow = mat.userData.glow;
    s.fragmentShader = 'uniform float uGlow;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * uGlow * .3;'); };
  const m = new THREE.InstancedMesh(subunitGeo(seed, r, { ws: 26, hs: 18 }), mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1); for (let i = 0; i < n; i++) m.setColorAt(i, c);
  m.frustumCulled = false; return m;
}

export function assemblySim(parent, {
  size = 2, colors = [COL3.blue, COL3.amber], n = 56, r = .13, seed = 7,
  pool = { x: -3, y: -.3, rx: 1.9, ry: 1.3, rz: .5 },
  cols, colBase = -1.9, colH = 2.9, colR = .42, rate = 6, win = 22,
} = {}) {
  const g = new THREE.Group(); parent.add(g);
  const poolG = new THREE.Group(); g.add(poolG); // cell + free subunits (can be slid away as a whole)
  const R = rng(seed);
  const nf = size + 1;
  // ---------------------------------------------------------------- pool backdrop: a soft cytosol wash
  const cyto = halo(COL3.cyto, 1, .32); cyto.scale.set(pool.rx * 2.9, pool.ry * 2.9, 1); cyto.position.set(pool.x, pool.y, -.8); poolG.add(cyto);
  const ringPts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; ringPts.push(new THREE.Vector3(pool.x + Math.cos(a) * (pool.rx + .35), pool.y + Math.sin(a) * (pool.ry + .3), -.3)); }
  const memb = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: C(COL3.membrane), transparent: true, opacity: .55 }));
  poolG.add(memb);
  // ---------------------------------------------------------------- subunits
  const bl = instancedSubunits(n, { r, glow: .15, seed: seed + 2 }); poolG.add(bl);
  const cK = colors.map(c => C(c));
  const S = [];
  const rndPos = (v) => { let x, y; do { x = R() * 2 - 1; y = R() * 2 - 1; } while (x * x + y * y > 1); v.set(pool.x + x * pool.rx, pool.y + y * pool.ry, (R() - .5) * 2 * pool.rz); return v; };
  for (let i = 0; i < n; i++) {
    const home = rndPos(new THREE.Vector3());
    S.push({ kind: 0, st: 0, t0: -9, home, p: home.clone(), from: new THREE.Vector3(), ph: R() * 6.28, sp: .35 + R() * .5,
      col: cK[0].clone(), rot: new THREE.Euler(R() * 6, R() * 6, R() * 6), pop: 0, q0: new THREE.Quaternion(), qT: new THREE.Quaternion() });
  }
  // ---------------------------------------------------------------- columns
  // column fill: one cylinder painted with `size` vertical bands (by object-space x, so the split always faces the camera
  // and never depends on a rotation); (size-j) bands of the first kind, j of the second, thin white seams between subunits
  const cA = C(colors[0]), cB = C(colors[1]);
  const fillGeo = new THREE.CylinderGeometry(colR * .9, colR * .9, 1, 48, 1, false); fillGeo.translate(0, .5, 0);
  const fillMat = (split) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4, transparent: true, opacity: .9, envMapIntensity: .7 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSplit = { value: split }; sh.uniforms.uN = { value: size }; sh.uniforms.uCA = { value: cA }; sh.uniforms.uCB = { value: cB };
      sh.vertexShader = 'varying float vFx;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFx = position.x / ${(colR * .9).toFixed(4)};`);
      sh.fragmentShader = 'uniform float uSplit, uN; uniform vec3 uCA, uCB; varying float vFx;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float bu = clamp(vFx * .5 + .5, 0., 1.), fb = fract(bu * uN), bd = min(fb, 1. - fb) / uN;
        float seam = (1. - smoothstep(.007, .016, bd)) * step(.03, bu) * step(bu, .97);
        diffuseColor.rgb = mix(bu < uSplit ? uCA : uCB, vec3(1.), seam * .9);`);
    };
    return m;
  };
  const ringMat = new THREE.LineDashedMaterial({ color: C(INK), dashSize: .07, gapSize: .06, transparent: true, opacity: .7 });
  const C2 = []; const circ = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; circ.push(new THREE.Vector3(Math.cos(a) * (colR + .05), 0, Math.sin(a) * (colR + .05))); }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(circ);
  const columns = cols.map((x, j) => {
    const cg = new THREE.Group(); cg.position.set(x, colBase, 0); g.add(cg);
    const glass = glassCylinder({ r: colR, h: colH }); glass.position.y = colH / 2; cg.add(glass);
    const sh = contactShadow({ size: colR * 4, opacity: .16 }); sh.position.y = -.01; cg.add(sh);
    const fill = new THREE.Mesh(fillGeo, fillMat((size - j) / size)); cg.add(fill);
    fill.scale.y = .001;
    const ring = new THREE.Line(ringGeo, ringMat); ring.computeLineDistances(); cg.add(ring);
    const glow = halo(COL3.coral, 1, 0); glow.scale.set(colR * 5, colH * 1.5, 1); glow.position.set(0, colH / 2, -.4); cg.add(glow);
    return { x, g: cg, fill, ring, glow, share: 0, hi: 0 };
  });
  // ---------------------------------------------------------------- oligomers in flight
  const olig = [];
  let shares = binomialShares(.5, size), u = R(), lastEv = 0, p = .5, on = false, gen = 0, nNew = 0;
  const est = new Float32Array(nf);
  // slot offsets: contact faces meet with a thin seam (dimer: face to face; tetramer: faces toward the centre)
  const slot = (k) => {
    if (size === 2) { const s = r * (FACE + .05); return [k ? s : -s, 0, 0]; }
    const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]][k]; const s = r * 1.12 / Math.sqrt(3); return [T[0] * s, T[1] * s, T[2] * s];
  };
  const tumble = (s, t, out) => { eu.set(s.rot.x + t * .3 * s.sp, s.rot.y + t * .4, s.rot.z); return out.setFromEuler(eu); };
  function setKinds(instant) {
    // reassign kinds so that round(p·n) subunits are of the first kind; free ones that flip get a little pop
    const want = Math.round(p * n); let have = 0;
    for (const s of S) if (s.kind === 0) have++;
    const order = S.map((s, i) => i).sort(() => R() - .5);
    for (const i of order) {
      if (have === want) break;
      const s = S[i];
      if (s.st === 1 && !instant) continue; // never recolour a subunit that is already part of an oligomer
      if (have > want && s.kind === 0) { s.kind = 1; have--; s.pop = instant ? 0 : 1; }
      else if (have < want && s.kind === 1) { s.kind = 0; have++; s.pop = instant ? 0 : 1; }
      if (instant) s.col.copy(cK[s.kind]);
    }
  }
  // a subunit re-enters the pool as a newly made one: if the pool's mix is off the tissue's p (subunits that were in an
  // oligomer when the tissue changed could not be recoloured), it is (re)born as the kind that is short
  function rebirth(s) {
    const want = Math.round(p * n); let have = 0;
    for (let i = 0; i < n; i++) if (S[i].kind === 0) have++;
    if (have < want && s.kind === 1) s.kind = 0; else if (have > want && s.kind === 0) s.kind = 1;
    s.col.copy(cK[s.kind]); s.pop = 0;
  }
  function event(t) {
    // form of the next oligomer: inverse binomial CDF of a golden-ratio sequence
    // (the sequence only advances when the oligomer can really form, so a scarce subunit delays a form instead of skipping it)
    const u1 = (u + PHI) % 1; let j = 0, acc = shares[0]; while (u1 > acc && j < size) { j++; acc += shares[j]; }
    const need = [size - j, j], picked = [];
    for (let kind = 0; kind < 2; kind++) {
      let c = need[kind]; if (!c) continue;
      const free = []; for (let i = 0; i < n; i++) if (S[i].st === 0 && S[i].kind === kind && S[i].pop < .3) free.push(i);
      if (free.length < c) return;
      while (c--) { const k = Math.floor(R() * free.length); picked.push(free.splice(k, 1)[0]); }
    }
    u = u1;
    const meet = new THREE.Vector3(); for (const i of picked) meet.add(S[i].p); meet.multiplyScalar(1 / picked.length);
    meet.x = Math.min(meet.x + .3, pool.x + pool.rx * .7); meet.z = 0;
    // shuffle slot order so mixed forms do not always put the same kind on the same side
    picked.sort(() => R() - .5);
    picked.forEach((i, k) => { const s = S[i]; s.st = 1; s.t0 = t; s.from.copy(s.p); s.slot = slot(k); s.je = 0; tumble(s, t, s.q0); faceIn(s.qT, s.slot, size === 2 ? 0 : k * 1.3); });
    const c = columns[j];
    olig.push({ m: picked, j, t0: t, gen, meet, p1: new THREE.Vector3((meet.x + c.x) / 2 + .4, colBase + colH + .6, 0), p2: new THREE.Vector3(c.x, colBase + clamp(c.share * colH, .15, colH * .78) + .05, 0), rot: R() * 6 });
  }
  const tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler(), _Y = new THREE.Vector3(0, 1, 0);
  function absorb(o) {
    if (o.gen < 0) return; // settled while in flight: lands visually but no longer counts
    const a = o.gen === gen ? Math.max(1 / win, 1 / (nNew++ + K0)) : 1 / win; for (let k = 0; k < nf; k++) est[k] = est[k] * (1 - a) + (k === o.j ? a : 0);
  }
  const api = {
    group: g, poolG, columns, pool,
    get p() { return p; },
    // set the first-kind fraction; instant = jump straight to the expected mix (used when landing on a beat)
    setP(np, instant = false) {
      p = np; shares = binomialShares(p, size); setKinds(instant); gen++; nNew = 0;
      columns.forEach((c, j) => c.ring.position.y = shares[j] * colH);
      if (instant) { nNew = win; for (let k = 0; k < nf; k++) est[k] = shares[k]; olig.length = 0; for (const s of S) { if (s.st) { s.st = 0; rndPos(s.home); s.p.copy(s.home); } } }
    },
    // jump the running estimate to the expected mix without touching the subunits (used when the pool is off screen);
    // oligomers still in flight finish their trip but are not counted
    settle() { nNew = win; for (const o of olig) o.gen = -1; for (let j = 0; j < nf; j++) est[j] = shares[j]; },
    expected: () => shares,
    estimate: est,
    run(v) { on = v; },
    highlight(j, v) { columns.forEach((c, k) => c.hiT = k === j ? v : 0); },
    update(t, dt) {
      if (on && t - lastEv > 1 / rate) { lastEv = t; event(t); }
      if (!on) lastEv = t;
      for (let k = olig.length - 1; k >= 0; k--) {
        const o = olig[k]; const a = t - o.t0;
        const c = columns[o.j]; o.p2.y = colBase + clamp(c.share * colH, .15, colH * .78) + .02;
        // the oligomer turns about y once it has formed (starting from 0, so there is no jump at the end of the join)
        let cx, cy, cz, spin = Math.max(0, a - JOIN) * 1.8, s = 1;
        if (a < JOIN) { const e = ease.io(a / JOIN); o.m.forEach(i => { const S0 = S[i]; S0.p.lerpVectors(S0.from, tmp.set(o.meet.x + S0.slot[0], o.meet.y + S0.slot[1], o.meet.z + S0.slot[2]), e); S0.je = e; }); continue; }
        const f = clamp((a - JOIN) / FLY), e = ease.io(f), w = 1 - e;
        cx = w * w * o.meet.x + 2 * w * e * o.p1.x + e * e * o.p2.x; cy = w * w * o.meet.y + 2 * w * e * o.p1.y + e * e * o.p2.y; cz = 0;
        if (f > .78) s = Math.max(.001, 1 - (f - .78) / .22);
        const cs = Math.cos(spin), sn = Math.sin(spin);
        o.m.forEach(i => { const S0 = S[i], [ox, oy, oz] = S0.slot; S0.p.set(cx + (ox * cs - oz * sn) * s, cy + oy * s, cz + (ox * sn + oz * cs) * s); S0.scale = s; S0.je = 1; S0.spin = spin; });
        if (f >= 1) { absorb(o); o.m.forEach(i => { const S0 = S[i]; S0.st = 2; S0.t0 = t; rndPos(S0.home); S0.p.copy(S0.home); S0.scale = 1; rebirth(S0); }); olig.splice(k, 1); }
      }
      for (let i = 0; i < n; i++) {
        const s = S[i];
        let scl = 1;
        if (s.st === 0) {
          s.p.set(s.home.x + Math.sin(t * s.sp + s.ph) * .14, s.home.y + Math.cos(t * s.sp * .8 + s.ph) * .11, s.home.z + Math.sin(t * s.sp * .6 + s.ph * 2) * .1);
        } else if (s.st === 2) {
          const f = clamp((t - s.t0) / SPAWN); scl = ease.back(f);
          s.p.set(s.home.x + Math.sin(t * s.sp + s.ph) * .14, s.home.y + Math.cos(t * s.sp * .8 + s.ph) * .11, s.home.z + Math.sin(t * s.sp * .6 + s.ph * 2) * .1);
          if (f >= 1) s.st = 0;
        } else if (s.scale != null && s.st === 1) scl = s.scale;
        if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt * 1.6); scl *= 1 + .5 * Math.sin(s.pop * Math.PI); }
        s.col.lerp(cK[s.kind], 1 - Math.exp(-dt * 6));
        bl.setColorAt(i, s.col);
        if (s.st === 1) {
          // joining: turn from the tumbling pose to face the partners; flying: rigid turn of the whole oligomer about y
          if (s.je < 1) q.slerpQuaternions(s.q0, s.qT, s.je || 0); else q.setFromAxisAngle(_Y, -(s.spin || 0)).multiply(s.qT);
        } else tumble(s, t, q);
        sc.setScalar(Math.max(.001, scl)); m4.compose(s.p, q, sc); bl.setMatrixAt(i, m4);
      }
      bl.instanceMatrix.needsUpdate = true; bl.instanceColor.needsUpdate = true;
      columns.forEach((c, j) => {
        c.share += (est[j] - c.share) * (1 - Math.exp(-dt * 7));
        c.fill.scale.y = Math.max(.001, c.share * colH); c.fill.visible = c.share > .006;
        c.hi += ((c.hiT || 0) - c.hi) * (1 - Math.exp(-dt * 4));
        c.glow.material.opacity = c.hi * (.45 + .1 * Math.sin(t * 3));
      });
    },
  };
  api.setP(.5, true);
  return api;
}

// keep an HTML element pinned under a 3D point (centred horizontally)
export function pin(el, v3, cam, obj, dy = 0) {
  const s = screenOf(v3, cam, obj);
  el.style.transform = `translate(${s.x.toFixed(1)}px,${(s.y + dy).toFixed(1)}px) translate(-50%,0)`;
}

// a two-colour bar showing the subunit mix of the pool (cause), under the pool
export function mixBar(layer, add, { left, top, width, names, colors, b }) {
  const e = add(layer, `<div class="abs" data-b="${b}" style="left:${left}px;top:${top}px;width:${width}px">
    <div style="display:flex;justify-content:space-between;font:700 24px/1 var(--sans);margin-bottom:8px"><span style="color:${colors[0]}">${names[0]}</span><span style="font:600 19px/1.2 var(--sans);color:var(--mute);letter-spacing:2px">AZPIUNITATEAK ZELULAN</span><span style="color:${colors[1]}">${names[1]}</span></div>
    <div style="display:flex;height:22px;border-radius:11px;overflow:hidden;border:1px solid var(--line);background:${colors[1]}"><div class="mx" style="width:50%;background:${colors[0]};transition:width .9s cubic-bezier(.3,0,.2,1)"></div></div></div>`);
  const bar = e.querySelector('.mx');
  return { el: e, set(p) { bar.style.width = (p * 100).toFixed(1) + '%'; } };
}
