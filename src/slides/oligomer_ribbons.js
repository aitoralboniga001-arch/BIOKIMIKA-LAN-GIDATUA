// Backbone cartoons from the human biological assemblies 1I0E (CK) and 1I10 (LDH).
// Each ten-byte residue stores C-alpha in 0.1 angstroms, a local width axis,
// and the deposited secondary-structure class. Bit 2 starts a fresh segment.
import { THREE } from '../core.js';
import coordinates from './oligomer_coordinates.json';

const shapes = new Map();
const materials = new Map();

function decode(encoded) {
  const data = new DataView(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)).buffer);
  const residues = [];
  for (let i = 0; i < data.byteLength; i += 10) {
    const flag = data.getUint8(i + 9);
    residues.push({
      ca: new THREE.Vector3(...[0, 2, 4].map(k => data.getInt16(i + k, true) / 10)),
      width: new THREE.Vector3(...[6, 7, 8].map(k => data.getInt8(i + k) / 120)).normalize(),
      type: flag & 3, start: Boolean(flag & 4)
    });
  }
  return residues;
}

function halfWidth(residues, i) {
  const type = residues[i].type;
  if (type === 2) {
    if (residues[i + 1]?.type !== 2) return .65;
    if (residues[i + 2]?.type !== 2) return 2.55;
    return 1.88;
  }
  return type === 1 ? 1.75 : .69;
}

function ribbon(chain, centre, samples, sides) {
  const positions = [], triangles = [];
  const tangent = new THREE.Vector3(), point = new THREE.Vector3(), width = new THREE.Vector3();
  const binormal = new THREE.Vector3(), vertex = new THREE.Vector3();
  let first = 0;
  while (first < chain.length) {
    let end = first + 1;
    while (end < chain.length && !chain[end].start) end++;
    const segment = chain.slice(first, end);
    first = end;
    if (segment.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(segment.map(r => r.ca));
    const steps = (segment.length - 1) * samples;
    for (let step = 0; step <= steps; step++) {
      const i = Math.min(Math.floor(step / samples), segment.length - 2), f = step / samples - i;
      const a = segment[i], b = segment[i + 1];
      curve.getPoint(step / steps, point).sub(centre);
      curve.getTangent(step / steps, tangent);
      width.lerpVectors(a.width, b.width, f);
      width.addScaledVector(tangent, -width.dot(tangent)).normalize();
      binormal.crossVectors(tangent, width).normalize();
      const w = THREE.MathUtils.lerp(halfWidth(segment, i), halfWidth(segment, i + 1), f);
      const h = THREE.MathUtils.lerp(a.type ? .45 : .69, b.type ? .45 : .69, f);
      const base = positions.length / 3;
      for (let j = 0; j < sides; j++) {
        const angle = j * Math.PI * 2 / sides;
        vertex.copy(point).addScaledVector(width, w * Math.cos(angle)).addScaledVector(binormal, h * Math.sin(angle));
        positions.push(vertex.x, vertex.y, vertex.z);
        if (step < steps) {
          const n = (j + 1) % sides;
          triangles.push(base + j, base + n, base + sides + j, base + n, base + sides + n, base + sides + j);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(triangles);
  geo.computeVertexNormals();
  return geo;
}

function shape(entry) {
  if (shapes.has(entry)) return shapes.get(entry);
  const box = new THREE.Box3();
  const chains = coordinates[entry].map(decode).map(residues => {
    const centre = new THREE.Vector3();
    for (const r of residues) { centre.add(r.ca); box.expandByPoint(r.ca); }
    centre.divideScalar(residues.length);
    const geo = ribbon(residues, centre, 2, 6);
    geo.userData.lowGeometry = ribbon(residues, centre, 1, 5);
    return { geo, centre };
  });
  const size = box.getSize(new THREE.Vector3()), origin = box.getCenter(new THREE.Vector3());
  const data = { chains, size, origin };
  shapes.set(entry, data);
  return data;
}

export function ribbonAssembly(entry, colors, maxWidth, maxHeight) {
  const { chains, size, origin } = shape(entry);
  const scale = Math.min(maxWidth / size.x, maxHeight / size.y);
  const g = new THREE.Group();
  const parts = chains.map(({ geo, centre }, j) => {
    const color = colors[j];
    const shade = [1, .67, .87, .56][j];
    const key = color + ':' + shade;
    if (!materials.has(key)) {
      const tint = new THREE.Color(color).multiplyScalar(shade);
      materials.set(key, new THREE.MeshStandardMaterial({color: tint, roughness: .54, metalness: .05}));
    }
    const mesh = new THREE.Mesh(geo, materials.get(key));
    mesh.scale.setScalar(scale);
    const slot = centre.clone().sub(origin).multiplyScalar(scale);
    mesh.position.copy(slot);
    g.add(mesh);
    return { mesh, slot };
  });
  return {g, parts};
}

// Exploded view closes along each chain's radial axis. The final pose retains
// the orientation and registration of the original biological assembly.
export function dock(model, progress, time, index) {
  const p = THREE.MathUtils.smoothstep(progress - index * .055, 0, .72);
  const gap = 1 - p;
  model.g.rotation.set(.055 * Math.sin(time * .3), .16 * Math.sin(time * .36 + .24 * index), 0);
  model.parts.forEach(({mesh, slot}, j) => {
    mesh.position.copy(slot).multiplyScalar(1 + .62 * gap);
    mesh.rotation.y = (j % 2 ? 1 : -1) * gap * .24;
  });
}

