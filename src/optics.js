import * as THREE from 'three';

// The studio PMREM supplies elongated reflections. The glass transmits the existing scene by alpha blending.
export function glassMat(color) {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.055,
    metalness: 0,
    ior: 1.5,
    envMapIntensity: 0.78,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.forceSinglePass = true;
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float grazing = 1.-abs(dot(normalize(normal),normalize(vViewPosition)));
      float schlick = .04 + .96*pow(grazing,5.);
      float edge = smoothstep(.48,.94,grazing);
      outgoingLight = mix(outgoingLight, diffuse*.53, edge*.7);
      diffuseColor.a = .045 + schlick*.42 + edge*.16;
      #include <opaque_fragment>`,
    );
  };
  return mat;
}
export function liquidMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uB: { value: 0.2 }, uI: { value: 0.42 } },
    vertexShader: `varying vec3 n,v; varying float h; void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.); n=normalMatrix*normal; v=-mv.xyz; h=uv.y; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 n,v; varying float h; uniform float uB,uI; uniform vec3 uC;
      void main(){float facing=abs(dot(normalize(n),normalize(v)));
      float absorption=1.-exp(-max(.02,facing)*1.6);
      float rim=smoothstep(.97,1.,h); float ao=mix(.92,1.,smoothstep(0.,.08,h));
      gl_FragColor=vec4(mix(uC*ao,vec3(1.),rim*.28),clamp(uB+uI*absorption+rim*.16,0.,.94));}`,
    transparent: true,
    depthWrite: false,
  });
}
export function organMat(params) {
  const m = new THREE.MeshPhysicalMaterial(params);
  m.onBeforeCompile = (s) => {
    s.vertexShader =
      'varying vec3 tissueP;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n tissueP=position;',
      );
    s.fragmentShader =
      'varying vec3 tissueP;\n' +
      s.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      float fleck=sin(tissueP.x*8.+sin(tissueP.z*9.))*sin(tissueP.y*7.4+tissueP.z*2.);
      diffuseColor.rgb*=1.+vec3(.06,.045,.035)*fleck;`,
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        vec3 L=directionalLights[0].direction;
        float wrapped=max(0.,(dot(normal,L)+.45)/1.45)-max(0.,dot(normal,L));
        float through=pow(clamp(dot(normalize(vViewPosition),normalize(-L+normal*.35)),0.,1.),3.);
        reflectedLight.directDiffuse += diffuseColor.rgb*(max(0.,wrapped)*.36 + through*vec3(.24,.07,.045));
      #endif`,
        );
  };
  return m;
}
