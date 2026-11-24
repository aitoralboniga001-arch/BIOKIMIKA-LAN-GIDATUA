import * as THREE from 'three';

// Preserve the original molecular/organ attributes and seams. Only change the index buffer.
const levels = new Map(),
  alternateMeshes = [];
export function prepareLOD(scene) {
  scene.traverse((o) => {
    const g = o.geometry,
      p = g?.parameters;
    if (g?.userData.lowGeometry) alternateMeshes.push([o, g, g.userData.lowGeometry]);
    if (!g?.index || !p || levels.has(g) || g.groups.length || !g.isBufferGeometry) return;
    const sphere = g.type === 'SphereGeometry',
      tube = g.type === 'TubeGeometry',
      torus = g.type === 'TorusGeometry';
    if (!sphere && !tube && !torus) return;
    const cols = sphere ? p.widthSegments : tube ? p.radialSegments : p.tubularSegments;
    const rows = sphere ? p.heightSegments : tube ? p.tubularSegments : p.radialSegments;
    if (
      cols * rows < (o.isInstancedMesh && o.count >= 100 ? 48 : 100) ||
      (cols + 1) * (rows + 1) !== g.attributes.position.count
    )
      return;
    // A partial draw range has semantic meaning (the progressive activity curve).
    if (g.userData.progressive) return;
    const index = g.index.array,
      stride = cols + 1;
    const orient = (a, b, c) =>
      ((b % stride) - (a % stride)) * (Math.floor(c / stride) - Math.floor(a / stride)) -
      ((c % stride) - (a % stride)) * (Math.floor(b / stride) - Math.floor(a / stride));
    const positive = orient(index[0], index[1], index[2]) > 0;
    const build = (step) => {
      const ids = [];
      for (let y = 0; y < rows; y += step)
        for (let x = 0; x < cols; x += step) {
          const right = Math.min(cols, x + step),
            down = Math.min(rows, y + step);
          const a = y * stride + x,
            b = y * stride + right,
            c = down * stride + x,
            d = down * stride + right;
          if (positive) ids.push(a, b, c, b, d, c);
          else ids.push(a, c, b, b, c, d);
        }
      return new THREE.Uint32BufferAttribute(ids, 1);
    };
    const normalStep = o.isInstancedMesh && o.count >= 60 && cols * rows >= 350 ? 2 : 1;
    levels.set(g, [
      normalStep === 1 ? g.index : build(normalStep),
      build(normalStep === 2 ? 3 : 2),
    ]);
  });
}
export function setLOD(high) {
  for (const [mesh, full, light] of alternateMeshes) mesh.geometry = high ? full : light;
  for (const [g, indices] of levels) g.setIndex(indices[high ? 0 : 1]);
}
