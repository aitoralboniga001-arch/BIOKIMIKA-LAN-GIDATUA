// 9 · LDH: four subunits (H, M) → five tetramers. H and M associate at random, so a tissue's subunit mix sets its
// isoenzyme pattern (binomial p⁴ … q⁴): H-rich tissues give LDH1/LDH2, M-rich tissues LDH5. Haemolysis raises LDH artificially.
import { THREE, Tw, add, ease, clamp, rng, Label } from '../core.js';
import { makeScene, glassCylinder, fresnelMat, rbcGeo, rbcMat, Pts, C, contactShadow, halo } from '../lib3d.js';
import { PAL, COL3, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { assemblySim, pin, mixBar } from './s08_s09_assembly.js';
import { ribbonAssembly, dock } from './oligomer_ribbons.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const H3 = COL3.red, M3 = COL3.blue, HT = PAL.red, MT = PAL.blue;
const COMP = [4, 3, 2, 1, 0]; // number of H subunits in LDH1..LDH5
const XS = [-5.0, -2.5, 0, 2.5, 5.0];
const HEMO = V(0, -11, 0);
const COLX = [.4, 1.45, 2.5, 3.55, 4.6];
// fraction of H subunits per beat (schematic)
const TISSUE = [null, { p: .82, k: 0 }, { p: .5, k: 1 }, { p: .12, k: 2 }, null];
const SIM = [V(0, .3, 12), V(0, .1, 0), 34];
const formula = nH => `${nH ? `<span style="color:${HT}">H${nH > 1 ? '<sub>' + nH + '</sub>' : ''}</span>` : ''}${4 - nH ? `<span style="color:${MT}">M${4 - nH > 1 ? '<sub>' + (4 - nH) + '</sub>' : ''}</span>` : ''}`;

export default {
  id: 'ldh', chapter: 3, beats: 5, title: 'Isoentzimak: LDH', bloom: .45,
  bridgeIn: { focus() { return this.tets[2].g.getWorldPosition(_bf); } },            // the middle isoenzyme, assembling
  bridge: { mode: 'drop', focus() { return this.hg.localToWorld(_bf.set(0, -.12, 0)); } },  // into the haemolysed sample ...
  build(layer) {
    const S = makeScene({ gx: .5, gy: .45 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.shots = [[V(0, .3, 13), V(0, .25, 0), 34], SIM, SIM, SIM, [V(.9, HEMO.y + .75, 10), V(.9, HEMO.y + .45, 0), 34]];
    this.rig = new CamRig(this.camera, this.shots[0][0], this.shots[0][1], { fov: 34, drift: .03 });
    // ---------------------------------------------------------------- beat 0: the five tetramers assemble
    const R = rng(4);
    const intro = new THREE.Group(); this.scene.add(intro); this.introG = intro;
    this.tets = COMP.map((nH, i) => {
      // Choose front-facing sites for the minority chain in LDH2 and LDH4.
      const colors = [1, 0, 3, 2].map(rank => rank < nH ? H3 : M3);
      const model = ribbonAssembly('1I10', colors, 2.13, 2.04);
      model.g.position.set(XS[i], .85, 0);
      intro.add(model.g);
      const shadow = contactShadow({ size: 2, opacity: .11 });
      shadow.position.set(XS[i], -.22, 0); intro.add(shadow);
      return model;
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
    for (const r of bursters) {
      r.cloud = halo('#c5505a',.1,0);
      hg.add(r.cloud);
    }
    const section=new THREE.LatheGeometry(rg.parameters.points.filter((_,i)=>i%3===0),10,0,Math.PI*.61);
    this.shards=new THREE.InstancedMesh(section,rm,bursters.length*3);this.shards.frustumCulled=false;this.shards.count=0;hg.add(this.shards);
    this.shardPose=new THREE.Object3D();this.shardOffset=new THREE.Vector3();
    this.spill = new Pts(260); hg.add(this.spill.mesh); this.sp = [];
    for (let i = 0; i < 260; i++) this.sp.push({ src: bursters[i % bursters.length], d: V(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(.3 + R() * .9), ph: R() * 6 });
    this.spillC = C(COL3.blue);
    this.hemo = new Tw(0);
    this.meter = add(layer, `<div class="meter ldh-meter" data-b="4" style="left:1272px;top:300px;height:420px"><div class="ref" style="height:24%"></div><div class="fill" style="background:linear-gradient(0deg,${PAL.red},${alpha(PAL.red, .55)})"></div></div>`);
    this.mfill = this.meter.querySelector('.fill');
    add(layer, `<div class="tag" data-b="4" style="left:1212px;top:740px;width:166px;text-align:center;color:var(--red)">LDH<small>plasman</small></div>`);
    add(layer, `<div class="note" data-b="4" style="left:1078px;top:636px;width:180px;text-align:right;font-size:22px;line-height:1.15">erreferentzia-<br>tartea</div>`);
    this.fake = add(layer, `<div class="pill" data-b="4" style="position:absolute;left:auto;right:668px;top:600px;font-size:22px;padding:7px 14px 8px;color:var(--red);opacity:0;transition:opacity .5s">↑ artifiziala</div>`);
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
    COMP.forEach((nH, i) => add(layer, `<div class="abs fx d${i + 1}" data-b="0-0" style="left:${sx[i] - 140}px;top:616px;width:280px;text-align:center">
      <div class="tetramer-key" aria-hidden="true">${[3, 2, 0, 1].map(j=>`<i style="background:${[1,0,3,2][j]<nH ? HT : MT}"></i>`).join('')}</div>
      <div style="font:500 46px/1 var(--serif);letter-spacing:-.035em;color:var(--ink)">LDH${i + 1}</div><div style="font:600 30px/1 var(--sans);margin-top:10px">${formula(nH)}</div></div>`));
    add(layer, `<div class="note" data-b="0-0" style="left:0;right:0;top:820px;text-align:center;font-size:26px">LDH: piruvato + NADH ⇄ laktatoa + NAD⁺ · forma guztietan erreakzio bera</div>`);
    add(layer, `<div class="structure-source" data-b="0-0">Egitura-eredua · LDH5 (PDB 1I10)<br>H/M konbinazioak kolorez adierazita</div>`);
    const TIS = [[[['heart', PAL.red], ['rbc', PAL.red]], 'Miokardioa · eritrozitoak', PAL.red], [[['tissue', PAL.violet]], 'Ehun askotan', PAL.violet], [[['liver', PAL.blue], ['muscle', PAL.blue]], 'Gibela · hezur-muskulua', PAL.blue]];
    const chipRow = add(layer, `<div class="abs" data-b="1-3" style="left:96px;top:300px;display:flex;gap:12px">${TIS.map(([ics, name, c]) => `<div style="box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:5px 14px 5px 8px;border-radius:14px;border:1.5px solid ${alpha(c, .35)};background:rgba(255,255,255,.6);font:600 22px/1.1 var(--sans);white-space:nowrap;color:${c};opacity:.45;transition:opacity .5s,background .5s,border-color .5s">${ics.map(([n, cc]) => icon(n, 30, cc)).join('')}<span>${name}</span></div>`).join('')}</div>`);
    this.chips = [...chipRow.children]; this.chipC = TIS.map(t => t[2]);
    this.mix = mixBar(layer, add, { left: 150, top: 826, width: 560, names: ['H', 'M'], colors: [HT, MT], b: '1-3' });
    this.colNames = COMP.map((nH, i) => add(layer, `<div class="abs pin" data-b="1-3" style="left:0;top:0;text-align:center;white-space:nowrap"><div style="font:700 28px/1 var(--sans);color:var(--ink)">LDH${i + 1}</div><div style="font:600 26px/1 var(--sans);margin-top:4px">${formula(nH)}</div></div>`));
    add(layer, `<div class="abs kicker" data-b="1-3" style="left:940px;top:316px;width:760px;text-align:center">Sortzen diren isoentzimak</div>`);
    add(layer, `<div class="note" data-b="1-3" style="left:900px;top:350px;width:840px;text-align:center;font-size:22px">- - - ausazko elkarketak espero duena · proportzio eskematikoak</div>`);
    add(layer, `<div class="key" data-b="3-3" style="left:150px;top:902px;bottom:auto;font-size:24px;line-height:1.2;max-width:640px">LDH osoak jatorri askotako igoerak biltzen ditu → <em>proportzioek</em> jatorria zehazten laguntzen dute</div>`);
    add(layer, `<div class="fx d1" data-b="4" style="position:absolute;left:1400px;top:292px;font:400 60px/1 var(--serif);letter-spacing:-.01em;color:var(--red)">Hemolisia</div>`);
    add(layer, `<div class="fx d2" data-b="4" style="position:absolute;left:1400px;top:378px;width:440px;font:400 25px/1.42 var(--sans);color:var(--ink2)">Eritrozitoek beren LDH askatzen dute → jarduera <b style="color:var(--ink);font-weight:600">artifizialki</b> igotzen da</div>`);
    add(layer, `<div class="fx d3" data-b="4" style="position:absolute;left:1400px;top:508px;width:440px;padding:2px 0 2px 18px;border-left:2px solid var(--amber);font:500 24px/1.38 var(--sans);color:#8a4a06">Interpretatu aurretik: <b style="font-weight:650">laginaren kalitatea</b> begiratu</div>`);
    if (!this.colAnch) this.colAnch = COLX.map(x => V(x, -2.16, .4));
  },
  enter(b) {
    const s = this.shots[b]; this.rig.arrive(s[0], s[1], s[2]);
    this.asm.set(b === 0 ? 0 : 1); if (b === 0) this.asm.to(1, 3.4, ease.lin, .70);
    this.hemo.set(0); if (b === 4) this.hemo.to(1, 5, ease.lin, .8);
    this.apply(b, true);
  },
  beat(b, dir) {
    if (b === 0 && dir) this.asm.set(0).to(1, 3.4, ease.lin);
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
    this.chips.forEach((c, i) => { const on = T && T.k === i; c.style.opacity = on ? 1 : .45; c.style.borderColor = alpha(this.chipC[i], on ? .7 : .35); c.style.background = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.6)'; });
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    // beat 0 showcase
    const iv = this.intro.v; this.introG.visible = iv > .002;
    if (this.introG.visible) {
      this.introG.scale.setScalar(.5 + .5 * iv); this.introG.position.y = (1 - iv) * 1.4;
      this.tets.forEach((model, i) => dock(model, this.asm.v, t, i));
    }
    // assembly simulation
    const sv = this.simOn.v, sg = this.sim.group; sg.visible = sv > .002;
    sg.scale.setScalar(.85 + .15 * sv); sg.position.y = -(1 - sv) * .8;
    if (sg.visible) this.sim.update(t, dt);
    this.colAnch.forEach((a, j) => pin(this.colNames[j], a, this.camera, sg, 10));
    // haemolysis: burst cells → LDH leaves them → plasma LDH rises with the number of burst cells
    const h = this.hemo.v;
    if (this.b === 4 || h > 0) {
      let burst = 0, fragments=0;
      for (const r of this.rbcs) {
        const u = r.burst ? clamp((h * 4.5 - r.at) / .5) : 0;
        r.m.position.set(r.home.x + Math.sin(t * .5 + r.ph) * .06, r.home.y + Math.sin(t * .4 + r.ph) * .08, r.home.z);
        r.m.rotation.y += dt * .3; r.m.scale.setScalar(u < .6 ? 1 + u * .5 : Math.max(.001, (1 - u) * 3));
        r.m.visible = u < .54; burst += u;
        if (r.cloud) {
          const age = h*4.5 - r.at - .27;
          r.cloud.visible = age >= 0 && age < 1.45;
          if (r.cloud.visible) {
            const k = age/1.45;
            r.cloud.position.copy(r.home); r.cloud.position.y += .06*k;
            const limit=Math.min(1.32-Math.hypot(r.home.x,r.home.z),1.45-Math.abs(r.home.y));
            const span=Math.min(.19+.85*k, Math.max(.14,limit)*1.8);
            r.cloud.scale.set(span,span*.87,1);
            r.cloud.material.opacity=.60*Math.sin(Math.PI*k);
          }
        }
        if(u>=.54){
          const openness=(u-.54)/.46,age=Math.max(0,h*4.5-r.at-.5);
          for(let j=0;j<3&&age<.95;j++){
            const angle=j*2*Math.PI/3,pose=this.shardPose;
            pose.position.copy(r.m.position).add(this.shardOffset.set(Math.sin(angle)*.22*openness,-age*.19,Math.cos(angle)*.22*openness).applyQuaternion(r.m.quaternion));
            pose.quaternion.copy(r.m.quaternion);pose.rotateY(angle+openness*.24);pose.rotateX(openness*.32);
            pose.scale.setScalar((1.15-.3*openness)*Math.max(.01,1-age));pose.updateMatrix();this.shards.setMatrixAt(fragments++,pose.matrix);
          }
        }
      }
      this.shards.count=fragments; this.shards.instanceMatrix.needsUpdate=true;
      for (let i = 0; i < this.sp.length; i++) { const p = this.sp[i], u = clamp((h * 4.5 - p.src.at) / .5), sp = clamp((u - .6) / .4);
        const drift = clamp(h * 4.5 - p.src.at - .5) * .35;
        const x = p.src.home.x + p.d.x * (sp + drift) * 1.4, y = p.src.home.y + p.d.y * (sp + drift) * 1.4 + Math.sin(t + p.ph) * .04, z = p.src.home.z + p.d.z * (sp + drift);
        const rr = Math.hypot(x, z), kk = rr > 1.3 ? 1.3 / rr : 1; // stay inside the plasma
        this.spill.set(i, x * kk, Math.max(-1.5, Math.min(1.3, y)), z * kk, .08, this.spillC, sp > 0 ? .8 : 0); }
      this.spill.commit();
      const f = clamp(burst / 9);
      this.plasma.material.uniforms.uC.value.copy(this.plasmaC).lerp(this.hemoC, f * .85);
      const lvl = 60 + f * 300; // px; reference line at 24 % of 420 px ≈ 100 px
      this.mfill.style.transform = 'scaleY(' + Math.min(1, Math.max(0, lvl / 412)) + ')';
      this.fake.style.opacity = this.b === 4 && lvl > 104 ? 1 : 0; this.fake.style.top = (716 - lvl - 20).toFixed(1) + 'px';
    }
  },
};
