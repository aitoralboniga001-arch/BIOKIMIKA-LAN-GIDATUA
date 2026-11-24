// 0 · Title — a centrifuged blood sample on a light lab bench; a loupe magnifies its plasma, where enzymes turn substrate into
// product, and every turnover is written onto a live activity trace (measurement -> diagnosis). Beat 2 dives into the loupe.
import { THREE, Tw, add, ease, clamp, clock, renderer, U, screenOf } from '../core.js';
import { makeScene, bloodTube, C, halo, contactShadow } from '../lib3d.js';
import { TEXT_HALO, PAL } from '../theme.js';
import { makeMicro, MCOL } from './s00_micro.js';
import { el } from '../chart.js';
import { makeTrace, TRACE } from './s00_trace.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LOUPE_R = 1.3, DIVE_D = 2.15; // loupe radius (world) and how many screen heights it fills when the view switches to the micro scene

const CSS = `
[data-slide="title"] .cvT { position:absolute; left:120px; top:286px; width:1040px; }
[data-slide="title"] .cvT .eb { display:flex; align-items:center; gap:18px; font:600 22px/1 var(--sans); letter-spacing:.24em; color:var(--mute); text-transform:uppercase; }
[data-slide="title"] .cvT .eb i { display:block; width:46px; height:2px; background:var(--amber); }
[data-slide="title"] .cvT .eb b { color:var(--amber); font-weight:600; }
[data-slide="title"] .cvT h1 { margin:40px 0 0; font:400 92px/1.04 var(--serif); letter-spacing:-1.6px; color:var(--ink); }
[data-slide="title"] .cvT h1 em { font-style:italic; color:var(--amber); letter-spacing:-1px; }
[data-slide="title"] .cvT .ln { display:block; overflow:hidden; padding:0 0 .12em; margin-bottom:-.12em; }
[data-slide="title"] .cvT .ln > span { display:inline-block; transform:translateY(108%); transition:transform 1.15s cubic-bezier(.2,.85,.15,1); }
[data-slide="title"] .cvT.on .ln > span { transform:none; }
[data-slide="title"] .cvT.on .ln.l1 > span { transition-delay:.35s; } [data-slide="title"] .cvT.on .ln.l2 > span { transition-delay:.5s; }
[data-slide="title"] .cvT .cvsub { margin-top:34px; font:400 33px/1.35 var(--sans); color:var(--ink2); }
[data-slide="title"] .cvT .rule { width:72px; height:1.5px; margin:52px 0 26px; background:rgba(20,32,51,.22); transform-origin:0 50%; }
[data-slide="title"] .cvT .names { font:500 23px/1.55 var(--sans); color:var(--ink2); letter-spacing:.2px; }
[data-slide="title"] .cvT .names span { color:var(--amber); margin:0 9px; }
[data-slide="title"] .cvT .eb, [data-slide="title"] .cvT .cvsub, [data-slide="title"] .cvT .rule, [data-slide="title"] .cvT .names { opacity:0; transform:translateY(14px); transition:opacity .9s, transform 1s cubic-bezier(.2,.8,.2,1); }
[data-slide="title"] .cvT.on .eb { opacity:1; transform:none; transition-delay:.2s; }
[data-slide="title"] .cvT.on .cvsub { opacity:1; transform:none; transition-delay:.8s; }
[data-slide="title"] .cvT.on .rule { opacity:1; transform:none; transition-delay:1.05s; }
[data-slide="title"] .cvT.on .names { opacity:1; transform:none; transition-delay:1.2s; }
[data-slide="title"] .cvT:not(.on) * { transition-delay:0s !important; }
[data-slide="title"] .cv-tag { position:absolute; left:0; top:0; will-change:transform; white-space:nowrap; }
[data-slide="title"] .cv-plasma { font:500 22px/1 var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--ink2); text-shadow:var(--halo); }
[data-slide="title"] .cv-plasma::after { content:''; position:absolute; left:calc(100% + 12px); top:50%; width:40px; height:1px; background:rgba(20,32,51,.35); }
[data-slide="title"] .cv-leg { font:500 22px/1 var(--sans); color:var(--ink2); display:flex; gap:20px; align-items:center; text-shadow:var(--halo); }
[data-slide="title"] .cv-leg i { display:inline-block; width:12px; height:12px; border-radius:50%; margin-right:8px; vertical-align:-1px; box-shadow:0 0 0 2px rgba(255,255,255,.9); }
[data-slide="title"] .cv-leg .ar { color:var(--mute); margin:0 -6px; }
[data-slide="title"] .cv-read { position:absolute; right:0; top:-34px; display:flex; align-items:baseline; gap:10px; font:600 22px/1 var(--sans); letter-spacing:.14em; text-transform:uppercase; color:var(--mute); }
[data-slide="title"] .cv-read b { font:500 24px/1 var(--mono); letter-spacing:0; color:var(--ink); min-width:26px; text-align:right; }
[data-slide="title"] .cv-read .sep { color:var(--amber); }
[data-slide="title"] .cv-read .u { letter-spacing:1px; }
[data-slide="title"] .cv-read .sch { margin-left:4px; font:italic 400 22px/1 var(--serif); letter-spacing:.3px; text-transform:none; color:var(--mute); }
`;

// the loupe's glass: the micro view with a gentle magnifier distortion, an inner rim shadow and a glint (all fade out for the dive)
function discMat(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uFx: { value: 1 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy / ${LOUPE_R.toFixed(3)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uFx; varying vec2 vP;
      void main(){
        float r = length(vP);
        vec2 s = vP * (1. + uFx * .1 * (r * r - 1.));
        vec3 col = texture2D(uMap, s * .5 + .5).rgb;
        col *= 1. - uFx * (.2 * smoothstep(.8, 1., r) + .05 * smoothstep(.3, 1., r));
        float g = smoothstep(.62, .96, r) * smoothstep(.35, .95, dot(normalize(vP + 1e-4), normalize(vec2(-.62, .78))));
        col = mix(col, vec3(1.), uFx * g * .38);
        col += uFx * .035 * smoothstep(.2, -.9, vP.x - vP.y);
        gl_FragColor = vec4(col, 1. - smoothstep(.994, 1., r)); }`,
    transparent: true, depthWrite: false,
  });
}
function rimMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uO: { value: 1 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy / ${LOUPE_R.toFixed(3)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uO; varying vec2 vP;
      void main(){
        float r = length(vP), t = clamp((r - 1.) / .06, 0., 1.);
        float l = dot(normalize(vP), normalize(vec2(-.6, .8)));
        float prof = sin(t * 3.14159);
        vec3 dark = vec3(.30, .36, .47), lite = vec3(.97, .98, 1.);
        vec3 col = mix(dark, lite, clamp(.45 + .45 * l * (1. - 2. * t) + .35 * prof, 0., 1.));
        float a = (.55 + .45 * prof) * smoothstep(0., .08, t) * (1. - smoothstep(.9, 1., t));
        a = max(a, (1. - smoothstep(0., .12, t)) * .7);
        gl_FragColor = vec4(col, a * uO); }`,
    transparent: true, depthWrite: false,
  });
}

export default {
  id: 'title', chapter: -1, beats: 2, title: 'Izenburua', bloom: .6,
  // bridge to slide 2: keep diving into the plasma the loupe opened (the enzymes there become the plasma enzymes of slide 2)
  bridge: { mode: 'dive', focus() { return this.dive.v > .5 ? this.camera.getWorldDirection(_bf).multiplyScalar(2.6).add(this.camera.position) : this.loupe.getWorldPosition(_bf); } },
  build(layer) {
    const S = makeScene({ fov: 30, glow: '#FFF3E0', gx: .7, gy: .52, dust: 110 });
    this.main = S.scene; this.mainCam = S.camera; this.S = S;
    this.scene = this.main; this.camera = this.mainCam;
    const scene = this.main;

    // ---- the sample on the bench
    const pivot = new THREE.Group(); pivot.position.set(2.2, -2.45, 0); scene.add(pivot); this.pivot = pivot;
    const tube = bloodTube({}); tube.group.scale.setScalar(1.2); pivot.add(tube.group); this.tube = tube;
    tube.plasmaMat.uniforms.uB.value = .34; tube.plasmaMat.uniforms.uC.value.set(C('#E6AE34')); // a richer straw-yellow serum layer
    const back = halo('#F6DDB0', 7.5, .3); back.position.set(.1, 2.6, -2); pivot.add(back);
    const sh1 = contactShadow({ size: 1, opacity: .16 }); sh1.scale.set(3.2, 1.3, 1); sh1.position.set(.25, .004, .05); pivot.add(sh1);
    const sh2 = contactShadow({ size: 1, opacity: .32 }); sh2.scale.set(1.45, .55, 1); sh2.position.set(.05, .006, 0); pivot.add(sh2);
    this.sh = [sh1, sh2];
    // a barely-there bench surface: a cool tint that fades out radially, so the tube stands on something without a hard horizon
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `varying vec2 vUv; void main(){ vec2 q = (vUv - vec2(.5, .55)) * vec2(1., 2.); float a = exp(-dot(q, q) * 5.) * .1; gl_FragColor = vec4(.56, .63, .74, a); }`,
      transparent: true, depthWrite: false }));
    bench.rotation.x = -Math.PI / 2; bench.position.set(-.5, -.002, 1); bench.renderOrder = -2; pivot.add(bench);
    
    // ---- the loupe: the micro scene is rendered into a small target and shown on a glass disc
    this.micro = makeMicro({ onEvent: (i) => { if (i<8 && this.signals && this.dive.v<.01) { const pulse=this.signals.find(p=>p.start===null); if(pulse)pulse.start=clock.t; } } }); // only turnovers visible in the loupe drive the trace
    const rtOpt = { type: THREE.HalfFloatType, samples: 4, depthBuffer: true };
    this.rtLo = new THREE.WebGLRenderTarget(576,576,{...rtOpt,samples:0});
    const loupe = new THREE.Group(); scene.add(loupe); this.loupe = loupe;
    this.Lc = V(4.72, .62, .9);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(LOUPE_R, 128), discMat(this.rtLo.texture)); this.disc.renderOrder = 5; loupe.add(this.disc);
    this.rim = new THREE.Mesh(new THREE.RingGeometry(LOUPE_R * .995, LOUPE_R * 1.06, 160, 1), rimMat()); this.rim.renderOrder = 6; loupe.add(this.rim);
    const lsh = contactShadow({ size: LOUPE_R * 2.7, opacity: .2, billboard: true }); lsh.position.set(.12, -.28, -.3); loupe.add(lsh); this.lsh = lsh;
    // marker on the tube + two tangent leader lines to the loupe (textbook inset)
    // aimed at the strip of plasma left visible between the paper label (top at 0.63·h) and the meniscus
    const plasmaVis = (tube.plasma.y1 + 3.4 * .63) / 2;
    this.Mc = V(pivot.position.x, pivot.position.y + plasmaVis * 1.2, .62); this.Mr = .2;
    const ink = C(PAL.ink);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(this.Mr - .018, this.Mr, 64), new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: .6, depthWrite: false }));
    this.marker.position.copy(this.Mc); this.marker.renderOrder = 4; scene.add(this.marker);
    const lg = new THREE.BufferGeometry(); this.leadPos = new Float32Array(12); lg.setAttribute('position', new THREE.BufferAttribute(this.leadPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lead = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: .5, depthWrite: false })); this.lead.frustumCulled = false; this.lead.renderOrder = 4; scene.add(this.lead);

    // ---- camera shots
    this.P0 = V(.15, .5, 14); this.L0 = V(.15, .02, 0);
    this.dive = new Tw(0); this.intro = { t0: -99 };
    this.tmp = V(0, 0, 0); this.tmp2 = V(0, 0, 0); this.lc = V(0, 0, 0); this.cur = V(0, 0, 0);
    this.fEnd = 40; this.FP1 = V(.12,.03,2.5); this.FL1 = V(.12,.03,-3);
    this.warmExtra = [[this.micro.scene, this.micro.rtCam]]; // the engine warms these too (the loupe / dive world)

    // ---- DOM
    add(layer, `<style>${CSS}</style>`);
    add(layer, `<div class="cvT fx fade" data-b="-0">
      <div class="eb"><i></i>Oinarrizko Biokimika <b>/</b> B.1 atala</div>
      <h1><span class="ln l1"><span>Entzimen neurketaren</span></span><span class="ln l2"><span><em>balioa</em> diagnostikoan</span></span></h1>
      <div class="cvsub">Entzima plasmatikoak egoera fisiologiko eta patologikoetan</div>
      <div class="rule"></div>
      <div class="names">Eneritz Baranda<span>·</span>Urtzi Castillo<span>·</span>Ane Hormaetxe<span>·</span>Nora Navascues<span>·</span>Aitor Alboniga</div>
    </div>`);
    this.plasmaTag = add(layer, `<div class="cv-tag pin fx fade d4" data-b="-0"><div class="cv-plasma" style="position:absolute;transform:translate(-100%,-50%)">plasma</div></div>`);
    this.legTag = add(layer, `<div class="cv-tag pin fx fade d6" data-b="-0"><div class="cv-leg" style="position:absolute;transform:translate(-50%,0)">
      <span><i style="background:${MCOL.enz}"></i>entzima</span><span><i style="background:${PAL.teal}"></i>substratua</span><span class="ar">→</span><span><i style="background:${PAL.pink}"></i>produktua</span></div></div>`);
    this.trace = makeTrace(layer); this.trace.el.dataset.b='0-0'; this.trace.el.classList.add('fx','fade');
    const guide=el('svg',{width:1920,height:1080,'aria-hidden':true,style:'position:absolute;inset:0;pointer-events:none'});
    guide.dataset.b='0-0'; guide.classList.add('fx','fade'); layer.appendChild(guide);
    this.signalGuide=el('path',{fill:'none',stroke:PAL.amber,'stroke-width':1.3,opacity:.22},guide);
    this.signals=Array.from({length:10},()=>({start:null,node:el('circle',{r:4,fill:PAL.amber,opacity:0},guide)}));
    add(layer, `<div class="key c fx pop d3" data-b="1" style="top:390px;bottom:auto;font-size:80px;padding:60px 0;text-shadow:${TEXT_HALO};background:transparent">Zer kontatzen digu<br><em>odol-lagin batek?</em><div style="font:500 32px/1.3 var(--sans);color:var(--ink2);margin-top:30px;letter-spacing:.3px">Odoleko entzimen jarduera <span style="color:var(--amber)">→</span> ehunen egoera</div></div>`);
  },
  enter(b) {
    this.dive.set(b >= 1 ? 1 : 0);
    if (b >= 1) { this.intro.t0 = -99; this.trace.skip(); } else { this.intro.t0 = clock.t; this.trace.intro(1.7); }
  },
  beat(b) { this.dive.to(b >= 1 ? 1 : 0, 3, ease.io); },
  update(dt, t) {
    const k = this.dive.v, it = t - this.intro.t0;
    this.micro.update(dt,t,k);
    this.trace.update(dt, t);

    // ---- intro choreography: tube settles, marker appears, loupe grows out of it, leader lines follow
    const arrival=clamp((it-.1)/1.25), tk=ease.spring(arrival);
    this.tube.surf.rotation.z=Math.sin(arrival*3*Math.PI)*(1-arrival)*.14;
    this.pivot.position.y = -2.45 + (1 - tk) * .5;
    this.tube.group.rotation.y = -1.0 + (1 - tk) * .5 + Math.sin(t * .22) * .14;
    this.sh[0].material.opacity = .16 * tk; this.sh[1].material.opacity = .32 * tk * tk;
    const mk = clamp((it - 1.0) / .5);
    const lk = clamp((it - 1.25) / 1.2), lke = ease.back(lk);
    const ls = Math.max(.05, lke), lr = LOUPE_R * ls;
    this.lc.lerpVectors(this.Mc, this.Lc, ease.out(lk)); this.lc.y += Math.sin(t * .6) * .035 * lk;
    this.loupe.position.copy(this.lc); this.loupe.scale.setScalar(ls); this.loupe.visible = lk > 0;
    const my = this.Mc.y + (1 - tk) * .5;
    this.marker.position.y = my;
    this.marker.material.opacity = .6 * mk * (1 - clamp(k * 4));

    // ---- camera: idle drift, then (beat 2) a straight flight into the loupe
    // distance shrinks geometrically, so the apparent zoom rate is steady and matches the micro camera's at the hand-over
    const dd = LOUPE_R / (DIVE_D * Math.tan(THREE.MathUtils.degToRad(15)));
    this.tmp.set(this.lc.x, this.lc.y, this.lc.z + dd);
    const d0 = this.P0.distanceTo(this.lc), a = clamp(k / .5), w = (d0 - d0 * Math.pow(dd / d0, a)) / (d0 - dd);
    const cam = this.mainCam;
    cam.position.lerpVectors(this.P0, this.tmp, w);
    cam.position.x += Math.sin(t * .2) * .1 * (1 - w); cam.position.y += Math.sin(t * .27) * .07 * (1 - w);
    this.cur.lerpVectors(this.L0, this.lc, w); cam.lookAt(this.cur);
    if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
    this.loupe.quaternion.copy(cam.quaternion);
    // leader lines: outer tangents between the marker circle and the loupe rim (in the view plane)
    const P = this.leadPos, mx = this.Mc.x, cx = this.lc.x, cy = this.lc.y, R2 = lr * 1.06, R1 = this.Mr;
    const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy);
    if (d > R2 - R1 + .02 && lk > 0) {
      const th = Math.atan2(dy, dx), be = Math.acos(clamp((R1 - R2) / d, -1, 1));
      for (let s = 0; s < 2; s++) {
        const an = th + (s ? be : -be), ca = Math.cos(an), sa = Math.sin(an);
        P[s * 6] = mx + R1 * ca; P[s * 6 + 1] = my + R1 * sa; P[s * 6 + 2] = this.Mc.z;
        P[s * 6 + 3] = cx + R2 * ca; P[s * 6 + 4] = cy + R2 * sa; P[s * 6 + 5] = this.lc.z - .05;
      }
      this.lead.visible = true; this.lead.geometry.attributes.position.needsUpdate = true;
    } else this.lead.visible = false;
    this.lead.material.opacity = .5 * clamp(lk * 2) * (1 - clamp(k * 4));
    this.lsh.material.opacity = .2 * lk * (1 - clamp(k * 3));
    this.rim.material.uniforms.uO.value = 1 - clamp((k - .3) / .15);
    this.disc.material.uniforms.uFx.value = 1 - clamp((k - .2) / .26);

    // ---- which world is on screen: the bench (+ loupe rendered into a small target) or, deep in the dive, the plasma itself
    if (k <= .5) {
      const rt = this.rtLo;
      this.disc.material.uniforms.uMap.value = rt.texture;
      if (this.loupe.visible) {
        const prev = renderer.getRenderTarget(), ps = U.pxScale.value;
        U.pxScale.value = rt.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.micro.rtCam.fov) / 2));
        renderer.setRenderTarget(rt); renderer.render(this.micro.scene, this.micro.rtCam); renderer.setRenderTarget(prev);
        U.pxScale.value = ps;
      }
      this.scene = this.main; this.camera = cam;
    } else {
      // continue the same zoom with the micro camera: start exactly where the loupe image filled the screen, then glide in
      const v = clamp((k - .5) / .5), u = 1 - (1 - v) ** 2.5, uf = v ** 2.5, fc = this.micro.fullCam, rc = this.micro.rtCam;
      const f0 = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(rc.fov / 2)) / DIVE_D));
      fc.position.lerpVectors(rc.position, this.FP1, u);
      fc.position.x += Math.sin(t * .2) * .06 * u; fc.position.y += Math.sin(t * .27) * .04 * u;
      this.tmp2.set(0, 0, 0).lerp(this.FL1, u); fc.lookAt(this.tmp2);
      fc.fov = f0 + (this.fEnd - f0) * uf; fc.updateProjectionMatrix(); // dolly leads, the lens widens late: the zoom rate carries on across the hand-over
      this.scene = this.micro.scene; this.camera = fc;
    }
    this.S.dust.update(t);

    // ---- DOM tags that follow 3D anchors
    const pp = screenOf(this.tmp.set(this.Mc.x - .62, my, this.Mc.z), cam);
    this.plasmaTag.style.transform = `translate(${(pp.x - 52).toFixed(1)}px,${pp.y.toFixed(1)}px)`;
    const lp = screenOf(this.tmp.set(this.lc.x, this.lc.y - lr * 1.06 - .2, this.lc.z), cam);
    const gx=lp.x+72, gy=lp.y+44, ex=TRACE.x+TRACE.w-8, ey=TRACE.y+TRACE.h-8;
    this.signalGuide.setAttribute('d',`M${gx} ${gy} Q${ex} ${gy} ${ex} ${ey}`);
    this.signalGuide.style.opacity=.22*lk*(1-clamp(k*5));
    for(const pulse of this.signals){
      if(pulse.start===null)continue;
      const u=clamp((t-pulse.start)/.67), v=1-u;
      if(u>=1||k>.01){if(k<=.01)this.trace.pulse();pulse.node.setAttribute('opacity',0);pulse.start=null;continue;}
      pulse.node.setAttribute('cx',v*v*gx+(1-v*v)*ex);pulse.node.setAttribute('cy',(1-u*u)*gy+u*u*ey);
      pulse.node.setAttribute('opacity',.85*lk*Math.sin(Math.PI*u));
    }
    this.legTag.style.transform = `translate(${lp.x.toFixed(1)}px,${lp.y.toFixed(1)}px)`;
    this.legTag.firstElementChild.style.opacity = clamp((lk - .8) / .2).toFixed(3); this.plasmaTag.firstElementChild.style.opacity = mk.toFixed(3);
  },
};
