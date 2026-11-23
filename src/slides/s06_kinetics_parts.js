// Parts for slides 6–7: a damageable hex-cell tissue patch (same visual language as slide 5) and a clearance sink.
import { THREE, rng } from '../core.js';
import { C, COL3 } from '../lib3d.js';

// tissue patch: pale cytosol hex cells; aDmg (0..1 per cell) shrinks a cell, greys it and flashes it once as it breaks
export function hexPatch({ cols = 7, rows = 6, hr = .115, h = .14, seed = 3, origin = [-.25, .15] } = {}) {
  const n = cols * rows;
  const geo = new THREE.CylinderGeometry(hr * .92, hr * .92, h, 6); geo.rotateY(Math.PI / 6);
  const aDmg = new Float32Array(n);
  geo.setAttribute('aDmg', new THREE.InstancedBufferAttribute(aDmg, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.MeshStandardMaterial({ color: '#F3BFA8', roughness: .55, metalness: 0, envMapIntensity: .75 });
  const flash = { value: C(COL3.coral) };
  mat.onBeforeCompile = s => {
    s.uniforms.uFl = flash;
    s.vertexShader = 'attribute float aDmg; varying float vDmg;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vDmg = aDmg; transformed.y *= 1. - aDmg * .6; transformed.xz *= 1. - aDmg * .16;');
    s.fragmentShader = 'uniform vec3 uFl; varying float vDmg;\n' + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.36,.38,.49), vDmg);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uFl * vDmg * (1. - vDmg) * 1.8;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const pos = [], d = new THREE.Object3D(), w = Math.sqrt(3) * hr, R = rng(seed);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; const x = (c - (cols - 1) / 2 + (r % 2) * .5 - .25) * w, z = (r - (rows - 1) / 2) * 1.5 * hr;
    d.position.set(x, 0, z); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); pos.push(new THREE.Vector3(x, h / 2, z));
  }
  // damage order: a front spreading from `origin` (patch-local x, z), slightly irregular
  const ox = origin[0] * cols * w * .5, oz = origin[1] * rows * hr * 1.5 * .5;
  const order = pos.map((p, i) => [Math.hypot(p.x - ox, p.z - oz) + R() * hr * 1.2, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  return { mesh, geo, pos, aDmg, order, n };
}

// clearance zone: a soft pale disc with turning circular arrows ("taken out and broken down"); removed molecules
// reach it and fall apart into fragments that fade (see Flow, sink streams)
let _zone = null;
function zoneTex() {
  if (_zone) return _zone;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.translate(128, 128);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 124); g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(.7, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 124, 0, 7); x.fill();
  x.setLineDash([4, 9]); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(0, 0, 112, 0, 7); x.stroke(); x.setLineDash([]);
  x.strokeStyle = x.fillStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 9; x.lineCap = 'round';
  for (let k = 0; k < 3; k++) {             // three circular arrows, clockwise
    const a0 = k * 2.094 + .35, a1 = a0 + 1.35, r = 80;
    x.beginPath(); x.arc(0, 0, r, a0, a1); x.stroke();
    const hx = Math.cos(a1) * r, hy = Math.sin(a1) * r, tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1);
    x.beginPath(); x.moveTo(hx + tx * 22, hy + ty * 22); x.lineTo(hx + nx * 17, hy + ny * 17); x.lineTo(hx - nx * 17, hy - ny * 17); x.closePath(); x.fill();
  }
  _zone = new THREE.CanvasTexture(c); _zone.colorSpace = THREE.SRGBColorSpace; return _zone;
}
export function clearZone({ r = .36, color = COL3.blue } = {}) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4), new THREE.MeshBasicMaterial({ map: zoneTex(), color: C(color), transparent: true, opacity: .7, depthWrite: false }));
  disc.renderOrder = 2; g.add(disc);
  return { group: g, update(dt, k = 1) { disc.rotation.z -= dt * (.35 + 1.2 * k); disc.material.opacity = .45 + .45 * k; } };
}
