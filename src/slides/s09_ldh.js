// 9 · LDH: four subunits (H, M) → five tetramers. H and M associate at random, so a tissue's subunit mix sets its
// isoenzyme pattern (binomial p⁴ … q⁴): H-rich tissues give LDH1/LDH2, M-rich tissues LDH5. Haemolysis raises LDH artificially.
import { THREE, Tw, add, ease, clamp, rng, Label } from '../core.js';
import { makeScene, proteinMat, glassCylinder, fresnelMat, rbcGeo, rbcMat, Pts, C, contactShadow } from '../lib3d.js';
import { PAL, COL3, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { assemblySim, pin, mixBar, subunitGeo, faceIn } from './s08_s09_assembly.js';

const H3 = COL3.red, M3 = COL3.blue, HT = PAL.red, MT = PAL.blue;
const COMP = [4, 3, 2, 1, 0]; // number of H subunits in LDH1..LDH5
const XS = [-5.0, -2.5, 0, 2.5, 5.0];
const RS = .4, TET = [V(1, 1, 1), V(1, -1, -1), V(-1, 1, -1), V(-1, -1, 1)].map(v => v.normalize().multiplyScalar(RS * 1.12));
const HEMO = V(0, -11, 0);
const COLX = [.4, 1.45, 2.5, 3.55, 4.6];
// fraction of H subunits per beat (schematic)
const TISSUE = [null, { p: .82, k: 0 }, { p: .5, k: 1 }, { p: .12, k: 2 }, null];
const SIM = [V(0, .3, 12), V(0, .1, 0), 34];
const formula = nH => `${nH ? `<span style="color:${HT}">H${nH > 1 ? '<sub>' + nH + '</sub>' : ''}</span>` : ''}${4 - nH ? `<span style="color:${MT}">M${4 - nH > 1 ? '<sub>' + (4 - nH) + '</sub>' : ''}</span>` : ''}`;

export default {
  id: 'ldh', chapter: 3, beats: 5, title: 'Isoentzimak: LDH', bloom: .45,
  build(layer) {
    const S = makeScene({ gx: .5, gy: .45 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.shots = [[V(0, .3, 13), V(0, .25, 0), 34], SIM, SIM, SIM, [V(.9, HEMO.y + .75, 10), V(.9, HEMO.y + .45, 0), 34]];
    this.rig = new CamRig(this.camera, this.shots[0][0], this.shots[0][1], { fov: 34, drift: .03 });
    // ---------------------------------------------------------------- beat 0: the five tetramers assemble
    // four separate domains, contact faces toward the centre (same subunit look as the CK dimers)
    const gH = subunitGeo(303, RS), gM = subunitGeo(101, RS);
    const mH = proteinMat(H3, { glow: .05 }), mM = proteinMat(M3, { glow: .05 }); mH.vertexColors = mM.vertexColors = true;
    const R = rng(4);
    const intro = new THREE.Group(); this.scene.add(intro); this.introG = intro;
    this.tets = COMP.map((nH, i) => {
      const g = new THREE.Group(); g.position.set(XS[i], .9, 0); intro.add(g);
      const subs = TET.map((slot, j) => { const isH = j < nH; const m = new THREE.Mesh(isH ? gH : gM, isH ? mH : mM);
        g.add(m);
        const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), q1 = faceIn(new THREE.Quaternion(), [slot.x, slot.y, slot.z], j * 1.3);
        return { m, slot, q0, q1, from: V((R() - .5) * 9, (R() - .5) * 7, (R() - .5) * 4).sub(g.position), delay: i * .18 + j * .1 + R() * .15 }; });
      const sh = contactShadow({ size: 1.9, opacity: .13 }); sh.position.set(XS[i], -.25, 0); intro.add(sh);
      return { g, subs };
    });
    this.asm = new Tw(1); this.intro = new Tw(1);
    // ---------------------------------------------------------------- beats 1–3: random tetramer assembly
    this.sim = assemblySim(this.scene, { size: 4, colors: [H3, M3], n: 112, r: .1, seed: 21, pool: { x: -3.7, y: -.4, rx: 1.7, ry: 1.05, rz: .45 }, cols: COLX, colBase: -2.2, colH: 3.2, colR: .34, rate: 12, win: 26 });
    this.simOn = new Tw(0);
    // ---------------------------------------------------------------- beat 4: haemolysis vignette
    const hg = new THREE.Group(); hg.position.copy(HEMO); this.scene.add(hg); this.hg = hg;
    hg.add(glassCylinder({ r: 1.5, h: 3.4 }));
    const hs = contactShadow({ size: 4.2, opacity: .18 }); hs.position.y = -1.72; hg.add(hs);
    this.plasma = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 3.0, 64, 1, true), fresnelMat({ color: COL3.plasma, power: 1.4, intensity: .5, base: .16 })); this.plasma.position.y = -.12; hg.add(this.plasma);
    this.plasmaC = C(COL3.plasma); this.hemoC = C('#E0604A');
    const rg = rbcGeo(.34), rm = rbcMat(); this.rbcs = [];
    for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(rg, rm); const an = R() * 6.28, rr = Math.sqrt(R()) * 1.05; m.position.set(Math.cos(an) * rr, -1.3 + R() * 2.4, Math.sin(an) * rr); m.rotation.set(R() * 3, R() * 3, R() * 3); hg.add(m);
      this.rbcs.push({ m, burst: i % 3 === 0, at: (i / 3) * .45 + R() * .3, home: m.position.clone(), ph: R() * 6 }); }
    const bursters = this.rbcs.filter(r => r.burst);
    this.spill = new Pts(260); hg.add(this.spill.mesh); this.sp = [];
    for (let i = 0; i < 260; i++) this.sp.push({ src: bursters[i % bursters.length], d: V(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(.3 + R() * .9), ph: R() * 6 });
    this.spillC = C(COL3.red);
    this.hemo = new Tw(0);
    this.meter = add(layer, `<div class="meter" data-b="4" style="left:1250px;top:300px;height:420px"><div class="ref" style="height:24%"></div><div class="fill" style="background:linear-gradient(0deg,${PAL.red},${alpha(PAL.red, .55)})"></div></div>`);
    this.mfill = this.meter.querySelector('.fill');
    add(layer, `<div class="tag" data-b="4" style="left:1190px;top:740px;width:166px;text-align:center;color:var(--red)">LDH<small>plasman</small></div>`);
    add(layer, `<div class="note" data-b="4" style="left:1060px;top:640px;width:176px;text-align:right;font-size:18px">erreferentzia-<br>tartea</div>`);
    this.fake = add(layer, `<div class="pill" data-b="4" style="position:absolute;left:1166px;top:236px;color:var(--red);opacity:0;transition:opacity .5s">↑ artifiziala</div>`);
    this.fakeIn = this.fake;

    // ---------------------------------------------------------------- text
    add(layer, `<div class="eyebrow"><b>4</b>Isoentzimen ekarpena</div>`);
    add(layer, `<div class="h1">Isoentzimak: <em>laktato deshidrogenasa</em> (LDH)</div>`);
    const key = (b, html) => add(layer, `<div class="key" data-b="${b}" style="top:236px;bottom:auto;font-size:36px;max-width:1720px">${html}</div>`);
    key('0-0', `Lau azpiunitate · <b style="color:${HT}">H</b> eta <b style="color:${MT}">M</b> konbinatuta → bost isoentzima`);
    key('1-1', `<b style="color:${HT}">Miokardioa, eritrozitoak</b>: H nagusi → <b>LDH1</b>, <b>LDH2</b>`);
    key('2-2', `<b style="color:${PAL.violet}">Ehun askotan</b>: H eta M nahastuta → <b>LDH2–LDH4</b>`);
    key('3-3', `<b style="color:${MT}">Gibela, hezur-muskulua</b>: M nagusi → <b>LDH5</b>`);
    const sx = XS.map(x => 960 + x / 7.0 * 960);
    COMP.forEach((nH, i) => add(layer, `<div class="abs fx d${i + 1}" data-b="0-0" style="left:${sx[i] - 140}px;top:640px;width:280px;text-align:center">
      <div style="font:700 38px/1 var(--sans);color:var(--ink)">LDH${i + 1}</div><div style="font:600 30px/1 var(--sans);margin-top:10px">${formula(nH)}</div></div>`));
    add(layer, `<div class="note" data-b="0-0" style="left:0;right:0;top:820px;text-align:center;font-size:26px">LDH: piruvato + NADH ⇄ laktatoa + NAD⁺ · forma guztietan erreakzio bera</div>`);
    const TIS = [[[['heart', PAL.red], ['rbc', PAL.red]], 'Miokardioa · eritrozitoak', PAL.red], [[['tissue', PAL.violet]], 'Ehun askotan', PAL.violet], [[['liver', PAL.blue], ['muscle', PAL.blue]], 'Gibela · hezur-muskulua', PAL.blue]];
    this.chips = TIS.map(([ics, name, c], i) => add(layer, `<div class="abs" data-b="1-3" style="left:${96 + i * 290}px;top:300px;width:280px"><div style="box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:14px;border:1.5px solid ${alpha(c, .35)};background:rgba(255,255,255,.7);font:600 18px/1.1 var(--sans);white-space:nowrap;color:${c};transition:opacity .5s,transform .5s,background .5s">${ics.map(([n, cc]) => icon(n, 34, cc)).join('')}<span>${name}</span></div></div>`).firstElementChild);
    this.mix = mixBar(layer, add, { left: 150, top: 856, width: 560, names: ['H', 'M'], colors: [HT, MT], b: '1-3' });
    this.colNames = COMP.map((nH, i) => add(layer, `<div class="abs pin" data-b="1-3" style="left:0;top:0;text-align:center;white-space:nowrap"><div style="font:700 28px/1 var(--sans);color:var(--ink)">LDH${i + 1}</div><div style="font:600 22px/1 var(--sans);margin-top:6px">${formula(nH)}</div></div>`));
    add(layer, `<div class="abs" data-b="1-3" style="left:940px;top:318px;width:760px;text-align:center;font:600 19px/1.2 var(--sans);letter-spacing:2px;color:var(--mute)">SORTZEN DIREN ISOENTZIMAK</div>`);
    add(layer, `<div class="note" data-b="1-3" style="left:940px;top:350px;width:760px;text-align:center;font-size:19px">- - - ausazko elkarketak espero duena · proportzio eskematikoak</div>`);
    add(layer, `<div class="key" data-b="3-3" style="left:110px;top:926px;bottom:auto;font-size:25px;max-width:700px">LDH osoak jatorri askotako igoerak biltzen ditu → <em>proportzioek</em> jatorria zehazten laguntzen dute</div>`);
    add(layer, `<div class="card r" data-b="4" style="left:1380px;top:280px;width:450px">
      <h4 style="color:var(--red)">Hemolisia</h4><p>Eritrozitoek beren LDH askatzen dute → jarduera <b style="color:var(--ink)">artifizialki</b> igotzen da</p>
      <p style="margin-top:18px;color:var(--amber)">Interpretatu aurretik: <b>laginaren kalitatea</b> begiratu</p></div>`);
    if (!this.colAnch) this.colAnch = COLX.map(x => V(x, -2.25, .4));
  },
  enter(b) {
    const s = this.shots[b]; this.rig.arrive(s[0], s[1], s[2]);
    this.asm.set(b === 0 ? 0 : 1); if (b === 0) this.asm.to(1, 4.2, ease.lin);
    this.hemo.set(0); if (b === 4) this.hemo.to(1, 5, ease.lin, .8);
    this.apply(b, true);
  },
  beat(b, dir) {
    const s = this.shots[b], prev = this.shots[this.b ?? b];
    if (s !== prev) this.rig.go(s[0], s[1], 2.2, s[2]);
    if (b === 4) this.hemo.set(0).to(1, 5, ease.lin, 1.4); else this.hemo.to(0, .3);
    this.apply(b, false, dir);
  },
  apply(b, inst) {
    this.b = b;
    const T = TISSUE[b], d = inst ? .01 : 1.2;
    this.intro.to(b === 0 ? 1 : 0, d, ease.io);
    this.simOn.to(b >= 1 && b <= 3 ? 1 : 0, d, ease.io);
    if (T) { if (inst || Math.abs(this.sim.p - T.p) > 1e-6) this.sim.setP(T.p, inst); this.mix.set(T.p); }
    this.sim.run(b >= 1 && b <= 3);
    this.sim.highlight(T ? [0, 2, 4][T.k] : -1, 1);
    this.chips.forEach((c, i) => { const on = T && T.k === i; c.style.opacity = on ? 1 : .45; c.style.transform = on ? 'scale(1.05)' : 'none'; c.style.background = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.6)'; });
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    // beat 0 showcase
    const iv = this.intro.v; this.introG.visible = iv > .002;
    if (this.introG.visible) {
      this.introG.scale.setScalar(.5 + .5 * iv); this.introG.position.y = (1 - iv) * 1.4;
      const k = this.asm.v;
      this.tets.forEach((T, i) => {
        T.g.rotation.y = t * .4 + i * .7; T.g.rotation.x = Math.sin(t * .35 + i) * .25;
        const br = .02 * Math.sin(t * 1.2 + i * 1.3); // breathing: the four subunits open and close a little
        T.subs.forEach(s => { const u = ease.out(clamp((k * 4.2 - s.delay) / 1.6)); s.m.position.lerpVectors(s.from, s.slot, u).addScaledVector(s.slot, br * u / RS);
          s.m.quaternion.slerpQuaternions(s.q0, s.q1, u); s.m.scale.setScalar(.2 + .8 * u); });
      });
    }
    // assembly simulation
    const sv = this.simOn.v, sg = this.sim.group; sg.visible = sv > .002;
    sg.scale.setScalar(.85 + .15 * sv); sg.position.y = -(1 - sv) * .8;
    if (sg.visible) this.sim.update(t, dt);
    this.colAnch.forEach((a, j) => pin(this.colNames[j], a, this.camera, sg, 10));
    // haemolysis: burst cells → LDH leaves them → plasma LDH rises with the number of burst cells
    const h = this.hemo.v;
    if (this.b === 4 || h > 0) {
      let burst = 0;
      for (const r of this.rbcs) {
        const u = r.burst ? clamp((h * 4.5 - r.at) / .5) : 0;
        r.m.position.set(r.home.x + Math.sin(t * .5 + r.ph) * .06, r.home.y + Math.sin(t * .4 + r.ph) * .08, r.home.z);
        r.m.rotation.y += dt * .3; r.m.scale.setScalar(u < .6 ? 1 + u * .5 : Math.max(.001, (1 - u) * 3));
        r.m.visible = u < .99; burst += u;
      }
      for (let i = 0; i < this.sp.length; i++) { const p = this.sp[i], u = clamp((h * 4.5 - p.src.at) / .5), sp = clamp((u - .6) / .4);
        const drift = clamp(h * 4.5 - p.src.at - .5) * .35;
        const x = p.src.home.x + p.d.x * (sp + drift) * 1.4, y = p.src.home.y + p.d.y * (sp + drift) * 1.4 + Math.sin(t + p.ph) * .04, z = p.src.home.z + p.d.z * (sp + drift);
        const rr = Math.hypot(x, z), kk = rr > 1.3 ? 1.3 / rr : 1; // stay inside the plasma
        this.spill.set(i, x * kk, Math.max(-1.5, Math.min(1.3, y)), z * kk, .08, this.spillC, sp > 0 ? .8 : 0); }
      this.spill.commit();
      const f = clamp(burst / 9);
      this.plasma.material.uniforms.uC.value.copy(this.plasmaC).lerp(this.hemoC, f * .85);
      const lvl = 60 + f * 300; // px; reference line at 24 % of 420 px ≈ 100 px
      this.mfill.style.height = lvl + 'px';
      this.fake.style.opacity = this.b === 4 && lvl > 104 ? 1 : 0;
    }
  },
};
