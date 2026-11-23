// A tissue cell: breathing membrane (pores / shatter), nucleus, mitochondria, faint cytosol.
import { THREE, rng } from './core.js';
import { membraneGeo, membraneMat, fresnelMat, blobGeo, mito, C, COL3 } from './lib3d.js';

export function makeCell({ R = 1.6, nMito = 4, seed = 3, tint = COL3.membrane } = {}) {
  const group = new THREE.Group();
  const mem = new THREE.Mesh(membraneGeo(R, 20), membraneMat({ color: lightTintToRim(tint) })); mem.material.uniforms.uR.value = R; mem.renderOrder = 5;
  group.add(mem);
  const cyto = new THREE.Mesh(new THREE.SphereGeometry(R * .985, 48, 32), fresnelMat({ color: COL3.cyto, power: 1.2, intensity: .18, base: .1, side: THREE.BackSide }));
  group.add(cyto);
  const nucMat = new THREE.MeshPhysicalMaterial({ color: C('#7458d4'), roughness: .35, clearcoat: .8, sheen: .6, sheenColor: C('#c9b8ff'), emissive: C('#2b1b66'), emissiveIntensity: .1, envMapIntensity: .7, transparent: true });
  const nucleus = new THREE.Mesh(blobGeo(seed + 10, R * .36, { lumps: 6, amp: .1, noise: .03 }), nucMat);
  nucleus.position.set(-R * .18, R * .12, -R * .1); group.add(nucleus);
  const nl = new THREE.Mesh(new THREE.SphereGeometry(R * .1, 24, 16), new THREE.MeshStandardMaterial({ color: '#4a2f9a', emissive: '#4b2fa0', emissiveIntensity: .15, transparent: true }));
  nl.position.copy(nucleus.position).add(new THREE.Vector3(R * .08, R * .05, R * .25)); group.add(nl);
  const R2 = rng(seed); const mitos = [];
  const spots = [[.45, -.35, .25], [-.5, -.45, .2], [.15, .55, .3], [.55, .25, -.35], [-.2, -.6, -.35]];
  for (let i = 0; i < nMito; i++) {
    const m = mito(); const s = spots[i % spots.length];
    m.position.set(s[0] * R, s[1] * R, s[2] * R); m.rotation.set(R2() * 3, R2() * 3, R2() * 3); m.scale.setScalar(R * .62);
    group.add(m); mitos.push(m);
  }
  const nucR = R * .42;
  function randomInside(rnd, out = new THREE.Vector3()) {
    for (let k = 0; k < 30; k++) {
      out.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (out.lengthSq() > 1) continue; out.multiplyScalar(R * .82);
      if (out.distanceTo(nucleus.position) < nucR) continue; return out;
    }
    return out.set(R * .5, -R * .3, R * .2);
  }
  return { group, mem, memU: mem.material.uniforms, nucleus, nucMat, nl, mitos, cyto, R, randomInside };
}

// night-theme tints (e.g. the old default '#ffb38a') are too pale for a rim on a light background: deepen them
function lightTintToRim(hex) {
  const c = C(hex), hsl = {}; c.getHSL(hsl);
  return hsl.l > .62 ? new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, .6), .55) : c;
}
