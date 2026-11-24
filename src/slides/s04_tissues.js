// 4 · Tissue specificity: a glass body with stylised organs; each enzyme lights the tissues it comes from (table 1)
// and its molecules stream from those organs through the circulation into a blood sample tube ("where it comes from → what we measure").
import { organMat } from '../optics.js';
import { THREE, Tw, add, rng, clamp, Label } from '../core.js';
import { makeScene, C, COL, COL3, halo, contactShadow, bloodTube, instancedBlobs, Pts } from '../lib3d.js';
import { CamRig, V } from '../rig.js';
import { bodyGeo, organs, vesselPaths, JUNCTION, EXIT } from './s04_tissues_anatomy.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const ENZ = [
  { k: 'ALT', name: 'alanina aminotransferasa', c: COL.gold, c3: COL3.gold, org: ['liver'], src: 'Gibela', use: 'Gibeleko zelulen lesioa susmatzea' },
  { k: 'CK', name: 'kreatina kinasa', c: COL.coral, c3: COL3.coral, org: ['muscle', 'heart', 'brain'], src: 'Muskuluak, miokardioa eta garuna', use: 'CK osoa: muskulu-lesioa susmatzea. CK-MB: miokardioari buruzko informazio gehigarria' },
  { k: 'AST', name: 'aspartato aminotransferasa', c: COL.orange, c3: COL3.orange, org: ['liver', 'heart', 'muscle'], src: 'Gibela, miokardioa, muskuluak eta beste ehun batzuk', use: 'Gibeleko edo muskuluetako kaltea aztertzen lagun dezake' },
  { k: 'LDH', name: 'laktato deshidrogenasa', c: COL.blue, c3: COL3.blue, org: ['rbc', 'liver', 'muscle', 'heart', 'brain', 'lungs', 'kidney', 'pancreas'], src: 'Ehun asko, eritrozitoak barne', use: 'Ehun-kaltearen adierazle orokorra; jatorria zehazteko gaitasun mugatua' },
  { k: 'ALP', name: 'fosfatasa alkalinoa', c: COL.mint, c3: COL3.mint, org: ['bone', 'liver', 'placenta'], src: 'Hezurra, gibela eta plazenta (haurdunaldian)', use: 'Hezur-jarduera edo gibel- eta behazun-alterazioak aztertzea' },
  { k: 'GGT', name: 'gamma-glutamiltransferasa', c: COL.lav, c3: COL3.lav, org: ['liver', 'bile'], src: 'Gibela eta behazun-sistema', use: 'Kolestasia aztertzen laguntzea' },
  { k: 'Amilasa · lipasa', name: '', c: COL.teal, c3: COL3.teal, org: ['pancreas', 'saliva'], src: 'Pankrea · amilasa: listu-guruinak ere bai', use: 'Pankreatitis akutua aztertzen laguntzen dute' },
];
const AMY = 6;                                  // the amylase · lipase beat (index in ENZ)
const ORG_NAME = { liver: 'Gibela', muscle: 'Hezur-muskuluak', heart: 'Miokardioa', brain: 'Garuna', bone: 'Hezurra', placenta: 'Plazenta<small>haurdunaldian</small>', rbc: 'Eritrozitoak', bile: 'Behazun-sistema', pancreas: 'Pankrea', saliva: 'Listu-guruinak', lungs: 'Birikak', kidney: 'Giltzurrunak' };
const LDH_LABELS = ['rbc', 'liver', 'heart', 'muscle', 'brain', 'lungs', 'kidney'];
const HIDDEN = ['placenta', 'rbc'];             // shown only in the beats that light them
// leader-line offsets (px) for labels that would collide in a beat: { beat index: { organ: [dx, dy] } }
const LEAD = { 6: { liver: [-34, -34], bile: [-34, 36] } };
const DIM = C('#D6DEEA');
const TX = 1.3, FLOOR = -1.77, TS = .27;          // sample tube: x, floor, scale
const NB = 46, NP = 320, SPEED = 1.05, RATE = 11; // tube blobs, molecule pool, molecule speed (u/s), molecules/s per source organ

// glass body: fresnel edge + a slow scan band (normal blending, light background)
function glassMat(side, k) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: C('#5D7A9E') }, uScan: { value: 0 }, uK: { value: k } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uScan, uK; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(1. - clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.4);
        float band = exp(-pow((vY - uScan) * 10., 2.));
        float a = (.095 + f * .74 + band * .07) * uK;
        vec3 col = mix(mix(uC, vec3(1.), .12), uC * .85, f);
        gl_FragColor = vec4(col, clamp(a, 0., 1.)); }`,
    transparent: true, depthWrite: false, side,
  });
}

export default {
  id: 'tissues', chapter: 1, beats: 8, title: 'Entzimen ehun-espezifikotasuna', bloom: .5,
  bridgeIn: { focus() { return this.root.localToWorld(_bf.set(0, .05, 0)); } },
  // dive into the liver: the next slide is a piece of injured tissue
  bridge: { mode: 'dive', focus() { const m = this.O.liver.mesh, g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return m.localToWorld(_bf.copy(g.boundingSphere.center)); } },
  build(layer) {
    const S = makeScene({ glow: '#EEF4FB', gx: .45, gy: .5, dust: 80 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.shot = [V(.42, .23, 7.8), V(.42, .2, 0), 38]; // framed so the tube ends above the y = 970 safe line
    this.rig = new CamRig(this.camera, this.shot[0], this.shot[1], { fov: 38, drift: .025 });
    const root = new THREE.Group(); this.scene.add(root); this.root = root;

    // ---- glass body
    const bg = bodyGeo(); bg.userData.lowGeometry=bodyGeo(.051);
    this.glassF = glassMat(THREE.FrontSide, 1); this.glassB = glassMat(THREE.BackSide, .45);
    const bB = new THREE.Mesh(bg, this.glassB); bB.renderOrder = 8; root.add(bB);
    const bF = new THREE.Mesh(bg, this.glassF); bF.renderOrder = 10; root.add(bF);
    const floorSh = contactShadow({ size: 1, opacity: .2 }); floorSh.scale.set(.85, .32, 1); floorSh.position.set(0, FLOOR, .05); root.add(floorSh);

    // ---- organs
    this.O = {}; this.cAmb = C(COL3.amber); this.eCol = C(COL3.blue);
    const O = organs();
    for (const k in O) {
      const o = O[k], nat = C(o.color);
      const mat = organMat({ color: nat.clone(), roughness: .42, clearcoat: .6, clearcoatRoughness: .3, sheen: .4, sheenRoughness: .5, sheenColor: C('#ffffff'),
        emissive: nat.clone(), emissiveIntensity: 0, envMapIntensity: .8, transparent: true, opacity: .92 });
      const mesh = new THREE.Mesh(o.geo, mat); mesh.castShadow=['liver','heart','bone'].includes(k); mesh.renderOrder = 1; root.add(mesh);
      // surface samples near each site: molecules start there
      const p = o.geo.attributes.position, R = rng(k.length * 31 + 7);
      const sites = o.sites.map(s => {
        const near = []; for (let i = 0; i < p.count; i += 3) { const v = V(p.getX(i), p.getY(i), p.getZ(i)); if (v.distanceTo(s.c) < .16) near.push(v); }
        const pts = []; for (let i = 0; i < 36 && near.length; i++) pts.push(near[Math.floor(R() * near.length)]);
        const h = halo(COL3.gold, .34, 0); h.position.copy(s.c); h.renderOrder = 2; root.add(h);
        return { ...s, pts: pts.length ? pts : [s.c], halo: h, route: this.route(s) };
      });
      this.O[k] = { mesh, mat, nat, sites, col: nat.clone(), target: nat.clone(), op: new Tw(HIDDEN.includes(k) ? 0 : .92), em: new Tw(0), acc: 0, on: false };
    }
    for (const k of HIDDEN) this.O[k].mesh.visible = false;
    // vessels (venous return + the sampled arm) and the tubing from the arm to the tube
    const vMat = new THREE.MeshStandardMaterial({ color: C('#C7596A'), roughness: .5, transparent: true, opacity: .42, depthWrite: false, envMapIntensity: .6 });
    for (const path of vesselPaths()) { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, false, 'centripetal'), 64, path.length > 5 ? .011 : .013, 8, false), vMat); m.renderOrder = 3; root.add(m); }
    this.vMat = vMat;
    const tubing = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(this.outPts(), false, 'centripetal'), 80, .014, 10, false),
      new THREE.MeshPhysicalMaterial({ color: C('#B84A5C'), roughness: .25, clearcoat: 1, transparent: true, opacity: .55, depthWrite: false, envMapIntensity: .9 }));
    root.add(tubing);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.018, .022, .07, 16), new THREE.MeshStandardMaterial({ color: C('#E9EEF5'), roughness: .4 }));
    hub.position.copy(EXIT[EXIT.length - 1]).add(V(.02, -.01, .02)); hub.rotation.z = 1.1; root.add(hub);

    // ---- sample tube ("odola") filling with the molecules that arrive
    const tb = bloodTube({ label: false }); tb.group.position.set(TX, FLOOR, 0); tb.group.scale.setScalar(TS); root.add(tb.group); this.tb = tb;
    const tsh = contactShadow({ size: 1, opacity: .2 }); tsh.scale.set(.4, .2, 1); tsh.position.set(TX, FLOOR, 0); root.add(tsh);
    this.blobs = instancedBlobs(NB, { r: .1, glow: .4, seed: 11 }); tb.group.add(this.blobs);
    const R2 = rng(77), { y0, y1, r } = tb.plasma; this.bp = [];
    for (let i = 0; i < NB; i++) { const an = R2() * 6.28, rr = Math.sqrt(R2()) * r * .85; this.bp.push({ x: Math.cos(an) * rr, y: y0 + .1 + (i / NB) * (y1 - y0 - .2) + (R2() - .5) * .15, z: Math.sin(an) * rr, ph: R2() * 6.28, s: 0 }); }
    this.tubeN = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = V(1, 1, 1); this.pv = V(0, 0, 0); this.ax = V(.2, 1, .1).normalize();
    this.plasmaBase = tb.plasmaMat.uniforms.uC.value.clone(); this.plasmaTo = this.plasmaBase.clone();

    // ---- molecules on their way
    this.pts = new Pts(NP); this.pts.mesh.renderOrder = 5; root.add(this.pts.mesh);
    this.P = Array.from({ length: NP }, () => ({ live: false, s: 0, sp: 1, w: 0, site: null, col: null, ox: 0, oy: 0, oz: 0 }));
    this.nextP = 0; this.Rn = rng(5); this.cur = -1;

    // ---- text
    add(layer, `<div class="eyebrow"><b>2</b>Igoeraren jatorria</div>`);
    add(layer, `<div class="h1">Entzimen <em>ehun-espezifikotasuna</em></div>`);
    const index = add(layer, '<div class="atlas-index"></div>');
    this.chips = ENZ.map(e => add(index, `<div class="atlas-row" style="--enzyme:${e.c}">
      <span class="atlas-name">${e.k}</span>
      <span class="atlas-sites">${e.org.map(() => '<i></i>').join('')}</span></div>`));
    this.cards = ENZ.map((e, i) => add(layer, `<div class="abs fx r atlas-entry" data-b="${i + 1}-${i + 1}" style="--enzyme:${e.c}">
      <h2 class="atlas-symbol">${e.k}</h2>${e.name ? `<div class="atlas-expanded">${e.name}</div>` : ''}
      <dl><dt>Jatorria</dt><dd class="atlas-source">${e.src}</dd>
      <dt>Diagnostikoan</dt><dd>${e.use}</dd></dl>
      ${e.k === 'CK' ? `<div style="margin-top:26px;padding-top:18px;border-top:1.5px solid var(--line);font:500 25px/1.3 var(--sans);color:var(--ink2)"><b style="color:var(--gold)">ALT</b> → ehun bat &nbsp;·&nbsp; <b style="color:var(--coral)">CK</b> → hiru jatorri posible</div>` : ''}</div>`));
    add(layer, `<div class="note" data-b="1-6" style="left:96px;top:791px;width:410px;font-size:24px"><span style="font-style:normal">○</span> = jatorri posible bat</div>`);
    add(layer, `<div class="note" data-b="7" style="left:96px;top:790px;width:500px;font-size:23px">Jatorri bat baino gehiago? → <span style="color:var(--ink2)">beste analisiak eta datu klinikoak</span><br><span style="font-size:22px">Erreferentzia-balioetan: adina, egoera fisiologikoa, sintomak</span></div>`);
    add(layer, `<div class="note" data-b="0-0" style="left:1260px;top:378px;width:530px;font-size:36px;line-height:1.28;padding-top:25px;border-top:2px solid var(--line)">Igoera bat ikustean:<br><span style="color:var(--ink);font-style:normal">nondik etor daiteke entzima?</span></div>`);
    this.labs = {};
    const anch = { liver: [-.27, .7, .05, 'l'], muscle: [-.2, -.36, .08, 'l'], heart: [.13, .96, .08, 'r'], brain: [.13, 1.68, .05, 'r'], bone: [-.2, -1.22, 0, 'l'], placenta: [.11, .3, .11, 'r'], rbc: [-.19, -1.0, .1, 'l'],
      bile: [-.13, .56, .12, 'l'], pancreas: [.23, .6, -.03, 'r'], saliva: [-.15, 1.48, .02, 'l'], lungs: [-.25, 1.05, -.03, 'l'], kidney: [.18, .44, -.1, 'r'] };
    for (const k in anch) { const [x, y, z, side] = anch[k]; const l = new Label(layer, ORG_NAME[k], { color: '#5d7fae', anchor: V(x, y, z), obj: root, side }); l.el.classList.add('bg'); l.vis = 0; this.labs[k] = l; }
    this.tubeLab = new Label(layer, 'Odola<small>neurtzen duguna</small>', { color: '#B84A5C', anchor: V(TX + .15, FLOOR + .4, 0), obj: root, side: 'r' }); this.tubeLab.el.classList.add('bg');
  },
  // tubing from the forearm vein into the tube cap
  outPts() { const e = EXIT[EXIT.length - 1]; return [e, V(.72, .3, .16), V(.98, .04, .15), V(TX, -.3, .02), V(TX, -.62, 0)]; },
  // the path a molecule takes from an organ site to the tube (body-local), sampled at equal arc length
  route(s) {
    const pts = [s.c, ...(s.exit ? s.exit : [...s.via, JUNCTION, ...EXIT.slice(0, -1)]), ...this.outPts(), V(TX, -1.17, 0)];
    const cu = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const sp = cu.getSpacedPoints(90);
    const a = new Float32Array(sp.length * 3); sp.forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; });
    return { a, n: sp.length, len: cu.getLength() };
  },
  enter(b) { this.rig.arrive(this.shot[0], this.shot[1], this.shot[2]); this.select(b, true); },
  beat(b) { this.select(b); },
  select(b, instant) {
    const e = b >= 1 ? ENZ[b - 1] : null; this.cur = b - 1;
    const d = instant ? .01 : .9;
    const aim=e ? this.O[e.org[0]].sites[0].c : this.shot[1];
    const y=.36+(aim.y-.36)*.17, x=.42+(aim.x-.42)*.12;
    this.rig.go(V(x+.04,y+.035,e ? 6.43 : 7.4),V(x,y,0),2.25,38); this.mediumAt=e ? 2.8 : 0;
    for (const k in this.O) { const o = this.O[k]; const on = !!(e && e.org.includes(k));
      o.on = on; o.target.copy(on ? (k === 'rbc' ? o.nat : C(b - 1 === AMY && k === 'saliva' ? COL3.amber : e.c3)) : e ? DIM : o.nat);   // red cells stay red
      o.op.to(HIDDEN.includes(k) ? (on ? 1 : 0) : on ? 1 : e ? .3 : .92, d); o.em.to(on ? .32 : 0, d); o.acc = 0;
      for (const s of o.sites) s.halo.material.color.copy(o.target);
      if (instant) o.col.copy(o.target); }
    for (const p of this.P) p.live = false;
    this.tubeN = 0; this.plasmaTo.copy(this.plasmaBase); if (e) { this.plasmaTo.lerp(C(e.c3), .35); this.eCol.copy(C(e.c3)); }
    for (const k in this.labs) this.labs[k].vis = e && e.org.includes(k) && !(e.k === 'LDH' && !LDH_LABELS.includes(k)) ? 1 : 0;
    if (e) this.labs.pancreas.el.querySelector('.t').innerHTML = b - 1 === AMY ? 'Pankrea<small>amilasa + lipasa</small>' : 'Pankrea';
    if (e) this.labs.saliva.el.querySelector('.t').innerHTML = b - 1 === AMY ? 'Listu-guruinak<small>amilasa</small>' : 'Listu-guruinak';
    for (const k in this.labs) this.lead(this.labs[k], (LEAD[b] || {})[k]);
    for (const k in this.labs) this.labs[k].el.style.color = e ? (b - 1 === AMY && k === 'saliva' ? COL.amber : e.c) : '#5d7fae';
    this.chips.forEach((row, i) => {
      row.classList.toggle('selected', i === b - 1);
      row.classList.toggle('visited', i < b);
    });
  },
  // pull a side label away from its anchor along a thin leader line (or put it back)
  lead(l, off) {
    const t = l.el.querySelector('.t'), st = l.el.querySelector('.stem');
    if (!off) { t.style.transform = ''; st.style.cssText = ''; return; }
    const [dx, dy] = off, r = l.el.classList.contains('r'), ex = r ? -dx + 16 : dx - 18;
    t.style.transform = r ? `translate(${16 - dx}px, calc(-50% + ${dy}px))` : `translate(calc(-100% + ${dx - 18}px), calc(-50% + ${dy}px))`;
    st.style.cssText = `display:block;left:0;top:0;bottom:auto;height:1.5px;width:${Math.hypot(ex, dy).toFixed(1)}px;transform-origin:0 0;transform:rotate(${Math.atan2(dy, ex)}rad)`;
  },
  spawn(site, col) {
    const p = this.P[this.nextP]; this.nextP = (this.nextP + 1) % NP; const R = this.Rn;
    const q = site.pts[Math.floor(R() * site.pts.length)];
    p.live = true; p.s = 0; p.site = site; p.col = col; p.ox = q.x - site.c.x; p.oy = q.y - site.c.y; p.oz = q.z - site.c.z; p.sp = SPEED * (.85 + R() * .3); p.w = R() * 6.28;
  },
  arrive(col) {
    if (this.tubeN >= NB) return;
    this.blobs.setColorAt(this.tubeN, col); this.blobs.instanceColor.needsUpdate = true; this.tubeN++;
  },
  update(dt, t) {
    if (this.mediumAt>0 && (this.mediumAt-=dt)<=0) this.rig.go(this.shot[0],this.shot[1],2.1,38);
    this.rig.update(t); this.S.dust.update(t);
    this.root.rotation.y = Math.sin(t * .21) * .07;
    const scan = -1.8 + ((t * .3) % 1) * 3.7; this.glassF.uniforms.uScan.value = scan; this.glassB.uniforms.uScan.value = scan;
    const e = this.cur >= 0 ? ENZ[this.cur] : null, k = 1 - Math.exp(-dt * 4), pulse = .78 + .22 * Math.sin(t * 3.2);
    // organs: colour, glow, fade; source organs release molecules once they are lit
    for (const key in this.O) {
      const o = this.O[key], m = o.mat;
      o.col.lerp(o.target, k); m.color.copy(o.col); m.emissive.copy(o.col);
      const op = o.op.v; m.opacity = op; m.depthWrite = op > .6; m.emissiveIntensity = o.em.v * (o.on ? pulse : 1);
      if (HIDDEN.includes(key)) o.mesh.visible = op > .01;
      for (const s of o.sites) s.halo.material.opacity = o.em.v * 1.3 * pulse;
      if (o.on && o.em.done) {
        o.acc += dt * RATE;
        while (o.acc >= 1) { o.acc -= 1; const s = o.sites[Math.floor(this.Rn() * o.sites.length)];
          this.spawn(s, this.cur === AMY && (key === 'saliva' || this.Rn() < .5) ? this.cAmb : key === 'rbc' ? this.eCol : o.target); }
      }
    }
    // molecules travelling along their routes
    const pts = this.pts;
    for (let i = 0; i < NP; i++) {
      const p = this.P[i];
      if (p.live) { p.s += p.sp * dt; if (p.s >= p.site.route.len) { p.live = false; this.arrive(p.col); } }
      if (!p.live) { pts.set(i, 0, 0, 0, 0, DIM, 0); continue; }
      const r = p.site.route, u = p.s / r.len * (r.n - 1), j = Math.min(r.n - 2, Math.floor(u)), f = u - j, a = r.a;
      const w = Math.max(0, 1 - p.s / .3), ww = w * w;
      const x = a[j * 3] + (a[j * 3 + 3] - a[j * 3]) * f + p.ox * ww + Math.sin(t * 6 + p.w) * .006;
      const y = a[j * 3 + 1] + (a[j * 3 + 4] - a[j * 3 + 1]) * f + p.oy * ww;
      const z = a[j * 3 + 2] + (a[j * 3 + 5] - a[j * 3 + 2]) * f + p.oz * ww + .01;
      pts.set(i, x, y, z, .094, p.col, Math.min(1, p.s * 8) * (1 - clamp((p.s - r.len + .12) / .12) * .6));
    }
    pts.commit();
    // the tube fills one blob per arriving molecule (and empties when the enzyme changes)
    const { m4, q, sv, pv, ax } = this;
    for (let i = 0; i < NB; i++) {
      const b = this.bp[i], on = i < this.tubeN; b.s += ((on ? 1 : 0) - b.s) * (1 - Math.exp(-dt * (on ? 7 : 5)));
      pv.set(b.x + Math.sin(t * .7 + b.ph) * .05, b.y + Math.sin(t * .5 + b.ph) * .05, b.z + Math.cos(t * .6 + b.ph) * .05);
      q.setFromAxisAngle(ax, t * .6 + b.ph); sv.setScalar(Math.max(.001, b.s)); m4.compose(pv, q, sv); this.blobs.setMatrixAt(i, m4);
    }
    this.blobs.instanceMatrix.needsUpdate = true;
    const pu = this.tb.plasmaMat.uniforms; pu.uC.value.lerp(this.plasmaTo, k * .5); pu.uI.value = .42 + .25 * Math.min(1, this.tubeN / NB);
    this.vMat.opacity = e ? .5 : .42;
    for (const key in this.labs) this.labs[key].update(this.camera);
    this.tubeLab.update(this.camera);
  },
};
