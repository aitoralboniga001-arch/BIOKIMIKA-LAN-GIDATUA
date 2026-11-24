import * as THREE from 'three';

// Tile a high-pass filtered noise field. A deterministic seed keeps rehearsals repeatable.
function noiseTile() {
  const n = 64,
    source = new Float32Array(n * n),
    tile = new Uint8Array(n * n);
  let seed = 7163;
  for (let i = 0; i < source.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    source[i] = seed / 4294967296;
  }
  const at = (x, y) => source[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const local = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.25;
      tile[y * n + x] = THREE.MathUtils.clamp(128 + (at(x, y) - local) * 205, 0, 255);
    }
  const tex = new THREE.DataTexture(tile, n, n, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
export const finishNoise = { value: noiseTile() };
export function finishShader(shader) {
  const source = shader.replace(
    'void main()',
    `uniform sampler2D finishNoise;
    uniform float finishTime;
    void main()`,
  );
  return source.replace(
    /}\s*$/,
    `
    float phase = floor(finishTime * 12.);
    vec2 tile = (gl_FragCoord.xy + vec2(phase * 17.,phase * 31.))/64.;
    float noise = texture2D(finishNoise,tile).r - .5;
    float edge = smoothstep(.34,.70,length(vUv-.5));
    gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(.839,.878,.933),.06*edge) + noise*.012;
  }`,
  );
}
