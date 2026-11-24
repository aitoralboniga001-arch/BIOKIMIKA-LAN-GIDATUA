// 12 · Closing: the four questions answered around the sample we started with; thanks.
// Four miniature teaching objects stay with the sample, then orbit the final question.
import { THREE, Tw, add, ease, clamp, screenOf } from '../core.js';
import { makeScene, bloodTube, COL, halo, contactShadow } from '../lib3d.js';
import { TEXT_HALO, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { closingObjects } from './closing_objects.js';
import { makeTrace } from './s00_trace.js';
import { icon } from '../icons.js';
import { el } from '../chart.js';
const _bf = new THREE.Vector3(); // scratch vector for the bridge focus

const TUBE_Y = -2.08, TUBE_S = 1.05; // cap top kept clear of the title descenders
// leader-line anchors on the tube (tube-local units, not rotating with the sway): plasma above, the label below
const ANCH = [[-.42, 2.45], [.42, 2.1], [-.48, 1.25], [.48, 1.0]];

export default {
  id: 'end', chapter: 4, beats: 2, title: 'Ondorioak', bloom: .55,
  bridgeIn: { focus() { const p = this.tb.plasma; return this.tb.group.localToWorld(_bf.set(0, (p.y0 + p.y1) / 2, 0)); } },
  bridge: { mode: 'flow', dir: [0, -1], speed: 1.15 },
  build(layer) {
    const S = makeScene({ glow: '#FFF6E8', gx: .5, gy: .52, dust: 120 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, .4, 11), V(0, .1, 0), { fov: 34, drift: .05 });
    const tb = bloodTube({}); tb.group.position.set(0, TUBE_Y, 0); tb.group.scale.setScalar(TUBE_S); this.scene.add(tb.group); this.tb = tb;
    const shadow = contactShadow({ size: 1.9, opacity: .2 }); shadow.position.y = -.04; tb.group.add(shadow);
    this.back = halo('#f3c98a', 6, .1); this.back.position.set(0, .3, -1.2); this.scene.add(this.back);

    this.objects=closingObjects(this.scene);
    this.trace=makeTrace(layer); this.trace.el.dataset.b='1'; this.trace.el.classList.add('fx','fade');
    this.trace.el.querySelector('.cv-read').style.display='none';
    this.out=new Tw(0); this.lead=new Tw(0); this.wv=V(0,0,0); this.age=0; this.phase=0; this.traceTick=0;

    add(layer, `<div class="eyebrow" data-b="-0"><b>5</b>Ondorioak</div>`);
    add(layer, `<div class="h1" data-b="-0" style="left:0;right:0;text-align:center;max-width:none;top:96px">Entzima bat neurtzea = <em>abiapuntu</em> erabilgarria</div>`);
    const Q = [
      ['tissue', 'Zein ehunetatik?', 'Ehun-banaketa eta isoentzimak', COL.coral, 96, 280],
      ['gauge', 'Zenbatekoa?', 'Magnitudeak orientatzen du, ez du larritasuna zuzenean ematen', COL.amber, 1290, 280],
      ['clock', 'Noiz?', 'Agerpen-zinetika: laginaren unea', COL.blue, 96, 640],
      ['patient', 'Zer datu kliniko?', 'Beste markatzaileak, laginaren kalitatea eta pazientearen datuak', COL.mint, 1290, 640],
    ];
    const svg = el('svg', { class: 'chart', width: 1920, height: 1080, viewBox: '0 0 1920 1080' }); svg.style.left = '0px'; svg.style.top = '0px'; layer.appendChild(svg);
    this.leads = [];
    Q.forEach(([ic, q, a, c, x, y], i) => {
      const card = add(layer, `<div class="card fx pop d${i + 1}" data-b="-0" style="left:${x}px;top:${y}px;width:534px;display:flex;gap:22px;align-items:center;padding:24px 28px">
        ${icon(ic, 64, c)}<div><h4 style="color:${c};font:400 38px/1.05 var(--serif);letter-spacing:-.01em;margin:0 0 6px">${q}</h4><p style="font-size:23px;line-height:1.35">${a}</p></div></div>`);
      // leader: from the card's inner edge to the tube; it grows out of the card after the card has popped (this.lead)
      const g = el('g', { 'data-b': '-0', class: 'fx fade' }, svg);
      const path = el('path', { fill: 'none', stroke: c, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .75 }, g);
      const ring = el('circle', { r: 9, fill: 'none', stroke: alpha(c, .35), 'stroke-width': 2 }, g);
      const dot = el('circle', { r: 4.5, fill: c, stroke: '#fff', 'stroke-width': 1.5 }, g);
      const tail = el('circle', { r: 4, fill: c }, g);
      this.leads.push({ card, path, dot, ring, tail, left: x < 900, x, y, a: V(ANCH[i][0], ANCH[i][1], .3), sy: 0, key: '' });
    });
    add(layer, `<div class="key c" data-b="-0" style="bottom:110px;font-size:32px;color:var(--ink2)">Jatorria · magnitudea · denbora · testuingurua → <em>interpretazioa</em></div>`);
    // the farewell mirrors the cover: amber-rule eyebrow, a masked serif title, a short rule and the names
    add(layer, `<div class="abs fx d1" data-b="1" style="left:0;right:0;top:300px;display:flex;justify-content:center;align-items:center;gap:18px;font:600 22px/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--mute);text-shadow:${TEXT_HALO}"><i style="display:block;width:46px;height:2px;background:var(--amber)"></i>Oinarrizko Biokimika <b style="color:var(--amber);font-weight:600">/</b> B.1 atala<i style="display:block;width:46px;height:2px;background:var(--amber)"></i></div>`);
    add(layer, `<div class="abs fx d2" data-b="1" data-reveal="lines" style="left:0;right:0;top:352px;text-align:center;font:400 140px/1.04 var(--serif);letter-spacing:-2px;color:var(--ink);text-shadow:${TEXT_HALO}">Eskerrik <em style="color:var(--amber);letter-spacing:-1px">asko</em></div>`);
    add(layer, `<div class="abs fx d4" data-b="1" style="left:0;right:0;top:540px;text-align:center;font:italic 400 46px/1 var(--serif);color:var(--ink2);text-shadow:${TEXT_HALO}">Galderarik?</div>`);
    add(layer, `<div class="abs fx d5" data-b="1" style="left:924px;top:632px;width:72px;height:1.5px;background:rgba(20,32,51,.22)"></div>`);
    add(layer, `<div class="abs fx d6" data-b="1" style="left:0;right:0;top:662px;text-align:center;font:500 24px/1.55 var(--sans);color:var(--ink2);letter-spacing:.2px;text-shadow:${TEXT_HALO}">Eneritz Baranda<span style="color:var(--amber);margin:0 10px">·</span>Urtzi Castillo<span style="color:var(--amber);margin:0 10px">·</span>Ane Hormaetxe<span style="color:var(--amber);margin:0 10px">·</span>Nora Navascues<span style="color:var(--amber);margin:0 10px">·</span>Aitor Alboniga</div>`);
  },
  enter(b) { this.age=0; this.phase=0; this.rig.arrive(V(0, .4, 11), V(0, .1, 0), 34); this.out.set(b); this.lead.set(0); if (!b) this.lead.to(1, 1.6, ease.io, .7); },
  beat(b) { this.rig.go(V(0,b?.8:.4,b?12.2:11),V(0,.1,0),2.4,34); this.out.to(b, 2.6, ease.io); this.lead.to(b ? 0 : 1, b ? .6 : 1.4, ease.io); },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const o = this.out.v, tg = this.tb.group;
    // tube: a gentle sway around the label facing the camera; on beat 1 it sinks away below the frame
    tg.rotation.y = -Math.PI * .25 + Math.sin(t * .35) * .38;
    tg.position.y = TUBE_Y - ease.in(o) * 6.5;
    this.back.position.y = .3 + o * .25; this.back.scale.setScalar(6 + o * 5); this.back.material.opacity = .1 + o * .05;

    this.age+=dt; this.phase+=dt*.075*o;
    this.objects.forEach((object,i)=>{
      const angle=this.phase+[2.48,.66,3.8,5.62][i];
      const x=i%2?1.30:-1.30, y=i<2?.91:-.9;
      object.position.set(x*(1-o)+5.25*Math.cos(angle)*o,y*(1-o)+2.7*Math.sin(angle)*o,.18+o*Math.sin(angle)*.4);
      object.rotation.y=.15*Math.sin(t*.45+i);
      object.scale.setScalar(ease.spring(clamp((this.age-i*.22)/.9))*(1.22+o*.45));
    });
    if(o>.01){this.traceTick-=dt;if(this.traceTick<=0){this.trace.pulse();this.traceTick=1.26;}this.trace.update(dt,t);}
    // leader lines: card inner edge -> tube anchor (re-projected each frame so they stay glued to the tube)
    const L = this.lead.v;
    for (const ld of this.leads) {
      if (!ld.sy && ld.card.offsetHeight) ld.sy = ld.y + ld.card.offsetHeight / 2;
      const sx = ld.left ? ld.x + 534 + 14 : ld.x - 14, sy = ld.sy || ld.y + 80;
      this.wv.set(ld.a.x * TUBE_S, TUBE_Y + ld.a.y * TUBE_S, ld.a.z);
      const s = screenOf(this.wv, this.camera);
      const ex = sx + (s.x - sx) * L, ey = sy + (s.y - sy) * L, mx = sx + (ex - sx) * .55;
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} C${mx.toFixed(1)} ${sy.toFixed(1)} ${mx.toFixed(1)} ${ey.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      if (d !== ld.key) { ld.key = d; ld.path.setAttribute('d', d);
        ld.dot.setAttribute('cx', ex.toFixed(1)); ld.dot.setAttribute('cy', ey.toFixed(1));
        ld.ring.setAttribute('cx', ex.toFixed(1)); ld.ring.setAttribute('cy', ey.toFixed(1)); ld.ring.setAttribute('r', (6 + 6 * L).toFixed(1));
        ld.tail.setAttribute('cx', sx.toFixed(1)); ld.tail.setAttribute('cy', sy.toFixed(1)); }
      ld.dot.style.opacity = ld.ring.style.opacity = clamp(L * 3 - 2);
    }
  },
};
