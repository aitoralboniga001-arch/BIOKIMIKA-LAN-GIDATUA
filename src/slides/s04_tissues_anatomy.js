// Anatomy for slide 4: a smooth glass body (signed-distance field polygonised once with surface nets at build time)
// and stylised organ meshes in body-local units (feet at y ≈ -1.76, crown at y ≈ 1.78; +x = the patient's left).
import { THREE } from '../core.js';
import { fixSphereSeams } from '../lib3d.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- SDF primitives (scalars only: this runs ~1M times)
function sEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt(px * px / (rx * rx) + py * py / (ry * ry) + pz * pz / (rz * rz)) || 1e-6;
  return k0 * (k0 - 1) / k1;
}
function sCone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {   // capsule whose radius varies linearly from a to b
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz); h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; }

export function bodySDF(x, y, z) {
  const X = Math.abs(x);                                  // left/right symmetric
  let d = 9;                                              // parts are skipped where they cannot reach (sign stays exact)
  if (y > 1.12) {
    d = sEll(x, y, z, 0, 1.585, .01, .158, .2, .178);                       // cranium
    d = smin(d, sEll(x, y, z, 0, 1.47, .045, .108, .095, .12), .06);         // jaw
    d = smin(d, sCone(X, y, z, 0, 1.47, 0, 0, 1.28, 0, .068, .075), .05);   // neck
  }
  if (y > -.12 && y < 1.42) {
    let t = sEll(x, y, z, 0, 1.03, 0, .3, .27, .165);                       // chest
    t = smin(t, sEll(X, y, z, .27, 1.19, 0, .14, .085, .1), .08);          // shoulders
    t = smin(t, sEll(x, y, z, 0, .63, 0, .245, .3, .152), .12);            // waist
    t = smin(t, sEll(x, y, z, 0, .2, 0, .29, .2, .165), .1);               // hips
    d = smin(d, t, .07);
  }
  if (X > .24 && y > -.2 && y < 1.36) {
    let a = sCone(X, y, z, .4, 1.18, 0, .52, .66, .01, .074, .055);         // upper arm
    a = smin(a, sCone(X, y, z, .528, .62, .01, .598, .14, .025, .053, .036), .04); // forearm
    a = smin(a, sEll(X, y, z, .618, -.02, .03, .045, .1, .032), .04);      // hand
    d = smin(d, a, .05);
  }
  if (y < .46) {
    let l = sCone(X, y, z, .15, .1, 0, .17, -.76, 0, .135, .076);           // thigh
    l = smin(l, sCone(X, y, z, .174, -.8, 0, .19, -1.62, 0, .074, .044), .05); // shin
    l = smin(l, sEll(X, y, z, .18, -1.02, -.03, .066, .2, .068), .06);     // calf
    l = smin(l, sEll(X, y, z, .19, -1.715, .06, .052, .045, .12), .04);    // foot
    d = smin(d, l, .06);
  }
  return d;
}

// surface nets: one vertex per sign-changing cell (average of its edge crossings), one quad per sign-changing grid edge
export function surfaceNets(f, min, max, step) {
  const nx = Math.ceil((max.x - min.x) / step) + 1, ny = Math.ceil((max.y - min.y) / step) + 1, nz = Math.ceil((max.z - min.z) / step) + 1;
  const F = new Float32Array(nx * ny * nz), I = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[I(i, j, k)] = f(min.x + i * step, min.y + j * step, min.z + k * step);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, C = (i, j, k) => i + cx * (j + cy * k);
  const vid = new Int32Array(cx * cy * cz).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  const nxy = nx * ny, OFF = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1], lim = step * 3;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const base = i + nx * (j + ny * k), f0 = F[base];
    if (f0 > lim || f0 < -lim) continue;            // a corner farther than the cell diagonal: no crossing in this cell
    let m = 0;
    for (let c = 0; c < 8; c++) { const v = F[base + OFF[c]]; cv[c] = v; if (v < 0) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const u = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * u; sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * u; sz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * u; n++;
    }
    vid[C(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * step, min.y + (j + sy / n) * step, min.z + (k + sz / n) * step);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const p = F[I(i, j, k)], inP = p < 0;
    if (inP !== (F[I(i + 1, j, k)] < 0)) quad(vid[C(i, j - 1, k - 1)], vid[C(i, j, k - 1)], vid[C(i, j, k)], vid[C(i, j - 1, k)], inP);
    if (inP !== (F[I(i, j + 1, k)] < 0)) quad(vid[C(i - 1, j, k - 1)], vid[C(i - 1, j, k)], vid[C(i, j, k)], vid[C(i, j, k - 1)], inP);
    if (inP !== (F[I(i, j, k + 1)] < 0)) quad(vid[C(i - 1, j - 1, k)], vid[C(i, j - 1, k)], vid[C(i, j, k)], vid[C(i - 1, j, k)], inP);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // orientation check against the field gradient: normals must point outwards
  const pa = g.attributes.position, na = g.attributes.normal; let s = 0;
  for (let q = 0; q < pa.count; q += 97) {
    const x = pa.getX(q), y = pa.getY(q), z = pa.getZ(q), e = step * .5;
    s += Math.sign((f(x + e, y, z) - f(x - e, y, z)) * na.getX(q) + (f(x, y + e, z) - f(x, y - e, z)) * na.getY(q) + (f(x, y, z + e) - f(x, y, z - e)) * na.getZ(q));
  }
  if (s < 0) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const tmp = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = tmp; } g.computeVertexNormals(); }
  return g;
}

export function bodyGeo(step = .023) { return surfaceNets(bodySDF, V(-.74, -1.82, -.3), V(.74, 1.84, .3), step); }

// ---------------------------------------------------------------- geometry helpers
// sphere deformed by fn(dir, out) (dir is a unit vector; write the vertex position into out)
function deform(fn, ws = 48, hs = 32) {
  const g = new THREE.SphereGeometry(1, ws, hs), p = g.attributes.position, v = V(0, 0, 0), o = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); fn(v, o); p.setXYZ(i, o.x, o.y, o.z); }
  g.computeVertexNormals(); fixSphereSeams(g, ws, hs); return g;
}
const place = (g, x, y, z, rz = 0, rx = 0, ry = 0) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
// tube with a radius profile r(u) (0..1 along the curve), elliptical section (ky, kz), closed rounded ends, optional bump(u, angle)
function tubeVar(points, r, { seg = 64, rad = 20, kz = 1, bump = null } = {}) {
  const cu = new THREE.CatmullRomCurve3(points), fr = cu.computeFrenetFrames(seg, false);
  const pos = [], idx = [], P = V(0, 0, 0);
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; cu.getPointAt(u, P); const N = fr.normals[i], B = fr.binormals[i];
    const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), 8)));   // round the two ends shut
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * Math.PI * 2; let rr = r(u) * end; if (bump) rr *= 1 + bump(u, a);
      const c = Math.cos(a) * rr, s = Math.sin(a) * rr * kz;
      pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// spindle (muscle belly) between a and b
function spindle(a, b, r, { kz = 1 } = {}) {
  const pts = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(new THREE.Vector2(Math.max(.0005, r * Math.pow(Math.sin(Math.PI * t), .75)), t)); }
  const g = new THREE.LatheGeometry(pts, 28); g.scale(1, a.distanceTo(b), kz);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g;
}
function rod(a, b, r, knob = 0) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 14, 1, true); g.translate(0, a.distanceTo(b) / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  const out = [g]; if (knob) for (const p of [a, b]) out.push(new THREE.SphereGeometry(knob, 16, 12).translate(p.x, p.y, p.z));
  return out;
}
export function merge(list) {
  const geos = list.flat().map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return m;
}
const mirror = (fn) => [fn(1), fn(-1)];
// smooth pseudo-noise on the unit sphere
const wob = (v, f, s = 0) => Math.sin(v.x * f + s + 2.1 * Math.sin(v.y * f * .83 + s)) * Math.sin(v.y * f * .91 + 1.3 * Math.sin(v.z * f * 1.1 + s)) * Math.sin(v.z * f * 1.07 + 1.7 * Math.sin(v.x * f * .77));

// ---------------------------------------------------------------- organs
// each: { geo, color (natural pastel), sites: [{ c: centre, via: [...waypoints to the heart junction] or exit: true }] }
const J = V(.02, 1.07, -.02);                                // great-vessel junction above the heart
const IVC = [V(-.03, .2, -.07), V(-.03, .6, -.07), V(-.02, .9, -.05)];
const leg = (s, from) => [...from, V(s * .155, 0, -.02), V(s * .06, .12, -.05), ...IVC];
export const JUNCTION = J;
export const EXIT = [V(.18, 1.19, -.01), V(.4, 1.16, 0), V(.5, .8, .02), V(.535, .6, .03), V(.565, .42, .05)];

export function organs() {
  const O = {};
  // brain: two hemispheres with gyri + cerebellum
  O.brain = { color: '#E8BFC8', geo: merge([
    deform((v, o) => {
      const fis = 1 - .13 * Math.exp(-Math.pow(v.x / .14, 2)) * (v.y > -.2 ? 1 : 0);
      const gy = 1 + .055 * (Math.pow(1 - Math.abs(wob(v, 11, .3)), 3) - .35);
      o.set(v.x * .132, v.y * (v.y < 0 ? .075 : .105), v.z * .15).multiplyScalar(fis * gy).add(V(0, 1.635, 0));
    }, 72, 48),
    deform((v, o) => { const gy = 1 + .03 * Math.sin(v.y * 26); o.set(v.x * .075, v.y * .042 * gy, v.z * .055).add(V(0, 1.545, -.075)); }, 32, 20),
  ]), sites: [{ c: V(0, 1.63, 0), via: [V(0, 1.48, -.03), V(0, 1.3, -.02)] }] };
  // heart: rounded cone, apex down and to the patient's left
  const ax = V(.55, -.75, .35).normalize();
  O.heart = { color: '#E2858A', geo: merge([deform((v, o) => {
    const t = v.dot(ax); const s = 1 - .42 * Math.pow(Math.max(0, t), 1.6);
    o.copy(v).multiplyScalar(.078 * s * (1 + .04 * wob(v, 6, 1))).addScaledVector(ax, Math.max(0, t) * .03).add(V(.055, .94, .065));
  }, 40, 28),
  ...rod(V(.03, 1.0, .04), V(.0, 1.1, .0), .022), ...rod(V(.07, 1.0, .03), V(.1, 1.08, .0), .017)]), sites: [{ c: V(.055, .93, .07), via: [] }] };
  // lungs: tall half-domes, flattened towards the heart
  O.lungs = { color: '#EFC6CC', geo: merge(mirror(s => deform((v, o) => {
    let x = v.x * .1, y = v.y * .185, z = v.z * .1;
    if (v.x * s < 0) x *= .5; if (v.y > 0) { x *= 1 - .35 * v.y; z *= 1 - .3 * v.y; } if (v.y < -.6) y += (-.6 - v.y) * .06;
    o.set(x, y, z).multiplyScalar(1 + .02 * wob(v, 8, s)).add(V(s * .155, 1.0, -.03));
  }, 36, 28))), sites: mirror(s => ({ c: V(s * .155, 1.0, -.03), via: [V(s * .05, 1.06, -.03)] })) };
  // liver: big right lobe (viewer's left) tapering across the midline, flat underside
  // (a small SDF: domed right lobe, thinner left lobe, slanted flat underside with a sharp lower edge)
  O.liver = { color: '#C68579', geo: surfaceNets((x, y, z) => {
    const bnd = sEll(x, y, z, -.02, .71, .04, .27, .18, .14); if (bnd > .04) return bnd;
    let d = smin(sEll(x, y, z, -.1, .7, .04, .13, .12, .11), sEll(x, y, z, .06, .735, .05, .13, .055, .075), .09);
    return -smin(-d, y - (.598 + .1 * (x + .1) + .04 * z), .03);
  }, V(-.26, .54, -.1), V(.22, .87, .18), .009), sites: [{ c: V(-.09, .69, .04), via: [V(-.03, .78, -.06), V(-.02, .9, -.05)] }] };
  // gallbladder + bile ducts (hepatic duct, cystic duct, common bile duct towards the duodenum)
  O.bile = { color: '#9EBF78', geo: merge([
    tubeVar([V(-.105, .555, .125), V(-.09, .6, .12), V(-.075, .635, .1)], u => .028 * Math.pow(1 - u, .6) + .007, { seg: 24, rad: 16 }),
    tubeVar([V(-.075, .635, .1), V(-.055, .655, .075), V(-.045, .7, .06)], () => .0075, { seg: 16, rad: 8 }),
    tubeVar([V(-.055, .655, .075), V(-.045, .58, .055), V(-.04, .5, .04)], () => .0085, { seg: 16, rad: 8 }),
  ]), sites: [{ c: V(-.09, .59, .12), via: [V(-.05, .66, .04), V(-.03, .78, -.06), V(-.02, .9, -.05)] }] };
  // pancreas: lobulated head → tail behind the stomach
  O.pancreas = { color: '#EBC296', geo: tubeVar([V(-.075, .49, .035), V(-.02, .525, .01), V(.07, .55, -.015), V(.15, .575, -.03), V(.215, .6, -.04)],
    u => .036 * (1 - u) + .015 * u, { seg: 56, rad: 18, kz: .7, bump: (u, a) => .12 * Math.abs(Math.sin(u * 47 + Math.sin(a * 3) * 2) * Math.sin(a * 5 + u * 9)) }),
  sites: [{ c: V(.06, .54, -.01), via: [V(0, .62, -.06), V(-.03, .78, -.06), V(-.02, .9, -.05)] }] };
  // kidneys: beans with a medial notch
  O.kidney = { color: '#C48A8C', geo: merge(mirror(s => deform((v, o) => {
    let x = v.x * .042; if (v.x * s < 0) x *= 1 - .55 * Math.exp(-Math.pow(v.y / .4, 2));
    o.set(x, v.y * .07, v.z * .034).applyAxisAngle(V(0, 0, 1), -s * .25).add(V(s * .135, .455, -.095));
  }, 28, 20))), sites: mirror(s => ({ c: V(s * .135, .455, -.095), via: [V(s * .04, .46, -.08), V(-.03, .6, -.07), V(-.02, .9, -.05)] })) };
  // salivary glands: parotid in front of the ear, submandibular under the jaw
  const lob = (c, r, sd) => deform((v, o) => { o.set(v.x * r[0], v.y * r[1], v.z * r[2]).multiplyScalar(1 + .14 * wob(v, 9, sd)).add(c); }, 24, 16);
  O.saliva = { color: '#EDC4A0', geo: merge(mirror(s => [lob(V(s * .128, 1.49, .015), [.026, .045, .026], s), lob(V(s * .072, 1.415, .07), [.024, .02, .022], s + 3)])),
    sites: mirror(s => ({ c: V(s * .11, 1.46, .04), via: [V(s * .04, 1.38, -.01), V(0, 1.25, -.02)] })) };
  // skeletal muscle: limb muscle bellies
  const mus = [];
  const msites = [];
  for (const s of [1, -1]) {
    mus.push(spindle(V(s * .15, .06, .03), V(s * .171, -.72, .03), .092, { kz: .85 }));
    mus.push(spindle(V(s * .176, -.84, -.03), V(s * .186, -1.42, -.03), .058));
    mus.push(spindle(V(s * .412, 1.14, .012), V(s * .515, .7, .012), .046));
    mus.push(spindle(V(s * .532, .58, .015), V(s * .59, .2, .02), .034));
    msites.push({ c: V(s * .16, -.33, .03), via: leg(s, []) });
    msites.push({ c: V(s * .18, -1.12, -.03), via: leg(s, [V(s * .175, -.78, -.03)]) });
    msites.push(s > 0 ? { c: V(.46, .93, .01), exit: [V(.52, .66, .03), V(.545, .52, .04)] } : { c: V(-.46, .93, .01), via: [V(-.42, 1.15, 0), V(-.2, 1.2, -.01)] });
  }
  O.muscle = { color: '#E3A096', geo: merge(mus), sites: msites };
  // bone: limb bones, pelvis, spine, clavicles
  const bones = [];
  for (const s of [1, -1]) {
    bones.push(rod(V(s * .152, .1, -.005), V(s * .171, -.77, 0), .017, .03), rod(V(s * .176, -.82, 0), V(s * .188, -1.62, 0), .014, .024));
    bones.push(rod(V(s * .41, 1.17, 0), V(s * .52, .67, .01), .013, .022), rod(V(s * .53, .62, .01), V(s * .598, .16, .025), .011, .018));
    bones.push(rod(V(s * .03, 1.235, .07), V(s * .33, 1.235, .02), .011, .014));
  }
  const pel = new THREE.TorusGeometry(.14, .022, 12, 40); pel.scale(1.25, 1, .8); pel.rotateX(1.25); pel.translate(0, .2, -.02); bones.push(pel);
  for (let i = 0; i < 17; i++) bones.push(new THREE.CylinderGeometry(.024, .024, .045, 14).translate(0, .3 + i * .07, -.1 + .02 * Math.sin(i * .35)));
  O.bone = { color: '#EDE4D1', geo: merge(bones), sites: [
    ...mirror(s => ({ c: V(s * .162, -.35, 0), via: leg(s, []) })), ...mirror(s => ({ c: V(s * .182, -1.2, 0), via: leg(s, [V(s * .175, -.78, -.03)]) })),
    { c: V(.46, .92, .005), exit: [V(.52, .66, .03), V(.545, .52, .04)] }, { c: V(0, .2, -.02), via: [V(-.03, .3, -.07)].concat(IVC.slice(1)) }, { c: V(0, .85, -.1), via: [V(-.02, .9, -.06)] }] };
  // placenta (only in the ALP beat): lobulated disc low in the abdomen, with a short cord
  O.placenta = { color: '#D88896', geo: merge([deform((v, o) => { o.set(v.x * .1, v.y * .09, v.z * .028).multiplyScalar(1 + .1 * wob(v, 10, 2)).add(V(.01, .3, .1)); }, 32, 24),
    tubeVar([V(.0, .3, .13), V(-.04, .25, .13), V(-.02, .2, .12)], () => .007, { seg: 16, rad: 8 })]),
  sites: [{ c: V(.01, .3, .1), via: [V(-.02, .32, -.04), V(-.03, .6, -.07), V(-.02, .9, -.05)] }] };
  // erythrocytes (only in the LDH beat): red biconcave discs in the veins, drawn just under the skin so they read in front
  // of the organs; LDH is abundant in red cells (haemolysis raises it)
  const R = (() => { let a = 99; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const rbc = [], disc = () => { const g = new THREE.TorusGeometry(.019, .0095, 8, 18); g.scale(1, 1, .7); return g; };
  const lanes = [[V(.155, -.04, .1), V(.06, .11, .1), V(-.03, .2, .1), V(-.03, .44, .1)], [V(-.155, -.04, .1), V(-.07, .11, .1), V(-.035, .18, .1)],
    ...[1, -1].map(s => [V(s * .19, -1.48, .07), V(s * .178, -.8, .1), V(s * .158, -.1, .1)]), [V(-.6, .2, .05), V(-.535, .62, .05), V(-.45, 1.04, .03)]];
  for (const l of lanes) { const cu = new THREE.CatmullRomCurve3(l), n = Math.round(cu.getLength() / .062);
    for (let i = 0; i < n; i++) { const p = cu.getPointAt((i + .5) / n); rbc.push(place(disc(), p.x + (R() - .5) * .028, p.y + (R() - .5) * .028, p.z, R() * 6.28, R() * 6.28, R() * 6.28)); } }
  O.rbc = { color: '#D63B4E', geo: merge(rbc), sites: [
    { c: V(-.03, .33, .1), via: [V(-.03, .6, -.07), V(-.02, .9, -.05)] }, ...mirror(s => ({ c: V(s * .18, -.95, .1), via: leg(s, [V(s * .175, -.78, -.03)]) })),
    { c: V(-.535, .62, .05), via: [V(-.42, 1.15, 0), V(-.2, 1.2, -.01)] }] };
  return O;
}

// thin vessels: venous return to the junction and the sampled arm (patient's left = +x)
export function vesselPaths() {
  return [
    [V(-.03, .08, -.07), ...IVC, J],
    ...[1, -1].map(s => [V(s * .19, -1.58, -.02), V(s * .178, -.8, -.03), V(s * .155, 0, -.02), V(s * .06, .12, -.05), V(-.03, .14, -.07)]),
    [V(0, 1.52, -.04), V(0, 1.3, -.02), J],
    [V(-.6, .16, .02), V(-.535, .62, .02), V(-.42, 1.15, 0), V(-.2, 1.2, -.01), J],
    [J, ...EXIT],
  ];
}
