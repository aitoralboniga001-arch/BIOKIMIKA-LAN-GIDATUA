// 8 · Isoenzymes, CK: same reaction, different molecular forms. M and B subunits pair at random into
// CK-MM, CK-MB, CK-BB; the mix of subunits a tissue makes decides its isoenzyme mix (binomial p², 2pq, q²).
import { THREE, Tw, add, ease } from '../core.js';
import { makeScene, Pts, C, contactShadow } from '../lib3d.js';
import { PAL, COL3, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { assemblySim, pin, mixBar } from './s08_s09_assembly.js';
import { ribbonAssembly, dock } from './oligomer_ribbons.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const M3 = COL3.blue, B3 = COL3.amber, MT = PAL.blue, BT = PAL.amber;
const FORMS = [['M', 'M'], ['M', 'B'], ['B', 'B']];
const XS = [-3.48, 0, 3.48];
// fraction of M subunits made by each tissue (schematic): beat → p
const TISSUE = [null, { p: .5 }, { p: .985, k: 0 }, { p: .84, k: 1 }, { p: .06, k: 2 }, { p: .84, k: 1 }];
const COLX = [.9, 2.4, 3.9];
const SHOT = [V(0, .25, 10.5), V(0, .1, 0)];
const ck = (a, b) => `<span style="color:var(--ink)">CK-</span><span style="color:${a === 'M' ? MT : BT}">${a}</span><span style="color:${b === 'M' ? MT : BT}">${b}</span>`;

export default {
  id: 'ck', chapter: 3, beats: 6, title: 'Isoentzimak: CK', bloom: .45,
  // the CK columns morph into the row of LDH isoenzymes
  bridgeIn: { focus() { return _bf.set(COLX[1], -.45, .45); } },
  bridge: { mode: 'lenses', focus() { return _bf.set(COLX[1], -.45, .45); } },
  build(layer) {
    const S = makeScene({ gx: .5, gy: .45 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, SHOT[0], SHOT[1], { fov: 34, drift: .03 });
    // ---------------------------------------------------------------- beat 0: three forms, one reaction
    const intro = new THREE.Group(); this.scene.add(intro); this.introG = intro;
    this.dimers = FORMS.map((form, i) => {
      const model = ribbonAssembly('1I0E', form.map(k => k === 'M' ? M3 : B3), 2.85, 2.00);
      model.g.position.set(XS[i], .42, 0);
      intro.add(model.g);
      const shadow = contactShadow({ size: 2.8, opacity: .11 });
      shadow.position.set(XS[i], -.63, 0); intro.add(shadow);
      return model;
    });
    // The two initials follow the actual subunit centroids of the mixed dimer.
    this.chainInitials = ['M','B'].map((letter,i) => {
      const label = add(layer, `<div class="chain-initial abs fx fade" data-b="0-0" style="--chain:${i ? BT : MT}">${letter}</div>`);
      const anchor = new THREE.Object3D();
      this.dimers[1].parts[i].mesh.add(anchor);
      return {label, anchor, world:new THREE.Vector3()};
    });
    this.dockTime = new Tw(1);
    this.colAnch = COLX.map(x => V(x, -1.69, .37));
    this.flow = new Pts(36); intro.add(this.flow.mesh);
    this.sub = C(COL3.teal); this.pro = C(COL3.pink);
    this.intro = new Tw(1);

    // ---------------------------------------------------------------- beats 1–5: random pairing in a cell
    this.sim = assemblySim(this.scene, { size: 2, colors: [M3, B3], n: 64, r: .13, seed: 11, pool: { x: -3.1, y: -.35, rx: 1.85, ry: 1.1, rz: .5 }, cols: COLX, colBase: -1.66, colH: 2.67, colR: .42, rate: 11, win: 22 });
    this.simOn = new Tw(0); this.poolOut = new Tw(0);

    add(layer, `<div class="eyebrow"><b>4</b>Isoentzimen ekarpena</div>`);
    add(layer, `<div class="h1">Isoentzimak: <em>kreatina kinasa</em> (CK)</div>`);
    const key = (b, html) => add(layer, `<div class="key" data-b="${b}" style="top:236px;bottom:auto;font-size:36px;max-width:1720px">${html}</div>`);
    key('0-0', `Erreakzio <em>bera</em> · forma molekular <em>desberdinak</em>`);
    key('1-1', `Bi azpiunitate, <b style="color:${MT}">M</b> eta <b style="color:${BT}">B</b>, <em>ausaz</em> elkartzen dira → hiru forma`);
    key('2-2', `<b style="color:${MT}">Hezur-muskulua</b>: ia M soilik → ${ck('M', 'M')} nagusi`);
    key('3-3', `<b style="color:${PAL.red}">Miokardioa</b>: B gehiago ere → ${ck('M', 'B')} proportzio handiagoa`);
    key('4-4', `<b style="color:${PAL.violet}">Garuna</b>: B nagusi → ${ck('B', 'B')}`);
    key('5-5', `${ck('M', 'B')} igo bada → <em>miokardioa</em> izan daiteke jatorria`);
    // beat 0 names and total bar
    const sx = [372, 960, 1548];
    FORMS.forEach((f, i) => add(layer, `<div class="abs fx d${i + 1}" data-b="0-0" style="left:${sx[i] - 200}px;top:700px;width:400px;text-align:center;font:500 48px/1 var(--serif);letter-spacing:-.035em">${ck(f[0], f[1])}</div>`));
    // where each form is found (written work, 7.1)
    const WHERE = [`<b style="color:${MT}">Hezur-muskuluan</b> nagusitzen da`, `<b style="color:${PAL.red}">Miokardioan</b> nahiz <b style="color:${MT}">hezur-muskuluan</b>`, `<b style="color:${PAL.violet}">Garunean</b> eta beste zenbait ehunetan`];
    WHERE.forEach((w, i) => add(layer, `<div class="abs fx d${i + 2}" data-b="0-0" style="left:${sx[i] - 220}px;top:760px;width:440px;text-align:center;font:500 23px/1.2 var(--sans);color:var(--ink2);text-shadow:var(--halo)">${w}</div>`));
    add(layer, `<div class="abs" data-b="0-0" style="left:560px;top:820px;width:800px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font:600 22px/1 var(--sans);color:var(--ink2);margin-bottom:12px">CK osoaren jarduera = forma guztien ekarpena<span style="font:italic 400 22px/1 var(--serif);color:var(--mute)">serum normala · eskematikoa</span></div>
      <div style="display:flex;height:34px;border-radius:17px;overflow:hidden;border:1px solid var(--line)"><div style="flex:89;background:${M3}"></div><div style="flex:7;background:linear-gradient(90deg,${M3} 50%,${B3} 50%);border-left:2px solid #fff"></div><div style="flex:4;background:${B3};border-left:2px solid #fff"></div></div>
      <div style="display:flex;font:500 22px/1 var(--mono);color:var(--mute);margin-top:10px"><span style="flex:89">MM</span><span style="flex:7;text-align:center">MB</span><span style="flex:4;text-align:right">BB</span></div></div>`);
    add(layer, `<div class="note" data-b="0-0" style="left:96px;top:924px;font-size:22px">CK: kreatina + ATP ⇄ fosfokreatina + ADP</div>`);
    add(layer, `<div class="structure-source" data-b="0-0">Egitura-eredua · CK-MM (PDB 1I0E)<br>M/B konbinazioak kolorez adierazita</div>`);
    // tissue chips above the cell
    const TIS = [['muscle', 'Hezur-muskulua', PAL.blue], ['heart', 'Miokardioa', PAL.red], ['brain', 'Garuna', PAL.violet]];
    this.chips = TIS.map(([ic, name, c], i) => add(layer, `<div class="abs" data-b="1-4" style="left:${96 + i * 262}px;top:300px;width:250px"><div class="chip" style="box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:14px;border:1.5px solid ${alpha(c, .35)};background:rgba(255,255,255,.7);font:600 22px/1.1 var(--sans);white-space:nowrap;color:${c};transition:opacity .5s,transform .5s,background .5s">${icon(ic, 40, c)}<span>${name}</span></div></div>`).firstElementChild);
    add(layer, `<div class="abs" data-b="1-1" style="left:96px;top:356px;width:700px;font:600 23px/1.2 var(--sans);color:var(--ink2);text-align:center">Adibidea: <b style="color:${MT}">M</b> eta <b style="color:${BT}">B</b> erdibana</div>`);
    this.mix = mixBar(layer, add, { left: 150, top: 900, width: 580, names: ['M', 'B'], colors: [MT, BT], b: '1-4' });
    // column names
    this.colNames = FORMS.map(f => add(layer, `<div class="abs pin" data-b="1" style="left:0;top:0;font:700 32px/1 var(--sans);white-space:nowrap">${ck(f[0], f[1])}</div>`));
    add(layer, `<div class="abs kicker" data-b="1" style="left:1000px;top:316px;width:720px;text-align:center">Sortzen diren isoentzimak</div>`);
    add(layer, `<div class="note" data-b="1-4" style="left:880px;top:908px;width:960px;text-align:center;font-size:22px">- - - ausazko elkarketak espero duena · proportzio eskematikoak</div>`);
    add(layer, `<div class="note" data-b="1-1" style="left:880px;top:938px;width:960px;text-align:center;font-size:22px">MB bi bidetatik sortzen da (M+B, B+M) → bi aldiz maizago</div>`);
    // beat 5: the diagnostic point
    add(layer, `<div class="kicker fx d1" data-b="5" style="position:absolute;left:96px;top:322px">Diagnostikoan</div>`);
    add(layer, `<div class="key d2" data-b="5" style="left:96px;top:358px;bottom:auto;font-size:48px;line-height:1.08;max-width:700px">CK osoa ↑ → ${ck('M', 'B')} <em>neurtu</em></div>`);
    add(layer, `<div class="fx d3" data-b="5" style="position:absolute;left:96px;top:436px;width:640px;font:400 25px/1.42 var(--sans);color:var(--ink2)">Miokardioak B azpiunitate gehiago egiten du → CK-MB proportzio handiagoa → balizko jatorri <b style="color:var(--ink);font-weight:600">miokardikoari</b> buruzko informazioa</div>`);
    add(layer, `<div class="fx d4" data-b="5" style="position:absolute;left:96px;top:566px;width:640px;padding:2px 0 2px 18px;border-left:2px solid var(--amber);font:500 24px/1.38 var(--sans);color:#8a4a06">Hezur-muskuluaren lesioak ere CK-MB igo dezake → beste datuekin osatu</div>`);
    // the cause on the left (the myocardium's subunit mix) and an arrow to its consequence (the columns)
    add(layer, `<div class="abs fx d2" data-b="5" style="left:96px;top:676px;width:700px;display:flex;align-items:center;gap:14px;font:600 26px/1.2 var(--sans);color:${PAL.red}">${icon('heart', 56, PAL.red)} Miokardioaren patroia</div>`);
    mixBar(layer, add, { left: 96, top: 768, width: 620, names: ['M', 'B'], colors: [MT, BT], b: '5' }).set(TISSUE[3].p);
    add(layer, `<svg class="abs fx d3" data-b="5" style="left:736px;top:796px;overflow:visible" width="290" height="30" viewBox="0 0 290 30"><path d="M4 15H272" stroke="${PAL.red}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9"/><path d="M262 5L280 15L262 25" fill="none" stroke="${PAL.red}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  },
  enter(b) { if (b === 0) this.dockTime.set(0).to(1, 3.2, ease.lin, 1.25); this.rig.arrive(SHOT[0], SHOT[1], 34); this.apply(b, true); },
  beat(b, dir) {
    if (b === 0 && dir) this.dockTime.set(0).to(1, 3.2, ease.lin);
    const x=b>=2&&b<=4?(COLX[b-2]-2.4)*.13:0;
    this.rig.go(V(x,.27,b>=2?10.15:10.5),V(x*.75,.1,0),2.1,34); this.apply(b,false,dir);
  },
  apply(b, inst) {
    this.b = b;
    const T = TISSUE[b], d = inst ? .01 : 1.2;
    this.intro.to(b === 0 ? 1 : 0, d, ease.io);
    this.simOn.to(b >= 1 ? 1 : 0, d, ease.io);
    this.poolOut.to(b === 5 ? 1 : 0, inst ? .01 : 1.4, ease.io);
    const running = b >= 1 && b <= 4;
    if (T) {
      if (inst || Math.abs(this.sim.p - T.p) > 1e-6) this.sim.setP(T.p, inst);
      // beat 5: the pool slides away and nothing new assembles, so the columns go straight to the heart pattern
      if (!running) this.sim.settle();
      this.mix.set(T.p);
    }
    this.sim.run(running);
    this.sim.highlight(1, b === 5 || b === 3 ? 1 : 0);
    this.chips.forEach((c, i) => { const on = T && T.k === i; c.style.opacity = b === 1 ? .35 : on ? 1 : .45; c.style.transform = on ? 'scale(1.06)' : 'none'; c.style.background = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.6)'; });
  },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    // beat 0: the three forms
    const iv = this.intro.v; this.introG.visible = iv > .002;
    if (this.introG.visible) {
      this.introG.scale.setScalar(.4 + .6 * iv); this.introG.position.y = (1 - iv) * 1.2;
      this.dimers.forEach((model, i) => dock(model, this.dockTime.v, t, i));
      this.introG.updateWorldMatrix(true,true);
      for (const {label,anchor,world} of this.chainInitials) {
        anchor.getWorldPosition(world).project(this.camera);
        label.style.left = ((world.x+1)*960).toFixed(1)+'px';
        label.style.top = ((1-world.y)*540).toFixed(1)+'px';
      }
      // substrate in, product out, through every form
      let k = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 12; j++) {
        const ph = ((t * .35 + j / 12) % 1), x = XS[i] - 1.9 + ph * 3.8, y = .55 + Math.sin(ph * 9 + j * 1.7) * .12 + (j % 3 - 1) * .12;
        this.flow.set(k++, x, y, .2, .11, ph < .5 ? this.sub : this.pro, (Math.abs(ph - .5) > .17 ? .9 : 0) * iv);
      }
      this.flow.commit();
    }
    // beats 1+: the assembly simulation
    const sv = this.simOn.v, sg = this.sim.group; sg.visible = sv > .002;
    sg.scale.setScalar(.85 + .15 * sv); sg.position.y = -(1 - sv) * .8;
    this.sim.poolG.position.x = -this.poolOut.v * 7;
    if (sg.visible) this.sim.update(t, dt);
    
    this.colAnch.forEach((a, j) => pin(this.colNames[j], a, this.camera, sg, 10));
  },
};
