// 3D pieces for slide 3: an enzyme with a slot-shaped active site (lock and key) and a glass body with organs
// whose ALT content is shown by colour (schematic tissue distribution).
import { THREE, rng } from '../core.js';
import { blobGeo, fixSphereSeams, proteinMat, fresnelMat, halo, C, COL, COL3 } from '../lib3d.js';

// ---------------------------------------------------------------- enzyme with a slot-shaped pocket
// d: pocket direction (object space), e: long axis of the slot. Returns { group, mesh, pocket (Vector3, pocket floor),
// d, e, sub (capsule that fits), prod (two halves), wrong (angular molecule that does not fit), siteHalo }.
export function makeDockEnzyme({ seed = 41, color = COL3.amber, site = COL3.teal } = {}) {
  const d = new THREE.Vector3(.68, .42, .6).normalize(); // up-right and towards the camera: the slot is seen half in profile
  const e = new THREE.Vector3(1, -.25, 0); e.sub(d.clone().multiplyScalar(e.dot(d))).normalize();
  const f = new THREE.Vector3().crossVectors(d, e);
  const src = blobGeo(seed, 1, { lumps: 11, amp: .16, ws: 128, hs: 96, noise: .035 });
  const g = src.clone();
  const p = g.attributes.position, mol = g.attributes.mol, v = new THREE.Vector3();
  const SA = .38, SB = .17, D = .32;
  const col = new Float32Array(p.count * 3), cA = C(color), cS = C(site), tmp = new THREE.Color();
  let rc = 1, best = -2;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const r = v.length(); v.divideScalar(r);
    const c = v.dot(d), a = v.dot(e) / SA, b = v.dot(f) / SB, q = a * a + b * b;
    // flat-bottomed slot (super-gaussian) with a slight raised lip
    const k = c > 0 ? Math.exp(-q * q) : 0, lip = c > 0 ? .05 * Math.exp(-Math.pow(q - 1.6, 2) * 2) : 0;
    const rn = r * (1 - D * k + lip);
    p.setXYZ(i, v.x * rn, v.y * rn, v.z * rn);
    if (c > best) { best = c; rc = rn; }
    if (mol) mol.setW(i, Math.min(mol.getW(i), 1 - .55 * k));
    tmp.copy(cA).lerp(cS, Math.min(1, k * 1.25)); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); fixSphereSeams(g, 128, 96);
  const mat = proteinMat('#ffffff', { glow: .03 }); mat.vertexColors = true;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g, mat); group.add(mesh);
  const pocket = d.clone().multiplyScalar(rc);
  // substrate: a capsule shaped like the slot
  const subMat = proteinMat(COL3.teal, { glow: .05, relief: .4 });
  const sub = new THREE.Mesh(new THREE.CapsuleGeometry(.12, .42, 8, 20), subMat);
  sub.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e); group.add(sub);
  // the two products (pink halves)
  const prodGeo = new THREE.CapsuleGeometry(.11, .1, 6, 16), prodMat = proteinMat(COL3.pink, { glow: .05, relief: .4 });
  const prod = [0, 1].map(() => { const m = new THREE.Mesh(prodGeo, prodMat); m.quaternion.copy(sub.quaternion); group.add(m); return m; });
  // a molecule of the wrong shape: a branched, angular cluster that is wider than the slot
  const wrong = new THREE.Group();
  const wMat = new THREE.MeshPhysicalMaterial({ color: C(COL3.violet), roughness: .45, clearcoat: .4, flatShading: true, envMapIntensity: .8 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.17, 0), wMat); wrong.add(core);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.12, 0), wMat); s.position.set(Math.cos(a) * .24, Math.sin(a) * .24, (i - 1) * .06); wrong.add(s); }
  group.add(wrong);
  const siteHalo = halo(COL.teal, 1.1, 0); siteHalo.position.copy(d).multiplyScalar(rc + .15); group.add(siteHalo);
  return { group, mesh, mat, pocket, d, e, f, rc, sub, subMat, prod, prodMat, wrong, wMat, siteHalo };
}

// ---------------------------------------------------------------- glass body with organs
// levels: relative ALT content per tissue (schematic, liver highest)
export function makeBody(levels) {
  const group = new THREE.Group();
  const glass = fresnelMat({ color: COL3.glass, power: 2.2, intensity: .7, base: .045 });
  const fill = new THREE.MeshBasicMaterial({ color: C('#ffffff'), transparent: true, opacity: .4, depthWrite: false, side: THREE.BackSide }); // back faces: a milky body that never veils the organs
  const part = (geo, x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => {
    for (const m of [fill, glass]) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.scale.set(sx, sy, sz); o.renderOrder = m === fill ? 1 : 3; group.add(o); }
  };
  // smooth silhouette: lathed torso (shoulders, waist, hips), a neck that flares into the shoulders, tapered limbs
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const lathe = pts => { const g = new THREE.LatheGeometry(pts, 40); g.computeVertexNormals(); return g; };
  // a limb hanging from y = 0 to y = -L: rounded top of radius r0, rounded tip of radius r1
  const limb = (L, r0, r1) => { const pts = [];
    for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI / 2; pts.push(V2(Math.max(1e-4, Math.cos(a) * r1), -L + Math.sin(a) * r1)); }
    for (let k = 1; k <= 8; k++) { const u = k / 8; pts.push(V2(r1 + (r0 - r1) * Math.pow(u, .8), -L + u * L)); }
    for (let k = 1; k <= 8; k++) { const a = k / 8 * Math.PI / 2; pts.push(V2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
    return lathe(pts); };
  const torso = lathe([V2(1e-4, -.16), V2(.13, -.15), V2(.24, -.11), V2(.3, -.02), V2(.31, .1), V2(.28, .26), V2(.27, .36), V2(.3, .5), V2(.35, .64), V2(.39, .74),
    V2(.4, .8), V2(.37, .87), V2(.28, .93), V2(.15, .97), V2(.085, 1.0), V2(.075, 1.06), V2(.08, 1.1), V2(1e-4, 1.11)]);
  part(torso, 0, 0, 0, 0, 1, 1, .6);
  part(new THREE.SphereGeometry(.185, 40, 28), 0, 1.24, 0, 0, .95, 1.14, 1);
  const arm = limb(.8, .085, .052), leg = limb(1.04, .135, .065);
  part(arm, -.42, .84, 0, -.13); part(arm, .42, .84, 0, .13);
  part(leg, -.155, -.06, 0, -.04); part(leg, .155, -.06, 0, .04);
  const grey = C('#C2B6AD'), gold = C(COL3.gold), R = rng(9);
  const organs = [];
  const organ = (key, geo, list, level) => {
    const mat = proteinMat('#ffffff', { glow: .05, relief: .5 });
    mat.color.copy(grey).lerp(gold, Math.min(1, Math.pow(level, .7))); mat.sheenColor.copy(mat.color);
    const meshes = list.map(([x, y, z, sx, sy, sz, rz = 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; m.renderOrder = 2; group.add(m); return m; });
    const hh = halo(COL.gold, .5 + level * .9, 0); hh.position.copy(meshes[0].position); hh.position.z += .2; hh.renderOrder = 4; group.add(hh);
    const o = { key, mat, meshes, halo: hh, level, ph: R() * 6 }; organs.push(o); return o;
  };
  // liver on the body's right (viewer's left), heart left of centre, kidneys low on the back, skeletal muscle in thighs + upper arms
  organ('liver', blobGeo(61, 1, { lumps: 6, amp: .14 }), [[-.12, .36, .1, .27, .15, .14, .18]], levels.liver);
  organ('kidney', blobGeo(62, 1, { lumps: 5, amp: .12 }), [[-.16, .0, -.04, .065, .1, .06], [.16, .0, -.04, .065, .1, .06]], levels.kidney);
  organ('heart', blobGeo(63, 1, { lumps: 5, amp: .15 }), [[.08, .62, .1, .12, .13, .11, -.4]], levels.heart);
  organ('muscle', new THREE.CapsuleGeometry(1, 1.4, 6, 16), [[-.173, -.5, .02, .09, .2, .085], [.173, -.5, .02, .09, .2, .085], [-.465, .5, .02, .055, .14, .055, -.13], [.465, .5, .02, .055, .14, .055, .13]], levels.muscle);
  return { group, organs };
}
