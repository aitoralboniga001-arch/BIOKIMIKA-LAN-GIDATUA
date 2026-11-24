// Slide 7 organ: a recognisable pancreas (lobulated head in the duodenal C-loop, body and tapering tail,
// main pancreatic duct shown in a front cut-away) built once from a small SDF with surface nets. Local units; patient's right = −x.
import { THREE } from '../core.js';
import { surfaceNets } from './s04_tissues_anatomy.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function sEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt(px * px / (rx * rx) + py * py / (ry * ry) + pz * pz / (rz * rz)) || 1e-6; return k0 * (k0 - 1) / k1;
}
function sCone(x, y, z, a, b, ra, rb) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz); h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h; return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };

// main pancreatic duct: tail → body → neck → head, then down to the major papilla in the duodenal wall
export const DUCT = [V(.8, .45, .025), V(.45, .34, .065), V(.05, .23, .09), V(-.3, .12, .095), V(-.58, .0, .1), V(-.76, -.1, .07), V(-.9, -.12, .03)];
const DSEG = DUCT.slice(0, -1).map((p, i) => [[p.x, p.y, p.z + .055], [DUCT[i + 1].x, DUCT[i + 1].y, DUCT[i + 1].z + .055]]);   // groove axis, just in front of the duct

const P0 = [-.62, -.1, 0], P1 = [.1, .24, 0], P2 = [.84, .47, 0], P3 = [-.45, .1, 0], P4 = [.84, .47, -.02];
export function pancreasSDF(x, y, z) {
  const bnd = Math.min(sCone(x, y, z, P0, P1, .42, .3), sCone(x, y, z, P1, P2, .3, .2));
  if (bnd > .05) return bnd;                                                   // cheap bound: far from the organ
  let d = sEll(x, y, z, -.6, -.02, 0, .25, .29, .15);                         // head
  d = smin(d, sEll(x, y, z, -.5, -.24, -.01, .19, .1, .12), .1);             // uncinate process
  d = smin(d, sCone(x, y, z, P3, P1, .15, .14), .14);   // neck → body
  d = smin(d, sCone(x, y, z, P1, P4, .14, .065), .1); // body → tail
  if (d > .06) return d;                                                       // far outside: skip the detail terms
  const n = Math.sin(x * 34 + 1.3 * Math.sin(y * 23)) * Math.sin(y * 31 + 1.1 * Math.sin(z * 27)) * Math.sin(z * 35 + 1.7 * Math.sin(x * 21));
  d -= .02 * (Math.abs(n) - .35);                                              // lobules (creased between bumps)
  // front cut-away along the duct
  let c = 9; for (const [a, b] of DSEG) c = Math.min(c, sCone(x, y, z, a, b, .045, .045));
  return -smin(-d, c, .02);
}

export function pancreasParts() {
  const geo = surfaceNets(pancreasSDF, V(-.9, -.42, -.22), V(.98, .62, .22), .013);
  const duct = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(DUCT, false, 'centripetal'), 90, .032, 10, false);
  const duo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-.42, .46, -.02), V(-.72, .43, 0), V(-.95, .24, 0), V(-1.0, -.06, 0), V(-.93, -.36, 0), V(-.68, -.5, 0), V(-.36, -.48, 0), V(-.08, -.36, -.02), V(.08, -.24, -.04)], false, 'centripetal'), 120, .1, 22, false);
  // gentle circular folds on the duodenum
  const p = duo.attributes.position, n = duo.attributes.normal;
  for (let i = 0; i < p.count; i++) { const ring = Math.floor(i / 23), k = .006 * Math.sin(ring * .9); p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k); }
  duo.computeVertexNormals();
  return { geo, duct, duo };
}
