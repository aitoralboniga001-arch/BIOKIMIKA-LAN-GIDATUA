// 12 · Closing: the four questions answered around the sample we started with; thanks.
// Four miniature teaching objects stay with the sample, then frame the sample beside the final question.
import { THREE, Tw, add, ease, clamp, screenOf } from '../core.js';
import { makeScene, bloodTube, COL, halo, contactShadow } from '../lib3d.js';
import { alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { closingObjects } from './closing_objects.js';
import { makeTrace } from './s00_trace.js';
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
    // An open ellipse recalls the cover lens and keeps the four specimens together during questions.
    const rimPoints = [];
    for (let i = 0; i < 128; i++) {
      if (i % 32 < 4) continue;
      for (const j of [i, i + 1]) {
        const angle = j * Math.PI / 64;
        rimPoints.push(2.18 * Math.cos(angle), 2.36 * Math.sin(angle), 0);
      }
    }
    const rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPoints, 3));
    this.rim = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({
      color:'#926d48', transparent:true, opacity:0, depthWrite:false
    }));
    this.rim.position.set(3.35,.15,-.32); this.scene.add(this.rim);
    this.trace=makeTrace(layer); this.trace.el.dataset.b='1'; this.trace.el.classList.add('fx','fade');
    this.trace.el.querySelector('.cv-read').style.display='none';
    this.out=new Tw(0); this.lead=new Tw(0); this.wv=V(0,0,0); this.age=0; this.traceTick=0;

    add(layer, `<div class="eyebrow" data-b="-0"><b>5</b>Ondorioak</div>`);
    add(layer, `<div class="h1" data-b="-0" style="left:0;right:0;text-align:center;max-width:none;top:96px">Entzima bat neurtzea = <em>abiapuntu</em> erabilgarria</div>`);
    const Q = [
      ['Zein ehunetatik?', 'Ehun-banaketa eta isoentzimak', COL.coral, 96, 280],
      ['Zenbatekoa?', 'Magnitudeak orientatzen du, ez du larritasuna zuzenean ematen', COL.amber, 1290, 280],
      ['Noiz?', 'Agerpen-zinetika: laginaren unea', COL.blue, 96, 640],
      ['Zer datu kliniko?', 'Beste markatzaileak, laginaren kalitatea eta pazientearen datuak', COL.mint, 1290, 640],
    ];
    const svg = el('svg', { class: 'chart', width: 1920, height: 1080, viewBox: '0 0 1920 1080' }); svg.style.left = '0px'; svg.style.top = '0px'; layer.appendChild(svg);
    this.leads = [];
    Q.forEach(([q, a, c, x, y], i) => {
      const card = add(layer, `<div class="closing-question abs fx d${i + 1}" data-b="-0" style="left:${x}px;top:${y}px;--question:${c}">
        <h4>${q}</h4><p>${a}</p></div>`);
      const g = el('g', { 'data-b': '-0', class: 'fx fade' }, svg);
      const path = el('path', { fill: 'none', stroke: c, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .75 }, g);
      const ring = el('circle', { r: 9, fill: 'none', stroke: alpha(c, .35), 'stroke-width': 2 }, g);
      const dot = el('circle', { r: 4.5, fill: c, stroke: '#fff', 'stroke-width': 1.5 }, g);
      const tail = el('circle', { r: 4, fill: c }, g);
      this.leads.push({ card, path, dot, ring, tail, left: x < 900, x, y, a: V(ANCH[i][0], ANCH[i][1], .3), sy: 0, key: '' });
    });
    add(layer, `<div class="key c" data-b="-0" style="bottom:110px;font-size:32px;color:var(--ink2)">Jatorria · magnitudea · denbora · testuingurua → <em>interpretazioa</em></div>`);
    add(layer, `<div class="farewell-credit abs fx d1" data-b="1">Oinarrizko Biokimika <b>/</b> B.1 atala</div>`);
    add(layer, `<div class="farewell-title abs fx d2" data-b="1" data-reveal="lines">Eskerrik <em>asko</em></div>`);
    add(layer, `<div class="farewell-question abs fx d4" data-b="1">Galderarik?</div>`);
    add(layer, `<div class="farewell-names abs fx d5" data-b="1">Eneritz Baranda · Urtzi Castillo · Ane Hormaetxe<br>Nora Navascues · Aitor Alboniga</div>`);
  },
  enter(b) { this.age=0; this.rig.arrive(V(0, b ? .8 : .4, b ? 12.2 : 11), V(0, .1, 0), 34); this.out.set(b); this.lead.set(0); if (!b) this.lead.to(1, 1.6, ease.io, .7); },
  beat(b) { this.rig.go(V(0,b?.8:.4,b?12.2:11),V(0,.1,0),2.4,34); this.out.to(b, 2.6, ease.io); this.lead.to(b ? 0 : 1, b ? .6 : 1.4, ease.io); },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const o = this.out.v, tg = this.tb.group;
    // Keep the original sample in view as the composition moves into the farewell.
    tg.rotation.y = -Math.PI * .25 + Math.sin(t * .35) * (.38 - .19 * o);
    tg.rotation.z = -.16 * o;
    tg.position.set(3.02 * o, TUBE_Y + .17 * o, 0);
    this.back.position.set(3.35 * o, .3, -1.2);
    this.back.scale.setScalar(6 + o); this.back.material.opacity = .1 + .05 * o;
    this.rim.visible = o > .02;
    this.rim.material.opacity = .32 * ease.io(o);
    this.age += dt;
    this.objects.forEach((object, i) => {
      const side = i % 2 ? 1 : -1, row = i < 2 ? 1 : -1;
      const x = side * 1.30, y = row * .91;
      const drift = .065 * Math.sin(t * .43 + i);
      object.position.set(x + (3.35 + side * 1.78 - x) * o,
        y + (.15 + row * 1.43 + drift - y) * o, .18 + .1 * o);
      object.rotation.y = .20 * Math.sin(t * .45 + i);
      object.scale.setScalar(ease.spring(clamp((this.age - i * .22) / .9)) * (1.22 + o * .30));
    });
    if(o>.01){this.traceTick-=dt;if(this.traceTick<=0){this.trace.pulse();this.traceTick=1.26;}this.trace.update(dt,t);}
    // leader lines: card inner edge -> tube anchor (re-projected each frame so they stay glued to the tube)
    const L = this.lead.v;
    if (o >= .999 && L <= .001) return;
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
