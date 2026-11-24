// Reusable 3D building blocks: backgrounds, particles, protein blobs, glass, cells, tubes, red cells.
import { THREE, U, envTex, rng, clock, quality } from './core.js';
import { glassMat, liquidMat } from './optics.js';
import { PAL, COL3 } from './theme.js';

export const C = (hex) => new THREE.Color(hex);
// COL = the text-safe palette tokens (same values as the CSS custom properties); COL3 = brighter variants for lit 3D surfaces
export const COL = { ...PAL };
export { COL3 };

// Legacy dark-theme colour arguments (e.g. makeScene({ glow: '#1c2340' })) are turned into a pale tint of the same hue,
// so slides written for the night look still get a light background. Light colours pass through unchanged.
export function lightTint(hex, l = .955, sMax = .55) {
  const c = C(hex), hsl = {}; c.getHSL(hsl);
  if (hsl.l >= .8) return c;
  return new THREE.Color().setHSL(hsl.h, Math.min(sMax, hsl.s), l);
}

// ---------------------------------------------------------------- scene scaffold
// top / bottom: background centre / edge colours (light); glow: tint of the soft light pool at (gx, gy)
export function makeScene({ fov = 35, top = PAL.bg1, bottom = PAL.bg0, glow = '#FFF9F0', gx = .62, gy = .55, dust = 140, dustSpread = 30, envIntensity = 1 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = envTex; scene.environmentIntensity = envIntensity;
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 400);
  const backdrop=bgQuad(top,bottom,glow,gx,gy); scene.add(backdrop);
  // daylight: bright sky / warm bounce, a warm key and a soft cool rim
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcdb89f, .72); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.1); key.position.set(4, 6, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, .75); rim.position.set(-6, 2, -5); scene.add(rim);
  let dustObj = null;
  if (dust) { dustObj = bokeh(dust, dustSpread); scene.add(dustObj.mesh); }
  if(dustObj) {
    const foreground=Array.from({length:3},(_,i)=>{
      const sprite=halo(['#a1b1ce','#d7b697','#a1bfbf'][i],.74,.09);
      scene.add(sprite); return sprite;
    });
    const updateDust=dustObj.update;
    dustObj.update=t=>{
      updateDust(t);
      foreground.forEach((s,i)=>{s.visible=!!quality.level;
        if(s.visible) s.position.set((i===1?1:-1)*(4.3+i*.32)+camera.position.x*.25+Math.sin(t*.17+i)*.08,(i-1)*1.8+camera.position.y*.25,1.1+i*.2);});
    };
  }
  return { scene, camera, key, rim, hemi, backdrop, dust: dustObj };
}

export function bgQuad(top = PAL.bg1, bottom = PAL.bg0, glow = '#FFF9F0', gx = .5, gy = .5) {
  const m = new THREE.ShaderMaterial({
    uniforms: { c0: { value: lightTint(top, .975) }, c1: { value: lightTint(bottom, .925, .3) }, cg: { value: lightTint(glow, .97) }, gp: { value: new THREE.Vector2(gx, gy) }, uT: U.time },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.); }`,
    // warm-white centre -> soft cool edge, a pale light pool at gp, a barely-there vignette; peaks stay < 1 so nothing blooms
    fragmentShader: `varying vec2 vUv; uniform vec3 c0, c1, cg; uniform vec2 gp; uniform float uT;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 q = (vUv - vec2(.5, .56)) * vec2(1.25, 1.);
        vec3 col = mix(c0, c1, smoothstep(.05, .95, length(q)));
        col = mix(col, c1, smoothstep(.55, 0., vUv.y) * .25);
        vec2 d = (vUv - gp) * vec2(1.78, 1.); col = mix(col, cg, exp(-dot(d, d) * 3.) * .6);
        gl_FragColor = vec4(min(col, vec3(.985)), 1.); }`,
    depthTest: false, depthWrite: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false; q.renderOrder = -1000;
  return q;
}

// ---------------------------------------------------------------- particles (round soft points)
export function particleMat({ additive = false, opacity = 1, depthTest = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { pxScale: U.pxScale, uOpacity: { value: opacity } },
    vertexShader: `attribute float size; attribute vec4 col; varying vec4 vC; uniform float pxScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = size * pxScale / max(.001, -mv.z); vC = col; }`,
    fragmentShader: `varying vec4 vC; uniform float uOpacity;
      void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.; if (r > 1.) discard;
        float a = 1. - r * r; a *= a; gl_FragColor = vec4(vC.rgb, vC.a * a * uOpacity); }`,
    transparent: true, depthWrite: false, depthTest, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
export class Pts {
  constructor(n, opts = {}) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.col = new Float32Array(n * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = g; this.mat = particleMat(opts);
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false;
  }
  set(i, x, y, z, s, c, a = 1) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.size[i] = s;
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = a;
  }
  commit() { const a = this.geo.attributes; a.position.needsUpdate = a.size.needsUpdate = a.col.needsUpdate = true; }
}

// drifting out-of-focus specks for depth
export function bokeh(n = 140, spread = 30) {
  const p = new Pts(n); const R = rng(77); const seeds = [];
  // faint grey-blue specks (normal blending) for depth on the light background
  const cols = [C('#8a9bb8'), C('#a9b6cc'), C('#9aa7c4'), C('#b3a99a')];
  for (let i = 0; i < n; i++) seeds.push({ x: (R() - .5) * spread * 1.6, y: (R() - .5) * spread, z: -R() * spread - 2, s: .05 + R() * .22, c: cols[i % 4], a: .04 + R() * .1, ph: R() * 6.28, sp: .1 + R() * .3 });
  const o = { mesh: p.mesh, update(t) {
    for (let i = 0; i < n; i++) { const s = seeds[i];
      p.set(i, s.x + Math.sin(t * s.sp + s.ph) * .6, s.y + Math.cos(t * s.sp * .8 + s.ph) * .5 + Math.sin(t * .05 + s.ph) * .8, s.z, s.s, s.c, s.a * (.7 + .3 * Math.sin(t * .7 + s.ph))); }
    p.commit();
  } };
  o.update(0); return o;
}

// ---------------------------------------------------------------- protein blobs
// blobGeo also bakes a `mol` vec4 attribute used by proteinMat / instancedBlobs:
//   xyz = position / r (scale-free coordinates for the atom micro-relief), w = openness (1 = exposed, lower = crevice / cleft).
// Other materials simply ignore it. Options:
//   cleft: 0..1  depth of an active-site pocket (darker, recessed); 0 = none (default, so non-protein users like the heart are unchanged)
//   cleftDir: [x,y,z] direction of the pocket in object space (default: front, slightly up-right, i.e. towards the camera)
//   cleftSize: angular size of the pocket (default 1)
const blobCache = new Map();
export function blobGeo(seed = 1, r = 1, { lumps = 8, amp = .2, ws = 40, hs = 28, noise = .05, cleft = 0, cleftDir = [.35, .3, 1], cleftSize = 1 } = {}) {
  const key = [seed, r, lumps, amp, ws, hs, noise, cleft, cleftDir.join(','), cleftSize].join('|'); if (blobCache.has(key)) return blobCache.get(key);
  const g = new THREE.SphereGeometry(r, ws, hs); const R = rng(seed * 9301 + 49297);
  const cs = [];
  for (let i = 0; i < lumps; i++) { const d = new THREE.Vector3(R() - .5, R() - .5, R() - .5).normalize(); cs.push({ d, a: amp * (.35 + R()), s: 3 + R() * 7 }); }
  // the pocket: a narrow deep dip with a raised lip around it (two gaussians), so it reads as a cleft and not a dent
  const cd = new THREE.Vector3(...cleftDir).normalize(), cS = 9 / (cleftSize * cleftSize), cA = .3 * cleft;
  // blurred copy of the same field (each bump convolved with a wide kernel) -> (blurred - sharp) = how deep a point sits in a valley
  const KS = 3.2, blur = (a, s) => { const s2 = s * KS / (s + KS); return [a * s2 / s, s2]; };
  const p = g.attributes.position, v = new THREE.Vector3();
  const mol = new Float32Array(p.count * 4); const cav = new Float32Array(p.count); let cmax = 1e-4;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 1 - amp * .45, db = d;
    for (const c of cs) { const x = 1 - v.dot(c.d); d += c.a * Math.exp(-x * c.s); const [ab, sb] = blur(c.a, c.s); db += ab * Math.exp(-x * sb); }
    if (cA > 0) { const x = 1 - v.dot(cd);
      d += -cA * Math.exp(-x * cS * 2.2) + cA * .35 * Math.exp(-x * cS * .7);
      const [a1, s1] = blur(cA, cS * 2.2), [a2, s2] = blur(cA * .35, cS * .7); db += -a1 * Math.exp(-x * s1) + a2 * Math.exp(-x * s2); }
    d += noise * Math.sin(v.x * 9 + seed) * Math.sin(v.y * 11 + seed * .7) * Math.sin(v.z * 8 + seed * 1.3);
    d += noise * .6 * Math.sin(v.x * 23 + v.y * 17) * Math.sin(v.z * 19 - v.x * 7);
    p.setXYZ(i, v.x * r * d, v.y * r * d, v.z * r * d);
    mol[i * 4] = v.x * d; mol[i * 4 + 1] = v.y * d; mol[i * 4 + 2] = v.z * d;
    cav[i] = Math.max(0, db - d); cmax = Math.max(cmax, cav[i]);
  }
  // openness: normalise valley depth against the blob's own relief so small and large blobs shade alike; the cleft goes darkest
  const ref = Math.max(cmax * .9, .05);
  for (let i = 0; i < p.count; i++) { const k = Math.min(1, cav[i] / ref); mol[i * 4 + 3] = 1 - .72 * Math.pow(k, .8); }
  g.setAttribute('mol', new THREE.BufferAttribute(mol, 4));
  g.computeVertexNormals(); fixSphereSeams(g, ws, hs);
  blobCache.set(key, g); return g;
}
export function fixSphereSeams(g, ws, hs) {
  const n = g.attributes.normal; const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let iy = 0; iy <= hs; iy++) {
    const i0 = iy * (ws + 1), i1 = i0 + ws;
    if (iy === 0 || iy === hs) { a.set(0, 0, 0); for (let k = 0; k <= ws; k++) { b.fromBufferAttribute(n, i0 + k); a.add(b); } a.normalize(); for (let k = 0; k <= ws; k++) n.setXYZ(i0 + k, a.x, a.y, a.z); continue; }
    a.fromBufferAttribute(n, i0); b.fromBufferAttribute(n, i1); a.add(b).normalize(); n.setXYZ(i0, a.x, a.y, a.z); n.setXYZ(i1, a.x, a.y, a.z);
  }
  n.needsUpdate = true;
}
// Molecular-surface shading patched into MeshPhysicalMaterial (textbook "space-filling" look, cheap):
//  - atom micro-relief: a 3D cellular pattern on the blob's scale-free coordinates (mol.xyz); each cell is a little sphere cap
//    whose analytic normal tilts the surface normal, with a soft crease between atoms. Fades out when atoms get smaller than
//    a few pixels, so distant crowds never shimmer.
//  - cavity shading from the baked openness (mol.w): darkens valleys and the active-site cleft, mostly in indirect light.
// Geometry without the `mol` attribute reads (0,0,0,1): no relief, no darkening.
const MOL_VERT_PARS = 'attribute vec4 mol; uniform float uMolInvR; varying vec4 vMol; varying vec3 vMolX; varying vec3 vMolY; varying vec3 vMolZ;\n';
const MOL_VERT = `
  vMol = mol;
  if (dot(mol.xyz, mol.xyz) < 1e-8) vMol = vec4(position * uMolInvR, 1.);   // geometry without the attribute: object space / radius
  { mat3 molM = mat3(modelViewMatrix);
  #ifdef USE_INSTANCING
    molM = molM * mat3(instanceMatrix);
  #endif
    vMolX = normalize(molM[0]); vMolY = normalize(molM[1]); vMolZ = normalize(molM[2]); }`;
const MOL_FRAG_PARS = `uniform float uAtoms, uRelief, uCavity; varying vec4 vMol; varying vec3 vMolX; varying vec3 vMolY; varying vec3 vMolZ;
  vec3 molHash3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453); }
  // offset from the nearest atom centre (cell units) and that atom's radius
  vec4 molCell(vec3 q){ vec3 ci = floor(q); vec4 best = vec4(0., 0., 0., 9.); float br = .8;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 c = ci + vec3(float(x), float(y), float(z)); vec3 h = molHash3(c);
      vec3 d = q - (c + .15 + h * .7); float l = dot(d, d);
      if (l < best.w) { best = vec4(d, l); br = .62 + .3 * fract(h.x * 7.13 + h.y * 3.7); } }
    return vec4(best.xyz, br); }
`;
// fragment: after <color_fragment> (diffuseColor known) and after <normal_fragment_maps> (normal known)
const MOL_FRAG_COLOR = `
  vec3 molQ = vMol.xyz * uAtoms; vec4 molC = molCell(molQ);
  float molPx = length(fwidth(molQ));                     // cells per pixel
  float molFade = 1. - smoothstep(.1, .32, molPx);        // atoms < ~4 px: no relief
  float molT = clamp(length(molC.xyz) / molC.w, 0., 1.);  // 0 at atom centre, 1 at its edge
  float molOpen = clamp(vMol.w, 0., 1.);
  float molAO = mix(1., molOpen, uCavity);
  diffuseColor.rgb *= mix(1., .58 + .42 * molOpen, uCavity) * (1. - uRelief * molFade * .3 * smoothstep(.5, 1., molT));`;
const MOL_FRAG_NORMAL = `
  { vec3 dv = vMolX * molC.x + vMolY * molC.y + vMolZ * molC.z;   // view-space offset from the atom centre
    vec3 dt = dv - normal * dot(dv, normal);
    float lt = min(length(dt) / molC.w, .97);
    vec3 nb = normalize(normal * sqrt(1. - lt * lt) + dt / molC.w);
    normal = normalize(mix(normal, nb, uRelief * molFade * .5));
    // a soft darker turn at the silhouette so the shape holds on a near-white background (illustration-style form shadow)
    float molRim = 1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.);
    diffuseColor.rgb *= 1. - .2 * uCavity * molRim * molRim; }`;
const MOL_FRAG_AO = `
  reflectedLight.indirectDiffuse *= molAO; reflectedLight.indirectSpecular *= molAO * molAO;
  reflectedLight.directSpecular *= mix(1., molAO, .6);`;
function molPatch(mat, { atoms = 4.2, relief = 1, cavity = 1, radius = .5, extraFrag = null } = {}) {
  const u = { uAtoms: { value: atoms }, uRelief: { value: relief }, uCavity: { value: cavity }, uMolInvR: { value: 1 / radius } };
  mat.userData.mol = u;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u, {uProjector:U.projector});
    s.vertexShader = MOL_VERT_PARS + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + MOL_VERT);
    let f = "uniform float uProjector;\n" + MOL_FRAG_PARS + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>' + MOL_FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + MOL_FRAG_NORMAL)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + MOL_FRAG_AO)
      .replace('#include <opaque_fragment>', `float contour=pow(1.-clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),2.5);
        outgoingLight*=1.-contour*(.12+.27*uProjector);
        #include <opaque_fragment>`);
    if (extraFrag) f = extraFrag(f, s);
    s.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'mol' + (extraFrag ? '+x' : '');
  return mat;
}
// molAttr(geometry[, r]): bake the `mol` attribute for any geometry so proteinMat can draw atoms on it:
// xyz = (position - centre) / r, w = openness from how far a vertex sits below the mean radius (dents / seams read darker).
export function molAttr(geo, r = 0) {
  const p = geo.attributes.position; if (!p) return geo;
  geo.computeBoundingSphere(); const c = geo.boundingSphere.center; const R = r || geo.boundingSphere.radius || 1;
  const n = p.count, mol = new Float32Array(n * 4), v = new THREE.Vector3(); let mean = 0;
  for (let i = 0; i < n; i++) mean += v.fromBufferAttribute(p, i).sub(c).length(); mean /= Math.max(1, n);
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).sub(c); const l = v.length();
    mol[i * 4] = v.x / R; mol[i * 4 + 1] = v.y / R; mol[i * 4 + 2] = v.z / R;
    mol[i * 4 + 3] = 1 - .55 * Math.min(1, Math.max(0, (mean - l) / (mean * .22))); }
  geo.setAttribute('mol', new THREE.BufferAttribute(mol, 4));
  return geo;
}
// proteinMat(color, { glow, rough, relief, cavity, atoms, radius }) — satin molecular surface; relief/cavity 0..1, atoms = cells per radius.
// radius: only used for geometry without the `mol` attribute (not from blobGeo / molAttr): its approximate object-space radius.
// Tweak later via mat.userData.mol.uRelief.value etc.
export function proteinMat(color, { glow = .06, rough = .62, relief = 1, cavity = 1, atoms = 5.6, radius = .5 } = {}) {
  glow *= .35; // emissive was there to glow in the dark; in daylight it only flattens the shading
  const c = C(color);
  const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, metalness: 0, clearcoat: .12, clearcoatRoughness: .55,
    sheen: .28, sheenRoughness: .75, sheenColor: c.clone().lerp(C('#ffffff'), .5), emissive: c, emissiveIntensity: glow, envMapIntensity: .75 });
  return molPatch(m, { atoms, relief, cavity, radius });
}
// instanced blobs with per-instance colour that also drives a glow term (mat.userData.glow.value).
// cleft: active-site pocket depth for the shared geometry (default modest .45; 0 = none)
export function instancedBlobs(n, { seed = 3, r = .12, glow = .2, lumps = 9, amp = .28, cleft = .45, relief = 1, cavity = 1, atoms = 4.4 } = {}) {
  const geo = blobGeo(seed, r, { lumps, amp, ws: 24, hs: 16, cleft, cleftSize: 1.15 });
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .6, clearcoat: .1, clearcoatRoughness: .55,
    sheen: .22, sheenRoughness: .75, sheenColor: C('#ffffff'), envMapIntensity: .75 });
  mat.userData.glow = { value: glow };
  molPatch(mat, { atoms, relief, cavity, extraFrag: (f, s) => { s.uniforms.uGlow = mat.userData.glow;
    return 'uniform float uGlow;\n' + f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * uGlow * .3;'); } }); // glow scaled down for daylight
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1); for (let i = 0; i < n; i++) m.setColorAt(i, c);
  m.frustumCulled = false; m.count = n;
  return m;
}

// ---------------------------------------------------------------- glass / fresnel
// normal blending by default: a tinted edge whose alpha grows towards grazing angles; additive: true restores the old glow
export function fresnelMat({ color = COL3.glass, power = 2.6, intensity = 1.1, base = .02, opacity = 1, side = THREE.FrontSide, additive = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: C(color) }, uP: { value: power }, uI: { value: intensity }, uB: { value: base }, uOpacity: { value: opacity } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uP, uI, uB, uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), uP); float k = clamp((uB + f * uI) * uOpacity, 0., 1.);
      #ifdef ADDITIVE
        gl_FragColor = vec4(uC * k, k);
      #else
        gl_FragColor = vec4(uC, k);
      #endif
      }`,
    defines: additive ? { ADDITIVE: '' } : {},
    transparent: true, depthWrite: false, side, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// soft radial sprite texture with a bright core (meant for additive glows)
let _glowTex = null;
export function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace; return _glowTex;
}
// gaussian disc with a gentle peak (.6): reads as a soft tinted wash with normal blending on a light background
let _softTex = null;
export function softTex() {
  if (_softTex) return _softTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const dx = (i - 63.5) / 64, dy = (j - 63.5) / 64, r2 = dx * dx + dy * dy;
    const a = r2 >= 1 ? 0 : Math.exp(-r2 * 4.5) * (1 - r2) * .6; const k = (j * 128 + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255); }
  x.putImageData(img, 0, 0); _softTex = new THREE.CanvasTexture(c); _softTex.colorSpace = THREE.SRGBColorSpace; return _softTex;
}
// halo: soft tinted disc (normal blending). Pass { additive: true } for the old light-adding glow.
export function halo(color, size = 1, opacity = .6, { additive = false } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: additive ? glowTex() : softTex(), color: C(color), transparent: true, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}

// contact shadow: a dark radial blot lying flat under an object to ground it on the light "floor".
//   const sh = contactShadow({ size: 2.4, opacity: .22 }); sh.position.set(x, floorY, z); scene.add(sh);
// stretch with sh.scale.set(w, d, 1); fade with sh.material.opacity; { billboard: true } gives a camera-facing sprite.
// Cheap: one transparent quad, no shadow maps.
let _shadowTex = null;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const dx = (i - 63.5) / 64, dy = (j - 63.5) / 64, r2 = dx * dx + dy * dy;
    const a = r2 >= 1 ? 0 : Math.pow(1 - r2, 2.2); const k = (j * 128 + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255); }
  x.putImageData(img, 0, 0); _shadowTex = new THREE.CanvasTexture(c); return _shadowTex;
}
export function contactShadow({ size = 2, opacity = .22, color = '#2a3550', billboard = false } = {}) {
  if (billboard) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex(), color: C(color), transparent: true, opacity, depthWrite: false })); s.scale.setScalar(size); s.renderOrder = -1; return s; }
  const mat = new THREE.MeshBasicMaterial({ map: shadowTex(), color: C(color), transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = -Math.PI / 2; m.scale.set(size, size, 1); m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- glass test tube with a centrifuged blood sample
// returns { group, plasma: {y0,y1,r}, setPlasma(colorHex, k) }
export function bloodTube({ r = .5, h = 3.4, red = .38, cap = '#B98A2E', label = true } = {}) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI / 2; prof.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r + r)); }
  prof.push(new THREE.Vector2(r, h));
  const glassGeo = new THREE.LatheGeometry(prof, 64);
  g.add(new THREE.Mesh(glassGeo,glassMat(COL3.glass)));
  // contents
  const ri = r * .9, yRed = h * red, yTop = h * .8;
  const redProf = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI / 2; redProf.push(new THREE.Vector2(Math.cos(a) * ri + .001, Math.sin(a) * ri + r)); }
  redProf.push(new THREE.Vector2(ri, yRed)); redProf.push(new THREE.Vector2(0.001, yRed));
  const redMesh = new THREE.Mesh(new THREE.LatheGeometry(redProf, 48), new THREE.MeshPhysicalMaterial({ color: C('#8e1426'), roughness: .3, clearcoat: 1, sheen: .5, sheenColor: C('#ff6a78'), emissive: C('#2a040a'), emissiveIntensity: .15, envMapIntensity: .8 }));
  g.add(redMesh);
  const buffy = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, .05, 48), new THREE.MeshStandardMaterial({ color: '#e9e2d4', roughness: .85, envMapIntensity: .6 }));
  buffy.position.y = yRed + .025; g.add(buffy);
  const plasmaGeo = new THREE.CylinderGeometry(ri, ri, yTop - yRed - .05, 48, 1, true);
  const plasmaMat = liquidMat(COL3.plasma);
  const plasma = new THREE.Mesh(plasmaGeo, plasmaMat); plasma.position.y = (yTop + yRed + .05) / 2; g.add(plasma);
  const lip = [1,.96,.88,.72,.001].map(rho => new THREE.Vector2(ri*rho,.047*ri*Math.pow(rho,9)));
  const surf = new THREE.Mesh(new THREE.LatheGeometry(lip,48), new THREE.MeshStandardMaterial({
    color:C(COL3.plasma),roughness:.23,envMapIntensity:.8,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide
  }));
  surf.position.y = yTop; g.add(surf);
  // cap
  const capG = new THREE.Group(); capG.position.y = h - .05;
  const capMat = new THREE.MeshPhysicalMaterial({ color: C(cap), roughness: .55, clearcoat: .4, envMapIntensity: .35 });
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, .62, 48), capMat); c1.position.y = .26; capG.add(c1);
  for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.19, .018, 8, 64), capMat); ring.rotation.x = Math.PI / 2; ring.position.y = .02 + i * .15; capG.add(ring); }
  const c2 = new THREE.Mesh(new THREE.CylinderGeometry(r * .95, r * 1.1, .14, 48), capMat); c2.position.y = .62; capG.add(c2);
  c1.castShadow=true; redMesh.castShadow=true; g.add(capG);
  if (label) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#f4efe6'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#c0392b'; x.fillRect(0, 0, 512, 16);
    // text centred on the label: its ends wrap round the curve and are only seen at a grazing angle
    x.textAlign = 'center';
    x.fillStyle = '#1e2433'; x.font = '600 40px Segoe UI, sans-serif'; x.fillText('B.1 · ENTZIMAK', 256, 78);
    x.font = 'italic 30px Georgia, serif'; x.fillStyle = '#4a5163'; x.fillText('serum · U/L', 256, 122);
    x.textAlign = 'start';
    for (let i = 0; i < 44; i++) { const w = (i * 7 % 5) + 2; x.fillStyle = '#1e2433'; x.fillRect(28 + i * 10, 150, w, 70); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    // printed side only on the outside; seen through the glass from behind, the label shows its plain paper back
    // (a DoubleSide print read mirrored whenever the tube turned its back to the camera)
    const labGeo = new THREE.CylinderGeometry(r * 1.012, r * 1.012, h * .36, 48, 1, true, -Math.PI * .55, Math.PI * .9);
    const lab = new THREE.Mesh(labGeo, new THREE.MeshStandardMaterial({ map: tex, color: '#e4dfd6', roughness: .9, envMapIntensity: .5, side: THREE.FrontSide }));
    lab.add(new THREE.Mesh(labGeo, new THREE.MeshStandardMaterial({ color: '#d9d3c8', roughness: .95, envMapIntensity: .45, side: THREE.BackSide })));
    lab.position.y = h * .45; lab.rotation.y = Math.PI * .35; g.add(lab);
  }
  return { group: g, plasma: { y0: yRed + .1, y1: yTop - .05, r: ri * .82 }, plasmaMat, surf, redMesh };
}

// ---------------------------------------------------------------- red blood cell (biconcave disc)
export function rbcGeo(r = .5, N = 28, segments = 40) {
  const pts = [];
  const prof = x => .5 * Math.sqrt(Math.max(0, 1 - x * x)) * (.207 + 2.003 * x * x - 1.123 * x ** 4);
  const xs = i => Math.sin(i / N * Math.PI / 2); // denser samples near the rim
  for (let i = 0; i <= N; i++) { const x = xs(i); pts.push(new THREE.Vector2(x * r + .0001, -(prof(x) * 1.4 + .02) * r)); }
  for (let i = N; i >= 0; i--) { const x = xs(i); pts.push(new THREE.Vector2(x * r + .0001, (prof(x) * 1.4 + .02) * r)); }
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals(); return g;
}
export function rbcMat() { return new THREE.MeshPhysicalMaterial({ color: C('#c8243c'), roughness: .4, clearcoat: .6, sheen: .7, sheenColor: C('#ff8090'), emissive: C('#3a0610'), emissiveIntensity: .12, envMapIntensity: .7 }); }

// ---------------------------------------------------------------- a living cell: membrane with pores and a shatter mode
export function membraneMat({ color = COL3.membrane, fill = COL3.cyto, additive = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: C(color) }, uF: { value: C(fill) }, uPore: { value: 0 }, uShatter: { value: 0 }, uTime: U.time, uOpacity: { value: 1 }, uR: { value: 1 } },
    // The breathing wobble is a function of the vertex direction only, so neighbouring triangles (non-indexed geometry) stay
    // welded: no hairline cracks / overlaps (those read as a wire-mesh moire). The shatter path only runs when uShatter > 0.
    vertexShader: `attribute vec3 cen; attribute float rnd; uniform float uShatter, uTime, uR;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vR;
      void main(){
        vec3 n0 = normalize(position);
        float w = sin(dot(n0, vec3(3.1, 2.3, 1.7)) * 3. + uTime * 1.3) * .012 + sin(dot(n0, vec3(-1.3, 2.9, .7)) * 5. - uTime * .9) * .008;
        vec3 p = position + n0 * w * uR;
        if (uShatter > 0.) {
          vec3 dir = normalize(cen);
          float s = uShatter * (.55 + rnd * .9);
          p = cen + (p - cen) * (1. - .45 * clamp(uShatter * 1.4, 0., 1.));
          p += dir * s * uR * 1.5 + vec3(0., -s * s * uR * .6, 0.);
          float an = s * (rnd - .5) * 6.;
          vec3 q = p - cen * (1. + s * 1.5); // rotate a little around its own centre
          p = cen * (1. + s * 1.5) + vec3(q.x * cos(an) - q.y * sin(an), q.x * sin(an) + q.y * cos(an), q.z) + vec3(0., -s * s * uR * .6, 0.);
        }
        vP = position / uR; vR = rnd;
        vN = normalize(normalMatrix * mix(n0, normal, clamp(uShatter * 3., 0., 1.))); vec4 mv = modelViewMatrix * vec4(p, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC, uF; uniform float uPore, uShatter, uOpacity, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vR;
      float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        // round pores (cellular pattern): a hole with a bright rim reads as an opening in the membrane
        vec3 q = vP * 3.2; vec3 ci = floor(q); float dm = 9.;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
          vec3 c = ci + vec3(float(x), float(y), float(z));
          vec3 o = vec3(hash(c), hash(c + 17.31), hash(c + 41.7)) * .8 + .1;
          dm = min(dm, length(q - c - o)); }
        float rad = uPore * .3;
        if (dm < rad) discard;
        float edge = (1. - smoothstep(rad, rad + .07, dm)) * step(.01, uPore);
        float f = pow(1. - clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.2);
        float fade = uOpacity * (1. - smoothstep(.6, 1., uShatter));
      #ifdef ADDITIVE
        vec3 col = uC * (f * 1.25 + .06) + uF * .05 + vec3(1., .9, .6) * edge * .9;
        float a = (f * 1.15 + .08 + edge) * fade;
        gl_FragColor = vec4(col * a, a);
      #else
        // daylight lipid bilayer: a smooth, faintly mottled translucent body; a clean coral rim at the silhouette with a thin
        // second line just inside it (the two leaflets); pore lips are darker so the openings read.
        vec3 N = normalize(vN); float ndv = clamp(abs(dot(N, normalize(vV))), 0., 1.);
        float rim = pow(1. - ndv, 4.5);
        float mot = noise(vP * 3.1 + vec3(0., 0., uTime * .04)) * .65 + noise(vP * 7.3 - vec3(uTime * .03)) * .35;
        float fq = length(fwidth(vP * 22.));
        float grain = (noise(vP * 22.) - .5) * (1. - smoothstep(.2, .6, fq));
        float lw = max(.03, fwidth(ndv) * 1.2);
        float leaf = exp(-pow((ndv - .24) / lw, 2.));
        float lit = .84 + .16 * clamp(dot(N, normalize(vec3(.4, .7, .6))), 0., 1.);
        vec3 body = mix(uF, vec3(1.), .5);
        vec3 col = mix(body, uC, smoothstep(.0, .6, rim)) * lit * (.95 + .08 * mot + .06 * grain);
        col += vec3(.024,.056,.062) * rim * (.55+.45*mot);
        col = mix(col, uC * .85, leaf * .6);
        col = mix(col, uC * .62, edge * .85);
        float a = clamp(.07 + .07 * mot + rim * 1.05 + leaf * .3 + edge * .8, 0., 1.) * fade;
        gl_FragColor = vec4(col, a);
      #endif
      }`,
    defines: additive ? { ADDITIVE: '' } : {},
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
export function membraneGeo(R = 1, detail = 22) {
  const g = new THREE.IcosahedronGeometry(R, detail); // non-indexed: each triangle owns its 3 vertices
  const p = g.attributes.position; const n = p.count; const cen = new Float32Array(n * 3), rnd = new Float32Array(n);
  const R2 = rng(5);
  for (let i = 0; i < n; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const r = R2();
    for (let k = 0; k < 3; k++) { cen[(i + k) * 3] = cx; cen[(i + k) * 3 + 1] = cy; cen[(i + k) * 3 + 2] = cz; rnd[i + k] = r; }
  }
  g.setAttribute('cen', new THREE.BufferAttribute(cen, 3)); g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  return g;
}

// mitochondrion: capsule with glowing cristae
export function mito(color = COL3.gold) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.16, .42, 8, 20), new THREE.MeshPhysicalMaterial({ color: C(color), roughness: .5, clearcoat: .5, transparent: true, opacity: .7, emissive: C(color), emissiveIntensity: .06, depthWrite: false }));
  g.add(body);
  for (let i = 0; i < 5; i++) { const cr = new THREE.Mesh(new THREE.TorusGeometry(.1, .016, 6, 18, Math.PI), new THREE.MeshBasicMaterial({ color: C(color) })); cr.position.y = -.24 + i * .12; cr.rotation.z = Math.PI / 2 * (i % 2 ? 1 : -1); cr.rotation.y = Math.PI / 2; g.add(cr); }
  body.rotation.z = 0; g.rotation.z = Math.PI / 2;
  return g;
}

// simple glass vessel (beaker / cylinder) with an optional drain
// `color` tints the glass; light (night-theme) tints are pulled down to a slate edge colour that reads on near-white
export function glassCylinder({ r = 1, h = 2, color = COL3.glass, bottom = true } = {}) {
  const g = new THREE.Group();
  const side = new THREE.CylinderGeometry(r, r, h, 64, 1, true);
  const ec = glassEdge(color);
  g.add(new THREE.Mesh(side,glassMat(ec)));
  const rimG = new THREE.TorusGeometry(r, .02, 8, 64); const rimM = new THREE.MeshBasicMaterial({ color: ec, transparent: true, opacity: .55 });
  const top = new THREE.Mesh(rimG, rimM); top.rotation.x = Math.PI / 2; top.position.y = h / 2; g.add(top);
  if (bottom) { const b = new THREE.Mesh(rimG, rimM); b.rotation.x = Math.PI / 2; b.position.y = -h / 2; g.add(b);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color: ec, transparent: true, opacity: .06, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = -h / 2; g.add(disc); }
  return g;
}

function glassEdge(color) {
  const c = C(color), hsl = {}; c.getHSL(hsl);
  return hsl.l > .5 ? new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, .3), .45) : c;
}

// line helper: polyline from points (normal blending; { additive: true } for the old glow)
export function polyline(points, color, opacity = 1, { additive = false } = {}) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: C(color), transparent: true, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
}

export { clock };
