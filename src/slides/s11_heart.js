// Anatomical heart for slide 11 (anterior / sternocostal view), built procedurally.
//   Ventricles: one deformed sphere in a "heart frame" (long axis = y, apex at −y, anterior = +z, patient's left = +x):
//   the left ventricle forms the apex and the left border, the right ventricle bulges over the anterior surface,
//   anterior and posterior interventricular grooves and the coronary (atrioventricular) sulcus are indented.
//   The heart frame is tilted (TILT) so the apex points down, forward and to the patient's left (viewer's right).
//   Great vessels and atria are authored in body coordinates (y up) relative to the aortic root and converted.
//   Coronary tree on the surface: left main → LAD (anterior interventricular groove, diagonals to the LV) and
//   circumflex (left AV groove, obtuse marginal); RCA (right AV groove, acute marginal). Main arteries lie in
//   yellowish epicardial fat. The LAD is occluded at CLOT_U: everything downstream (distal LAD + diagonals) loses flow
//   and its territory turns ischaemic. Ventricles, fat and arteries share one vertex shader: a lub-dub contraction
//   (radial squeeze + apex lift) that is weak, late and outward (dyskinetic) inside the ischaemic zone.
import { THREE } from '../core.js';
import { C, blobGeo, fixSphereSeams } from '../lib3d.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const TILT = new THREE.Euler(-.24, 0, .62);
const qT = new THREE.Quaternion().setFromEuler(TILT), qTi = qT.clone().invert();
const toLocal = v => v.clone().applyQuaternion(qTi);
const toBody = v => v.clone().applyQuaternion(qT);

const RVPHI = 2.3, RVW = 1.1, GA = 1.0, GP = -2.55, SULC = .7, CLOT_U = .3;

// ---------------------------------------------------------------- ventricular surface
function ventPoint(v, out = new THREE.Vector3()) {
  const y = v.y, phi = Math.atan2(v.z, v.x);
  let r = 1;
  r += .2 * Math.exp(-((angD(phi, RVPHI) / RVW) ** 2)) * ss(-.93, -.35, y);                  // right ventricle bulge
  r -= .045 * Math.exp(-((angD(phi, GA) / .11) ** 2)) * ss(-.99, -.75, y) * (1 - ss(.78, .95, y)); // anterior IV groove
  r -= .04 * Math.exp(-((angD(phi, GP) / .12) ** 2)) * ss(-.99, -.75, y) * (1 - ss(.78, .95, y));  // posterior IV groove
  r -= .055 * Math.exp(-(((y - SULC) / .07) ** 2));                                                  // coronary sulcus
  r *= 1 + .012 * Math.sin(phi * 5 + y * 7) * Math.sin(y * 11);                                     // a little irregularity
  const hs = y < 0 ? 1 - .16 * -y : 1 - .1 * y;
  const Y = y < 0 ? y * 1.42 : y * .8;
  return out.set(v.x * r * hs, Y, v.z * r * hs * (v.z < 0 ? .84 : .93));
}
const dirYP = (y, phi, out = new THREE.Vector3()) => { const h = Math.sqrt(Math.max(0, 1 - y * y)); return out.set(h * Math.cos(phi), y, h * Math.sin(phi)); };
// surface point at (y, phi), lifted along the outward normal-ish direction
function surf(y, phi, lift = 0) {
  const d = dirYP(y, phi), p = ventPoint(d), e = .01;
  const px = ventPoint(dirYP(Math.min(.999, y + e), phi)).sub(p), pp = ventPoint(dirYP(y, phi + e)).sub(p);
  const n = new THREE.Vector3().crossVectors(px, pp).normalize(); if (n.dot(p) < 0) n.negate();
  return p.addScaledVector(n, lift);
}
function pathYP(f, n, lift) { const a = []; for (let i = 0; i <= n; i++) { const [y, phi] = f(i / n); a.push(surf(y, phi, lift)); } return a; }

// ---------------------------------------------------------------- materials with the shared beat / ischaemia shader
const VERT_HEAD = `attribute float aTerr; attribute float aL; uniform float uPulse, uLag, uIR, uIk; varying float vTerr; varying float vL; varying vec3 vObj;\n`;
const VERT_BODY = `#include <begin_vertex>
  vTerr = aTerr; vL = aL; vObj = position;
  float izv = uIk * (1. - smoothstep(uIR * .8, uIR, aTerr));
  float wall = 1. - smoothstep(.3, .78, position.y);
  float kk = mix(uPulse, -.5 * uLag, izv) * wall;
  transformed.xz *= 1. - .06 * kk;
  transformed.y += .075 * kk * smoothstep(.6, -1.42, position.y);`;
function beatMat(params, U, { isch = false, flow = null } = {}) {
  const m = new THREE.MeshPhysicalMaterial(params);
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, U); if (flow) s.uniforms.uFlow = flow;
    s.vertexShader = VERT_HEAD + s.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    let head = 'uniform float uIR, uIk, uT; varying float vTerr; varying float vL; varying vec3 vObj;\n';
    if (flow) head += 'uniform float uFlow;\n';
    s.fragmentShader = head + s.fragmentShader;
    if (isch) s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb*=1.+.055*sin(vObj.x*7.+sin(vObj.z*9.))*sin(vObj.y*8.);
      float broad = sin(vObj.x*3.1 + vObj.z*2.3)*sin(vObj.y*4.2-vObj.z*.8);
      float R = max(.002,uIR * (1. + .035*broad));
      float core = (1.-smoothstep(.52*R,1.20*R,vTerr))*uIk;
      vec3 dusk = mix(vec3(.32,.145,.17),vec3(.49,.31,.31),.51+.25*broad);
      diffuseColor.rgb = mix(diffuseColor.rgb,dusk,core*.9);`);
    if (flow) s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float st = pow(.5 + .5 * sin((vL * 2.4 - uT * 1.3) * 6.2832), 5.) * uFlow;
      totalEmissiveRadiance += vec3(1., .72, .55) * st * .32;`);
  };
  return m;
}

// tapered tube along a smooth curve; adds aTerr (ischaemia distance) and aL (length coordinate) attributes
function tube(pts, r0, r1, { seg = 64, rad = 14, terr = null, L0 = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  const len = curve.getLength(), aL = new Float32Array(p.count), aT = new Float32Array(p.count);
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; curve.getPointAt(u, c); const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); aL[k] = L0 + u * len; }
  }
  if (terr) for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); aT[k] = terr(v); } else aT.fill(9);
  g.setAttribute('aL', new THREE.BufferAttribute(aL, 1)); g.setAttribute('aTerr', new THREE.BufferAttribute(aT, 1));
  g.computeVertexNormals(); g.userData.len = len;
  return g;
}

export function buildHeart() {
  const U = { uPulse: { value: 0 }, uLag: { value: 0 }, uIR: { value: .3 }, uIk: { value: 0 }, uT: { value: 0 } };
  const flowP = { value: 1 }, flowD = { value: 1 };
  const g = new THREE.Group(); g.rotation.copy(TILT);
  const body = new THREE.Group(); // parts authored in body coordinates are converted into g's frame

  // ---------------------------------------------------------------- coronary paths (heart frame)
  const LIFT = .035;
  const lad = pathYP(u => [.72 - u * 1.69, GA + .03 + u * u * .55], 40, LIFT);
  const clotI = Math.round(CLOT_U * 40);
  const d1 = pathYP(u => [.72 - .38 * 1.69 - u * .55, GA - u * .95], 16, LIFT);
  const d2 = pathYP(u => [.72 - .6 * 1.69 - u * .42, GA - u * .8], 14, LIFT);
  const cx = pathYP(u => [SULC + .02, GA - .05 - u * 2.9], 40, LIFT);
  const om = pathYP(u => [SULC - .05 - u * .95, -.35 - u * .3], 16, LIFT);
  const rcaS = pathYP(u => [SULC + .01, 1.95 + u * 2.0], 36, LIFT);
  const am = pathYP(u => [SULC - .05 - u * 1.15, 2.95 + u * .12], 18, LIFT);
  // distal territory: the part of the LAD beyond the clot plus both diagonals
  const terrPts = [...lad.slice(clotI + 2), ...d1, ...d2];
  const terr = (p) => { let m = 9; for (const q of terrPts) { const d = p.distanceTo(q); if (d < m) m = d; } return m; };
  const terrC = new THREE.Vector3(); for (const q of lad.slice(clotI + 6, 34)) terrC.add(q); terrC.multiplyScalar(1 / (34 - clotI - 6));
  terrC.lerp(d1[8], .35);
  const ventN = (p) => p.clone().normalize();

  // ---------------------------------------------------------------- ventricles
  const geo = new THREE.SphereGeometry(1, 144, 108); const p = geo.attributes.position, v = new THREE.Vector3();
  const aT = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); ventPoint(v, v); p.setXYZ(i, v.x, v.y, v.z); aT[i] = terr(v); }
  geo.computeVertexNormals(); fixSphereSeams(geo, 144, 108);
  geo.setAttribute('aTerr', new THREE.BufferAttribute(aT, 1)); geo.setAttribute('aL', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  const myo = { color: C('#863d45'), roughness: .5, clearcoat: .6, clearcoatRoughness: .3, sheen: .15, sheenRoughness: .5, sheenColor: C('#FFB0A0'), envMapIntensity: .7 };
  const vent = new THREE.Mesh(geo, beatMat(myo, U, { isch: true })); vent.castShadow=true; g.add(vent);

  // ---------------------------------------------------------------- epicardial fat + coronary arteries
  const fatMat = beatMat({ color: C('#DDB673'), roughness: .6, clearcoat: .5, clearcoatRoughness: .4, sheen: .3, sheenColor: C('#FFF0C0'), envMapIntensity: .7 }, U);
  const artP = { color: C('#F04A30'), roughness: .35, clearcoat: .8, clearcoatRoughness: .2, envMapIntensity: .8 };
  const artMat = beatMat(artP, U, { flow: flowP });
  const distMat = beatMat({ ...artP, color: C('#F2533A') }, U, { flow: flowD });
  const sink = (pts, k) => pts.map(q => q.clone().addScaledVector(ventN(q), -k));
  const addT = (pts, r0, r1, mat, o = {}) => { const m = new THREE.Mesh(tube(pts, r0, r1, { terr, ...o }), mat); g.add(m); return m; };
  for (const [pts, r] of [[lad, .085], [cx, .085], [rcaS, .085], [d1.slice(0, 6), .06], [am.slice(0, 8), .06]]) addT(sink(pts, .065), r, r * .7, fatMat, { seg: pts.length * 3 });

  // aortic root, in heart frame
  const AR = V(-.12, .9, .05);
  const ARb = toBody(AR);
  const B = (x, y, z) => toLocal(V(ARb.x + x, ARb.y + y, ARb.z + z));
  // left main: from the left aortic sinus, behind the pulmonary trunk, to the LAD / circumflex split
  const lm = [B(.12, .05, .2), B(.3, .02, .32), lad[0].clone().lerp(cx[0], .5).addScaledVector(ventN(lad[0]), .03)];
  // Epicardial fat follows the proximal coronary grooves.
  const fat=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,7),new THREE.MeshStandardMaterial({color:'#d9ac78',roughness:.71}),20);
  const fatPose=new THREE.Object3D();
  for(let i=0;i<20;i++){const base=i%2?cx:lad;const p=base[Math.min(base.length-1,Math.floor(i*.63))];
    fatPose.position.copy(p);fatPose.position.x+=i%2?.065:-.066;fatPose.scale.set(.075,.047,.032);fatPose.updateMatrix();fat.setMatrixAt(i,fatPose.matrix);}
  g.add(fat);
  const lmL = tube(lm, .05, .048).userData.len;
  addT(lm, .05, .048, artMat, { seg: 20 });
  const ladProx = addT(lad.slice(0, clotI + 1), .05, .046, artMat, { seg: 40, L0: lmL });
  const ladLen = ladProx.geometry.userData.len;
  addT(lad.slice(clotI), .046, .028, distMat, { seg: 90, L0: lmL + ladLen });
  addT([lad[Math.round(.38 * 40)], ...d1.slice(1)], .032, .02, distMat, { seg: 40, L0: lmL + ladLen + .4 });
  addT([lad[Math.round(.6 * 40)], ...d2.slice(1)], .028, .018, distMat, { seg: 36, L0: lmL + ladLen + .8 });
  addT([lm[2], ...cx.slice(1)], .048, .032, artMat, { seg: 110, L0: lmL });
  addT([cx[Math.round(.2 * 40)], ...om.slice(1)], .032, .02, artMat, { seg: 40, L0: lmL + .6 });
  const rca = [B(-.12, .02, .25), B(-.3, -.08, .35), ...rcaS];
  addT(rca, .05, .036, artMat, { seg: 120 });
  addT([rcaS[Math.round(.48 * 36)], ...am.slice(1)], .034, .022, artMat, { seg: 46, L0: 1.2 });

  // ---------------------------------------------------------------- great vessels and atria (body coordinates)
  const vesselMat = (col, sheen) => new THREE.MeshPhysicalMaterial({ color: C(col), roughness: .28, clearcoat: .75, clearcoatRoughness: .19, sheen: .3, sheenColor: C(sheen), envMapIntensity: .7, side: THREE.DoubleSide });
  const aoMat = vesselMat('#C43C48', '#FFB8B0'), vMat = vesselMat('#4F69BE', '#C0CCFF');
  const BT = (pts, r0, r1, mat, seg = 64) => { const m = new THREE.Mesh(tube(pts.map(q => B(q[0], q[1], q[2])), r0, r1, { seg, rad: 22 }), mat); g.add(m); return m; };
  // aorta: ascending, arch (up, back and to the patient's left), descending behind the heart
  BT([[0, -.1, 0], [-.02, .5, .05], [.02, 1.05, 0], [.25, 1.42, -.2], [.62, 1.4, -.5], [.82, .9, -.68], [.88, -.2, -.75], [.88, -1.2, -.75]], .26, .2, aoMat, 120);
  BT([[.1, 1.38, -.1], [.04, 1.75, -.08], [-.02, 2.05, -.06]], .11, .095, aoMat, 24);
  BT([[.36, 1.45, -.28], [.4, 1.8, -.3], [.42, 2.08, -.31]], .075, .068, aoMat, 24);
  BT([[.58, 1.4, -.44], [.68, 1.75, -.5], [.78, 2.0, -.53]], .08, .07, aoMat, 24);
  // right ventricular outflow (myocardium) and the pulmonary trunk with its two branches
  const pv = [.42, .2, .5];
  const conusMat = beatMat(myo, U);
  const conusPts = [surf(.25, 1.75, -.12), surf(.52, 1.55, -.04), B(pv[0] - .05, pv[1] - .12, pv[2] - .02), B(...pv)];
  const conus = new THREE.Mesh(tube(conusPts, .36, .23, { seg: 40, rad: 24 }), conusMat); g.add(conus);
  BT([pv, [pv[0] + .05, pv[1] + .4, pv[2] - .1], [pv[0] + .08, pv[1] + .66, pv[2] - .38]], .23, .21, vMat, 40);
  BT([[pv[0] + .08, pv[1] + .66, pv[2] - .38], [pv[0] + .5, pv[1] + .74, pv[2] - .6], [pv[0] + .95, pv[1] + .66, pv[2] - .72]], .15, .13, vMat, 30);
  BT([[pv[0] + .06, pv[1] + .66, pv[2] - .4], [pv[0] - .4, pv[1] + .7, pv[2] - .75], [pv[0] - 1.1, pv[1] + .62, pv[2] - .85]], .15, .13, vMat, 30);
  // venae cavae
  BT([[-.62, -.05, -.15], [-.64, .7, -.18], [-.65, 1.6, -.2]], .2, .19, vMat, 30);
  // atria and auricles
  const atria = new THREE.Group(); g.add(atria);
  const aMat = new THREE.MeshPhysicalMaterial({ ...myo, color: C('#BA4650') }); // atria beat by scaling in update()
  const atrium = (seed, rr, pos, sc, rot = [0, 0, 0], amp = .1, lumps = 6) => {
    const m = new THREE.Mesh(blobGeo(seed, rr, { lumps, amp, noise: .02 }), aMat);
    const P = B(...pos); m.position.copy(P); m.scale.set(...sc); m.rotation.set(...rot); atria.add(m); return m;
  };
  const ra = atrium(61, .5, [-.64, -.28, -.24], [.85, 1.12, .85]);
  const raa = atrium(64, .3, [-.36, -.02, .36], [1.25, .7, .75], [.3, .2, -.6], .22, 9);       // right auricle, over the aortic root
  const la = atrium(62, .45, [.35, -.1, -.78], [1.2, .85, .9]);
  const laa = atrium(63, .25, [.88, -.18, .2], [1.3, .62, .8], [.1, -.4, .5], .24, 9);          // left auricle, beside the pulmonary trunk

  // ---------------------------------------------------------------- clot at the occlusion
  const clotP = lad[clotI].clone();
  const clot = new THREE.Mesh(blobGeo(71, .075, { lumps: 7, amp: .35, noise: .05 }), new THREE.MeshPhysicalMaterial({ color: C('#4A1220'), roughness: .75, clearcoat: .2, sheen: .4, sheenColor: C('#A04050') }));
  clot.position.copy(clotP).addScaledVector(ventN(clotP), .012); clot.scale.set(1.5, 1.8, 1.5); g.add(clot);

  return { group: g, U, flowP, flowD, distMat, atria: [ra, raa, la, laa], clot, clotP, terrC, terrN: ventN(terrC), cor: { lad, cx, rcaS } };
}
