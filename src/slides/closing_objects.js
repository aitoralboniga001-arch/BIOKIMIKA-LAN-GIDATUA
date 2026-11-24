import { THREE } from '../core.js';
import { bodyGeo } from './s04_tissues_anatomy.js';
import { fresnelMat } from '../lib3d.js';
import { specimen } from './specimens.js';
import { tissueSlab } from './s05_intensity.js';
import { balanceModel } from '../sim.js';

export function closingObjects(scene) {
  const groups = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    scene.add(g);
    return g;
  });
  function piece(group, geo, color, x, y, z) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.53 }));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  const body = new THREE.Mesh(
    bodyGeo(0.085),
    fresnelMat({ color: '#506e8c', power: 1.7, intensity: 0.81, base: 0.16 }),
  );
  body.scale.setScalar(0.33);
  groups[0].add(body);
  const liver = specimen('liver');
  liver.scale.setScalar(.15);
  liver.position.set(-.025,.22,.036);
  groups[0].add(liver);

  // Repeat the tissue comparison from the lesion scene, using its actual hexagonal cells.
  for (const [x, damaged] of [[-.23, 30], [.23, 5]]) {
    const tissue = tissueSlab();
    const order = tissue.pos.map((p, i) => ({i, distance:p.lengthSq()}))
      .sort((a, b) => a.distance - b.distance);
    for (const {i} of order.slice(0, damaged)) tissue.aDmg[i] = 1;
    tissue.mesh.position.x = x;
    tissue.mesh.scale.setScalar(.11);
    tissue.mesh.rotation.x = .73;
    groups[1].add(tissue.mesh);
  }
  const clock = groups[2];
  piece(
    clock,
    new THREE.CylinderGeometry(0.25, 0.25, 0.06, 32),
    '#526d88',
    -0.19,
    0.08,
    0,
  ).rotation.x = Math.PI / 2;
  piece(
    clock,
    new THREE.CylinderGeometry(0.215, 0.215, 0.065, 32),
    '#f5f1e4',
    -0.19,
    0.08,
    0.02,
  ).rotation.x = Math.PI / 2;
  piece(clock, new THREE.BoxGeometry(0.025, 0.145, 0.02), '#526d88', -0.19, 0.15, 0.067);
  piece(clock, new THREE.BoxGeometry(0.11, 0.025, 0.02), '#526d88', -0.14, 0.08, 0.07);
  const model = balanceModel({ peak: 0.8, k: 7, onset: 0.03, tRise: 0.12, shape: 2.1 });
  const pts = Array.from(
    { length: 40 },
    (_, i) => new THREE.Vector3(-0.02 + i / 65, -0.24 + model.A(i / 39) * 0.42, 0.03),
  );
  clock.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.017, 6, false),
      new THREE.MeshStandardMaterial({ color: '#4781af' }),
    ),
  );
  const record = groups[3];
  piece(record, new THREE.BoxGeometry(0.53, 0.69, 0.07), '#58897b', 0, 0, 0);
  piece(record, new THREE.BoxGeometry(0.45, 0.58, 0.02), '#faf6e9', 0, -0.015, 0.045);
  piece(record, new THREE.BoxGeometry(0.22, 0.08, 0.04), '#74929c', 0, 0.29, 0.07);
  for (let i = 0; i < 3; i++)
    piece(
      record,
      new THREE.BoxGeometry(i === 2 ? 0.17 : 0.3, 0.022, 0.015),
      '#699582',
      -0.01,
      0.13 - 0.12 * i,
      0.07,
    );
  return groups;
}
