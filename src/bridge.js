// Bridges: the WebGL transition compositor between slides.
// While a bridge runs, both slides stay alive: each frame the outgoing slide is updated and drawn into its own target
// (no bloom, a bit under full resolution), the incoming slide goes through the normal composer (bloom, no output pass),
// and one full-screen shader blends the two, then applies the same tone mapping + sRGB as OutputPass.
//
// Modes (a slide declares how it leaves: `bridge: { mode, focus() }`, and where it lands: `bridgeIn: { focus() }`):
//   dive  — match cut: the outgoing camera dollies toward its focus (plus a radial zoom blur), the incoming one starts
//           magnified around its own focus and settles; a soft organic iris with a thin refractive glass rim and a
//           gentle chromatic fringe opens from one focus to the other.
//   flow  — a noise-shaped plasma front sweeps the new scene in along a direction, with a glassy meniscus.
//   cells — the old picture breaks into soft cell patches that shrink and pop, in a wave from the focus.
//   fade  — a quick crossfade (going back, jumps).
// focus() is called with the slide as `this` and returns a world-space THREE.Vector3 (projected with the slide's camera)
// or a screen point { x, y } in 0..1 (DOM orientation, y down).
import { THREE, W, H, renderer, composer, renderPass, outputPass, bloom, fxaa, quality, U, clamp, smooth, ease, warmScene } from './core.js';
import { FullScreenQuad } from '../vendor/three/addons/postprocessing/Pass.js';
import { CHAPTERS } from './slides/index.js';
import { CHAPTER_TINT } from './theme.js';

import { finishNoise, finishShader } from './finish.js';

// Spoken handoffs follow the order of the talk and sit below all scientific figures.
const QUESTIONS = {
  title: 'Zer neurtzen du laborategiak odol-laginean?',
  measure: 'Zerk aldatzen du odoleko entzima-jarduera?',
  release: 'Noiz da aldaketa hori markatzaile erabilgarria?',
  marker: 'Zein ehunetatik etor daiteke neurtutako entzima?',
  tissues: 'Jarduera bera izateak lesio bera adierazten al du?',
  intensity: 'Zer aldatzen da lagina beste une batean hartuz gero?',
  kinetics: 'Amilasak eta lipasak denbora-patroi bera al dute?',
  pancreas: 'Denboraz gain, zer esaten digu forma molekularrak?',
  ck: 'Bi azpiunitatetik laura pasatzean, zenbat forma sor daitezke?',
  ldh: 'Nola bereizten dira LDHren bost formak lagin batean?',
  electro: 'Eta infartu batean: noiz igotzen dira CK eta LDH?',
  infarct: 'Zein lau galderak ematen diote esanahia emaitzari?',
  end: 'Zein iturritan oinarritu dira azalpenak eta 3D egiturak?'
};

const MODE = { fade: 0, dive: 1, flow: 2, cells: 3, drop: 4, lenses: 5, register: 6 };
const DUR = { fade: .45, dive: 1.45, flow: 1.35, cells: 1.5, drop: 1.7, lenses: 1.8, register: 1.55 };
const CHAPTER_DUR = 2.35;   // chapter bridges are a little longer: the title card needs a beat to be read
const A_SCALE = [.5, .56];  // outgoing target resolution vs the canvas, per quality level

const VERT = `precision highp float;
uniform mat4 modelViewMatrix, projectionMatrix; attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const FRAG = `precision highp float;
uniform sampler2D tA, tB;
uniform float uP, uMode, uT, uAsp, uHi, uVeil, uZA, uZB, uBlur, uCells;
uniform vec2 uFA, uFB, uDir;
uniform vec3 uPaper, uTint;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), u.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
vec2 cl(vec2 uv){ return clamp(uv, vec2(.0005), vec2(.9995)); }

// outgoing picture: zoomed about its focus, with a radial zoom blur toward it (tap count halves in light mode)
vec3 sampA(vec2 uv){
  vec2 q = uFA + (uv - uFA) / uZA;
  vec3 c = texture2D(tA,cl(q)).rgb; float n = 1.;
  if (uBlur >= .001)
  for (int i = 1; i < 5; i++){ float k = float(i) / 4.; if (uHi < .5 && mod(float(i), 2.) > .5) continue;
    c += texture2D(tA, cl(uFA + (q - uFA) * (1. - uBlur * k))).rgb; n += 1.; }
  return c / n;
}
// incoming picture: shifted so its focus sits under 'at', and gently magnified around it
vec3 sampB(vec2 uv, vec2 at){ return texture2D(tB, cl(uFB + (uv - at) / uZB)).rgb; }
// a refracted, chromatically split read of the incoming picture across a glass edge (normal n, strength s)
vec3 glassB(vec2 uv, vec2 at, vec2 n, float s){
  vec3 c = sampB(uv - n * s, at);
  if (uHi >= .5) c = vec3(sampB(uv - n * s * 1.25, at).r, sampB(uv - n * s, at).g, sampB(uv - n * s * .75, at).b);
  return c;
}

void main(){
  vec2 uv = vUv, asp = vec2(uAsp, 1.);
  float p = uP;
  vec3 col;
  if (uMode < .5) {                                           // ---- fade
    col = mix(sampA(uv), sampB(uv, uFB), smoothstep(0., 1., p));
  } else if (uMode > 5.5) {
    // Anchor-to-anchor match: the shared specimen travels to its new composition.
    // Soften the background first, then exchange the specimen at registration.
    float move = smoothstep(0.,1.,p);
    vec2 centre = mix(uFA,uFB,move);
    vec2 delta = (uv-centre)*asp;
    float peripheral = smoothstep(.05,.47,length(delta));
    float handover = smoothstep(.32,.73,p + .15*peripheral);
    vec2 from = uFA+(uv-centre)/uZA, to = uFB+(uv-centre)/uZB;
    // Rigid registration preserves the geometry of the tissues and the tubes.
    // Extend each field's own background at the margin as the images travel.
    vec3 old = texture2D(tA, cl(from)).rgb;
    vec3 fresh = texture2D(tB, cl(to)).rgb;
    col = mix(old,fresh,handover);
  } else if (uMode > 4.5) {
    // Two optical fields briefly magnify the incoming fold; their rims meet
    // and retreat to reveal the full set of five isoenzymes.
    float arrival = smoothstep(.12, .72, p);
    vec2 centre = mix(uFA, uFB, arrival);
    vec2 xy = (uv - centre) * asp;
    float offset = mix(.19, 0., smoothstep(.25, .74, p));
    vec2 left = xy + vec2(offset, 0.), right = xy - vec2(offset, 0.);
    float blend = smoothstep(-.055, .055, xy.x);
    vec2 local = mix(left, right, blend);
    float radius = mix(-.024, .23, smoothstep(.02, .40, p)) + 1.82 * smoothstep(.42, 1., p);
    float edge = mix(length(left), length(right), blend) - radius;
    vec2 normal = local / max(length(local), .001) / asp;
    float rim = exp(-abs(edge) * 100.) * smoothstep(.02, .16, p) * (1. - smoothstep(.75, .97, p));
    vec2 refracted = uv - local / asp * (.30 * (1. - arrival));
    vec3 fresh = glassB(refracted, centre, normal, rim * .018);
    col = mix(sampA(uv + normal * rim * .009), fresh, 1. - smoothstep(-.007, .007, edge));
    float glint = pow(max(0., dot(normalize(local + vec2(.00001)), vec2(-.6, .8))), 3.);
    col = mix(col, mix(uTint, vec3(1.), .72), rim * (.22 + .60 * glint));
  } else if (uMode > 3.5) {
    // Match the sample to the well. A travelling bead becomes a spreading meniscus.
    float fly=smoothstep(.08,.58,p), impact=smoothstep(.48,1.,p);
    vec2 centre=mix(uFA,uFB,fly);
    centre.y+=.18*sin(fly*3.14159);
    vec2 d=(uv-centre)*asp;
    float squash=sin(3.14159*smoothstep(.45,.72,p));
    vec2 profile=vec2(1.+.72*squash,1.-.33*squash);
    vec2 ellipse=d/profile;
    float radius=.078*smoothstep(0.,.13,p)+2.4*impact*impact;
    float r=length(ellipse),edge=r-radius;
    vec2 normal=ellipse/max(r,.0001);
    float live=smoothstep(0.,.12,p)*(1.-smoothstep(.77,.98,p));
    float rim=exp(-abs(edge)*77.)*live;
    float ripple=exp(-abs(edge-.064)*70.)*sin(impact*3.14159)*.45;
    float mask=(1.-smoothstep(-.004,.004,edge))*smoothstep(0.,.08,p);
    vec3 old=sampA(uv-normal*ripple*.017);
    vec2 lens=uFB+(uv-centre)*mix(.58,1.,impact)-normal*rim*.027;
    vec3 fresh=sampB(lens,uFB);
    col=mix(old,fresh,mask);
    col=mix(col,col*vec3(.68,.73,.86),rim*.46+ripple*.25);
    col+=vec3(.62,.75,.78)*rim*pow(max(dot(normal,vec2(-.5,.866)),0.),4.)*.53;
  } else if (uMode < 1.5) {                                   // ---- dive: organic iris with a glass rim
    vec2 c = mix(uFA, uFB, smoothstep(.12, .8, p));
    vec2 d = (uv - c) * asp; float r = length(d); vec2 n = d / max(r, 1e-4);
    vec2 far = max(c, 1. - c) * asp; float maxR = length(far) * 1.08;
    float ip = smoothstep(0., .88, p);
    float wob = (fbm(n * 1.7 + vec2(uT * .35, -uT * .2)) - .5) * .16 * (1. - ip * .6);
    float R = maxR * ip * (1. + wob);
    float e = r - R;                                          // < 0: inside the iris (new scene)
    float w = mix(.05, .02, ip) * smoothstep(0., .08, R);     // glass rim width
    float band = clamp((e + w) / max(w,.0001), 0., 1.) * step(e, 0.);    // 0 .. 1 across the rim, inside edge
    float lens = sin(band * 3.14159);
    vec3 a = sampA(uv);
    vec3 b = band > 0. ? glassB(uv, c, n, lens * .022 * (uHi > .5 ? 1. : .6)) : sampB(uv, c);
    float m = 1. - smoothstep(-.0025, .0025, e);
    // the rim: a bright specular arc toward the key light, a soft inner shade, a faint occlusion on the old scene
    float spec = pow(max(dot(n, normalize(vec2(-.55, .83))), 0.), 5.) * lens;
    b = b * (1. - .1 * lens) + vec3(1., .99, .97) * spec * .72 + uTint * lens * .06;
    float occ = exp(-max(e, 0.) / .035) * (1. - m) * .16 * smoothstep(.0, .2, ip) * (1. - smoothstep(.75, 1., ip));
    a *= 1. - occ;
    col = mix(a, b, m);
    // a crisp hairline where the glass meets the old scene (reads as an edge on a light background), lit on one side
    float live = smoothstep(.0, .06, ip) * (1. - smoothstep(.9, 1., ip));
    float hair = exp(-e * e / 2.2e-6) * live;
    float lit = .5 + .5 * dot(n, normalize(vec2(-.55, .83)));
    col = mix(col, mix(vec3(.16, .2, .28), vec3(1.), lit * lit), hair * .55);
  } else if (uMode < 2.5) {                                   // ---- flow: a plasma front
    vec2 dir = normalize(uDir), per = vec2(-dir.y, dir.x);
    vec2 q = (uv - .5) * asp;
    float span = abs(dir.x) * uAsp * .5 + abs(dir.y) * .5;
    float s = dot(q, dir) / span;                             // -1 .. 1 across the frame along dir
    float nz = fbm(uv * asp * 2.3 - dir * uT * .5 + vec2(0., uT * .07)) - .5;
    float f = mix(-1.45, 1.45, p * p * (3. - 2. * p));
    float g = s + nz * .7 - f;                                // < 0: the front has passed (new scene)
    vec2 n2 = normalize(dir + per * nz * 1.4);                // local direction of the wavy front
    float crest = exp(-g*g/.017);
    float rear = exp(-pow((g+.19+ .04*sin(uv.y*18.+uT))/.24,2.));
    vec2 bend = n2*(.060*crest-.030*rear) + per*.022*sin(uv.y*15.+p*9.)*rear;
    vec3 old = texture2D(tA,cl(uv+bend)).rgb;
    vec3 fresh = glassB(uv-bend*.42,uFB,n2,crest*.032);
    col = mix(old,fresh,1.-smoothstep(-.18,.15,g));
    vec3 plasma = mix(vec3(.58,.31,.105),uTint,.60);
    col *= mix(vec3(1.),plasma,.42*rear+.23*crest);
    // a smooth caustic sheen riding the crest (low frequency, no grain)
    float sheen = crest * crest * (.45 + .55 * fbm(uv * asp * 5.2 - dir * uT * 1.1 + per * 3.));
    col += (.05 * rear + .16 * sheen) * vec3(1., .95, .84);
    // sparse, soft foam bubbles in the crest band: anti-aliased discs on a jittered lattice that drift with the front
    vec2 fq = (uv * asp - dir * (f * .35 + uT * .05)) * 34.;
    vec2 fi = floor(fq), ff = fract(fq);
    float foam = 0.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)), id = fi + o;
      float hh = h21(mod(id, 97.) + 3.7);
      vec2 cc = o + .5 + (vec2(hh, h21(mod(id, 89.) + 9.2)) - .5) * .6;
      float rr = .1 + .16 * hh, dd = length(ff - cc);
      foam = max(foam, step(.7, hh) * (smoothstep(rr, rr - .06, dd) - .55 * smoothstep(rr - .05, rr - .12, dd)));
    }
    col = mix(col, vec3(1., .985, .95), foam * smoothstep(.35, .9, crest) * .55);
  } else {
    // Soft cells that bud and merge (a smooth union of compact kernels, like coalescing droplets). Each kernel's
    // support stays below 1.15 tiles and centres move at most .3 of a tile, so the 3x3 search always sees every
    // contributing cell: no tile seams. Cells open in a wave from the focus.
    float sc = uCells * .58;
    vec2 grid = uv * asp * sc, tile = floor(grid), local = fract(grid);
    vec2 fgrid = uFA * asp * sc;
    float field = 0.; vec2 grad = vec2(0.);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 off = vec2(float(i), float(j)), id = tile + off;
      float h = h21(id + .14);
      vec2 center = off + .5 + (vec2(h, h21(id + 8.1)) - .5) * .6;
      float wave = length(tile + center - fgrid) / (sc * 1.9);         // 0 at the focus .. ~1 at the far corner
      float g = smoothstep(.0, 1., clamp((p - .55 * wave - .12 * h) / .5, 0., 1.));
      float R = 1.12 * g * (.82 + .18 * h);
      vec2 v = local - center;
      float r = length(v);
      float q = 1. - r * r / max(R * R, 1e-4);
      if (q > 0.) { field += q * q; grad += -4. * q * v / max(R * R, 1e-4); }
    }
    field = mix(field, 1.5, smoothstep(.86, 1., p));
    float e = field - .5;                                               // > 0: inside a cell (new scene)
    float windowB = smoothstep(-.035, .035, e);
    float live = smoothstep(.02, .15, p) * (1. - smoothstep(.8, .97, p));
    float rim = exp(-e * e / .0018) * live;                             // the membrane, a thin band around the edge
    vec2 n = grad / max(length(grad), 1e-3);
    float inner = smoothstep(0., .35, e) * (1. - smoothstep(.35, .9, e));
    vec2 bend = n * (.022 * inner + .01 * rim) / sc * 6.;               // lens-like refraction just inside each cell
    vec3 fresh = uHi > .5 ? glassB(uv, uFB, -n, .012 * inner * live) : sampB(uv + bend, uFB);
    vec3 old = sampA(uv - n * .004 * rim);
    col = mix(old, fresh, windowB);
    float lit = .5 + .5 * dot(n, normalize(vec2(-.55, .83)));
    col = mix(col, mix(vec3(1.), uTint, .28), rim * (.35 + .4 * lit));  // light membrane, lit toward the key light
    col *= 1. - .06 * rim * (1. - lit);
  }
  // chapter interstitial: a soft paper veil behind the title card
  float vy = (uv.y - .52) / .34; col = mix(col, uPaper, uVeil * exp(-vy * vy * vy * vy) * .9);
  gl_FragColor = vec4(col, 1.);
  #ifdef NEUTRAL_TONE_MAPPING
  gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
  #endif
  gl_FragColor = sRGBTransferOETF(gl_FragColor);
}`;

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _sv = new THREE.Vector3();

export class Bridge {
  constructor(stage) {
    this.stage = stage;
    this.question = document.createElement('div');
    this.question.className = 'bridge-question';
    this.question.hidden = true;
    stage.appendChild(this.question);
    this.questionEnd = 0;
    this.rtA = null; this.samples = -1; this.bw = 1; this.bh = 1; this.pr = 1;
    this.mat = new THREE.RawShaderMaterial({
      uniforms: {
        tA: { value: null }, tB: { value: null }, uP: { value: 0 }, uMode: { value: 0 }, uT: { value: 0 }, uAsp: { value: W / H }, uHi: { value: 1 },
        uVeil: { value: 0 }, uZA: { value: 1 }, uZB: { value: 1 }, uBlur: { value: 0 }, uCells: { value: 6.5 },
        uFA: { value: new THREE.Vector2(.5, .5) }, uFB: { value: new THREE.Vector2(.5, .5) }, uDir: { value: new THREE.Vector2(1, 0) },
        finishNoise, finishTime: U.time, uPaper: { value: new THREE.Color('#FBF9F5') }, uTint: { value: new THREE.Color('#E6AE34') }, toneMappingExposure: { value: 1 },
      },
      defines: { NEUTRAL_TONE_MAPPING: '' },
      vertexShader: VERT, fragmentShader: finishShader(FRAG), depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.active = null;
    // chapter title card (DOM, driven per frame from the bridge clock)
    this.card = document.createElement('div'); this.card.id = 'chapcard';
    this.card.innerHTML = '<div class="cc-num"><span></span></div><div class="cc-rule"></div><div class="cc-name"><span></span></div><div class="cc-dots"></div>';
    stage.insertBefore(this.card, document.getElementById('chrome'));
    this.cNum = this.card.querySelector('.cc-num span'); this.cName = this.card.querySelector('.cc-name span');
    this.cRule = this.card.querySelector('.cc-rule'); this.cDots = this.card.querySelector('.cc-dots');
    this.cDots.innerHTML = CHAPTERS.map(() => '<i></i>').join('');
  }
  clearQuestion() {
    this.question.hidden = true;
    this.stage.classList.remove('has-bridge-question');
    this.questionEnd = 0;
  }
  updateQuestion(t) {
    if (!this.questionEnd) return;
    const opacity = smooth(clamp((t-this.questionStart)/.2)) * smooth(clamp((this.questionEnd-t)/.38));
    this.question.style.opacity = opacity.toFixed(3);
    if (t >= this.questionEnd) this.clearQuestion();
  }
  setSize(pr) {
    if (this.active) this.active.outgoingCaptured = false;
    this.pr = pr;
    const s = new THREE.Vector2(); renderer.getDrawingBufferSize(s); this.bw = s.x; this.bh = s.y;
    const sc = A_SCALE[quality.level ? 1 : 0], samples = quality.level ? Math.min(4,renderer.capabilities.maxSamples) : 0;
    const w = Math.max(2, Math.round(s.x * sc)), h = Math.max(2, Math.round(s.y * sc));
    if (!this.rtA || this.samples !== samples) {
      if (this.rtA) this.rtA.dispose();
      this.rtA = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples }); this.samples = samples;
    } else this.rtA.setSize(w, h);
  }
  // compile the compositor and the composer's no-output path once at boot
  warm() {
    this.mat.uniforms.tA.value = this.rtA.texture; this.mat.uniforms.tB.value = this.rtA.texture;
    const prev=renderer.getRenderTarget(); this.composite(true); this.composite(false); renderer.setRenderTarget(prev);
  }

  warmOutgoing(s) {
    if (!this.rtA) return;
    const prev = renderer.getRenderTarget(), ca = s.camera;
    U.pxScale.value = this.rtA.height / (2 * Math.tan(THREE.MathUtils.degToRad(ca.fov) / 2));
    renderer.setRenderTarget(this.rtA); renderer.clear(); renderer.render(s.scene, ca);   // as it is now ...
    warmScene(s.scene, ca, false, this.rtA);                                                  // ... and with every object shown
    renderer.setRenderTarget(prev);
  }

  composite(high) {
    // Q filters the combined picture, including the outgoing geometry and the refracted edge.
    if(high){renderer.setRenderTarget(null);this.quad.render(renderer);return;}
    const scratch=composer.writeBuffer;
    renderer.setRenderTarget(scratch);this.quad.render(renderer);
    const previous=fxaa.renderToScreen;fxaa.renderToScreen=true;
    fxaa.render(renderer,null,scratch);fxaa.renderToScreen=previous;
  }

  // from/to: slide objects. opts: { forward, chapter (index or -1), onReveal }
  start(from, to, { forward, chapter = -1, onReveal }, t) {
    const decl = forward ? (from.bridge || { mode: 'dive' }) : { mode: 'fade' };
    const mode = MODE[decl.mode] != null ? decl.mode : 'fade';
    this.mat.uniforms.uTint.value.set(CHAPTER_TINT[to.chapter] || '#d6a956');
    const dur = chapter >= 0 ? CHAPTER_DUR : DUR[mode] * (decl.speed || 1);
    this.clearQuestion();
    if (forward && QUESTIONS[from.id]) {
      this.question.textContent = QUESTIONS[from.id];
      this.questionStart = t;
      this.questionEnd = t + dur + 2.4;
      this.question.style.opacity = 0;
      this.question.hidden = false;
      this.stage.classList.add('has-bridge-question');
    }
    this.active = { from, to, mode, decl, dur, t0: t, p: 0, chapter, onReveal, revealed: false,
      reveal: chapter >= 0 ? .84 : mode === 'fade' ? .3 : mode === 'dive' ? .58 : .5, fa: { uv: new THREE.Vector2(.5, .5), px: [W / 2, H / 2] }, fb: { uv: new THREE.Vector2(.5, .5), px: [W / 2, H / 2] },
      wa: new THREE.Vector3(), wb: new THREE.Vector3(), dir: new THREE.Vector2(...(decl.dir || [1, 0])).normalize() };
    for (const l of [from.layer, to.layer]) { l.style.transition = 'none'; l.style.willChange = 'opacity, transform'; }
    to.layer.style.opacity = 0;
    if (chapter >= 0) {
      this.card.classList.toggle("registered", mode === "register");
      this.cNum.textContent = String(chapter + 1).padStart(2, '0');
      const words = CHAPTERS[chapter].split(' ');
      const last = document.createElement('em');
      last.textContent = words.pop();
      this.cName.replaceChildren(words.length ? words.join(' ') + ' ' : '', last);
      [...this.cDots.children].forEach((d, i) => d.classList.toggle('on', i <= chapter));
      this.card.style.display = 'block';
    }
  }
  // finish now: the incoming slide takes over the normal render path from the next frame on
  finish(reveal = true) {
    const A = this.active; if (!A) return; this.active = null;
    if (reveal && !A.revealed && A.onReveal) A.onReveal();
    for (const l of [A.from.layer, A.to.layer]) { l.style.transition = ''; l.style.opacity = ''; l.style.transform = ''; l.style.transformOrigin = ''; l.style.willChange = ''; }
    A.from.layer.style.visibility='hidden'; A.from.layer.classList.remove('out');
    this.card.style.display = 'none';
    A.from.exit && A.from.exit();
  }

  // where a slide's focus is: world point (for the camera dolly) + screen position (uv for the shader, px for the DOM)
  focus(slide, spec, outW, outF) {
    const cam = slide.camera; cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    let f = spec && spec.focus ? spec.focus.call(slide) : null;
    if (!f) f = { x: .5, y: .5 };
    if (f.isVector3) {
      outW.copy(f); _v.copy(f).project(cam);
      outF.uv.set(clamp((_v.x + 1) / 2, .02, .98), clamp((_v.y + 1) / 2, .02, .98));
    } else {
      outF.uv.set(f.x, 1 - f.y);
      // a point on that view ray, as far away as the camera's own target distance (or 6 units)
      _v.set(f.x * 2 - 1, 1 - f.y * 2, .5).unproject(cam); _d.copy(_v).sub(cam.position).normalize();
      outW.copy(cam.position).addScaledVector(_d, f.depth || 6);
    }
    outF.px[0] = outF.uv.x * W; outF.px[1] = (1 - outF.uv.y) * H;
  }

  // one bridge frame: update both slides, render both, composite to the canvas, move the DOM layers
  frame(dt, t, draw = true) {
    const A = this.active, { from, to, mode } = A;
    const p = A.p = clamp((t - A.t0) / A.dur);
    // Registration moves the image in screen space. Keep the outgoing cell in its
    // last pose while the live release mechanism takes over on the other side.
    const holdOutgoing = mode === 'register' || mode === 'fade' || (mode === 'dive' && p >= .9);
    const drawOutgoing = !holdOutgoing || !A.outgoingCaptured;
    if (drawOutgoing && from.update) from.update(dt, t);
    to.update && to.update(dt, t);
    if (!draw) {
      // Offline seeking advances the simulation and typography for every step.
      // Only the requested display frame needs textures or camera composites.
      if (!A.revealed && p >= A.reveal) { A.revealed = true; A.onReveal?.(); }
      if (p >= 1) this.finish();
      return;
    }
    this.focus(from, A.decl, A.wa, A.fa);
    this.focus(to, to.bridgeIn, A.wb, A.fb);
    const hi = quality.level ? 1 : 0, u = this.mat.uniforms;

    // camera dollies along the view ray through the focus (so the focus stays put on screen while everything grows)
    let da = 0, db = 0, za = 1, zb = 1, blur = 0;
    if (mode === 'dive') {
      const k = clamp(p / .86); da = .8 * k * k; db = .62 * (1 - smooth(clamp((p - .08) / .92)));
      za = 1 + .25 * k * k; zb = 1 + .18 * (1 - ease.out(p)); blur = hi ? .07 * k : .04 * k;
    } else if (mode === 'register') {
      const ratio = A.decl.scaleRatio || 1;
      za = Math.pow(ratio, smooth(p));
      zb = za / ratio;
    } else if (mode === 'drop') { da=.36*smooth(clamp(p/.6)); db=.32*(1-smooth(clamp((p-.40)/.60))); }
    else if (mode === 'flow') { da = .18 * ease.in(p); db = .14 * (1 - ease.out(p)); }
    else if (mode === 'cells') { da = .1 * p; db = .16 * (1 - ease.out(p)); zb = 1 + .05 * (1 - p); }

    // ---- outgoing: plain render into its own target (no bloom: it is moving and dissolving)
    if (drawOutgoing) {
      const ca = from.camera; _sv.copy(ca.position); ca.position.lerp(A.wa, da); ca.updateMatrixWorld();
      U.pxScale.value = this.rtA.height / (2 * Math.tan(THREE.MathUtils.degToRad(ca.fov) / 2));
      renderer.setRenderTarget(this.rtA); renderer.clear(); renderer.render(from.scene, ca);
      ca.position.copy(_sv); ca.updateMatrixWorld();
      A.outgoingCaptured = true;
    }
    // ---- incoming: the normal composer path (bloom), stopping before the output pass
    const cb = to.camera; _sv.copy(cb.position); cb.position.lerp(A.wb, db); cb.updateMatrixWorld();
    U.pxScale.value = (H * this.pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cb.fov) / 2));
    renderPass.scene = to.scene; renderPass.camera = cb;
    composer.renderToScreen = false; outputPass.enabled = false;
    const bloomState = bloom.enabled, aaState=fxaa.enabled; bloom.enabled = false; fxaa.enabled=false;
    composer.render(dt);
    bloom.enabled = bloomState; fxaa.enabled=aaState;
    composer.renderToScreen = true; outputPass.enabled = true;
    cb.position.copy(_sv); cb.updateMatrixWorld();

    // ---- composite
    u.tA.value = this.rtA.texture; u.tB.value = composer.readBuffer.texture;
    u.uP.value = p; u.uMode.value = MODE[mode]; u.uT.value = t; u.uHi.value = hi;
    u.uZA.value = za; u.uZB.value = zb; u.uBlur.value = blur; u.uFA.value.copy(A.fa.uv); u.uFB.value.copy(A.fb.uv); u.uDir.value.copy(A.dir);
    u.uCells.value = A.decl.cells || 6.5; u.toneMappingExposure.value = renderer.toneMappingExposure;
    u.uVeil.value = A.chapter >= 0 && mode !== "register" ? smooth(clamp((p - .13) / .17)) * (1 - smooth(clamp((p - .73) / .13))) : 0;
    this.composite(hi);

    this.layers(A, p);
    if (A.chapter >= 0) this.chapterCard(p);
    if (p >= 1) this.finish();
  }

  // HTML in step with the picture: the old text leaves toward its focus (never readable doubled), the new text is
  // revealed with the usual staggered .fx entrance once the bridge settles
  layers(A, p) {
    const fl = A.from.layer.style, tl = A.to.layer.style, m = A.mode;
    fl.opacity = (1 - smooth(clamp(p / (m === 'fade' ? .45 : .2)))).toFixed(3);
    if (m === 'dive') { fl.transformOrigin = `${A.fa.px[0].toFixed(0)}px ${A.fa.px[1].toFixed(0)}px`; fl.transform = `scale(${(1 + .4 * ease.out(clamp(p / .25))).toFixed(4)})`; }
    else if (m === 'flow') fl.transform = `translate(${(A.dir.x * 110 * ease.out(clamp(p / .25))).toFixed(1)}px, ${(-A.dir.y * 110 * ease.out(clamp(p / .25))).toFixed(1)}px)`;
    else if (m === 'cells') { fl.transformOrigin = `${A.fa.px[0].toFixed(0)}px ${A.fa.px[1].toFixed(0)}px`; fl.transform = `scale(${(1 - .04 * clamp(p / .2)).toFixed(4)})`; }
    const r = A.reveal, k = smooth(clamp((p - r) / (1 - r) * 1.6));
    tl.opacity = k.toFixed(3);
    if (m === 'dive') { tl.transformOrigin = `${A.fb.px[0].toFixed(0)}px ${A.fb.px[1].toFixed(0)}px`; tl.transform = `scale(${(1 + .05 * (1 - k)).toFixed(4)})`; }
    if (!A.revealed && p >= r) { A.revealed = true; A.onReveal && A.onReveal(); }
  }

  // chapter card: number + rule + name sweep in, hold, and sweep out to the left while the new scene settles
  chapterCard(p) {
    const enter = ease.out(clamp((p - .17) / .20));
    const leave = smooth(clamp((p - .74) / .12));
    const title = ease.out(clamp((p - .20) / .23));
    this.card.style.opacity = (enter * (1 - leave)).toFixed(3);
    this.cNum.style.transform = `translateY(${18 * (1 - enter) - 12 * leave}%)`;
    this.cName.style.transform = `translateY(${98 * (1 - title) - 16 * leave}%)`;
    this.cRule.style.transform = `scaleY(${enter * (1 - leave)})`;
    this.cDots.style.opacity = title;
  }
}
