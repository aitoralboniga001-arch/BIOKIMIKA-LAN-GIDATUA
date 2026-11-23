// 12 · Closing: the four questions answered around the sample we started with; thanks.
// beat 0: the tube in the centre, a tidy ring of enzymes orbiting it, each question card tied to the sample by a drawn leader line
// beat 1: the tube sinks away and the ring opens into a wide, slow orbit that frames "Eskerrik asko" (a calm final picture)
import { THREE, Tw, add, ease, rng, clamp, screenOf } from '../core.js';
import { makeScene, bloodTube, instancedBlobs, C, COL, COL3, halo, contactShadow } from '../lib3d.js';
import { TEXT_HALO, alpha } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { icon } from '../icons.js';
import { el } from '../chart.js';

const TUBE_Y = -2.08, TUBE_S = 1.05; // cap top kept clear of the title descenders
// orbit shapes: centre y, radii (x, z), tilt about x (front of the ring lower than the back)
const RING0 = { y: 1.02, rx: 1.65, rz: 1.3, tilt: .34 };
const RING1 = { y: .52, rx: 5.0, rz: 2.9, tilt: .55 };
// leader-line anchors on the tube (tube-local units, not rotating with the sway): plasma above, the label below
const ANCH = [[-.42, 2.45], [.42, 2.1], [-.48, 1.25], [.48, 1.0]];

export default {
  id: 'end', chapter: 4, beats: 2, title: 'Ondorioak', bloom: .55,
  build(layer) {
    const S = makeScene({ glow: '#FFF6E8', gx: .5, gy: .52, dust: 120 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, .4, 11), V(0, .1, 0), { fov: 34, drift: .05 });
    const tb = bloodTube({}); tb.group.position.set(0, TUBE_Y, 0); tb.group.scale.setScalar(TUBE_S); this.scene.add(tb.group); this.tb = tb;
    const shadow = contactShadow({ size: 1.9, opacity: .2 }); shadow.position.y = -.04; tb.group.add(shadow);
    this.back = halo('#f3c98a', 6, .1); this.back.position.set(0, .3, -1.2); this.scene.add(this.back);

    // the ring: enzymes evenly spaced, coloured as a continuous gradient through the four question colours (one designed object, not confetti)
    const n = 64; this.n = n; this.orb = instancedBlobs(n, { r: .075, glow: .18, seed: 14 }); this.scene.add(this.orb);
    const stops = [COL3.coral, COL3.amber, COL3.mint, COL3.blue].map(C);
    const R = rng(66), tmp = new THREE.Color(); this.O = [];
    for (let i = 0; i < n; i++) {
      const u = i / n, f = u * stops.length, k = Math.floor(f);
      tmp.copy(stops[k % stops.length]).lerp(stops[(k + 1) % stops.length], f - k); this.orb.setColorAt(i, tmp);
      const ax = V(R() - .5, R() - .5, R() - .5).normalize();
      this.O.push({ a: u * Math.PI * 2 + (R() - .5) * .04, s: .8 + R() * .4, ph: R() * 6.28, ax, sp: .3 + R() * .5, lag: R() * .25 + u * .15 });
    }
    this.orb.instanceColor.needsUpdate = true;
    // a hairline guide along the orbit (unit circle, transformed like the ring)
    const pts = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(V(Math.cos(a), 0, Math.sin(a))); }
    this.guideMat = new THREE.LineBasicMaterial({ color: C(COL.amber), transparent: true, opacity: 0, depthWrite: false });
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.guideMat); this.scene.add(this.guide);
    this.out = new Tw(0); this.lead = new Tw(0);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = V(1, 1, 1); this.p = V(0, 0, 0); this.wv = V(0, 0, 0);

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
        ${icon(ic, 76, c)}<div><h4 style="color:${c};font-size:32px;margin-bottom:6px">${q}</h4><p style="font-size:23px">${a}</p></div></div>`);
      // leader: from the card's inner edge to the tube; it grows out of the card after the card has popped (this.lead)
      const g = el('g', { 'data-b': '-0', class: 'fx fade' }, svg);
      const path = el('path', { fill: 'none', stroke: c, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .75 }, g);
      const ring = el('circle', { r: 9, fill: 'none', stroke: alpha(c, .35), 'stroke-width': 2 }, g);
      const dot = el('circle', { r: 4.5, fill: c, stroke: '#fff', 'stroke-width': 1.5 }, g);
      const tail = el('circle', { r: 4, fill: c }, g);
      this.leads.push({ card, path, dot, ring, tail, left: x < 900, x, y, a: V(ANCH[i][0], ANCH[i][1], .3), sy: 0, key: '' });
    });
    add(layer, `<div class="key c" data-b="-0" style="bottom:110px;font-size:32px;color:var(--ink2)">Jatorria · magnitudea · denbora · testuingurua → <em>interpretazioa</em></div>`);
    add(layer, `<div class="abs fx pop d2" data-b="1" style="left:0;right:0;top:330px;text-align:center">
      <div style="font:400 140px/1 var(--serif);letter-spacing:-2px;text-shadow:${TEXT_HALO}">Eskerrik <em style="color:var(--amber)">asko</em></div>
      <div style="font:400 44px/1 var(--serif);color:var(--ink2);margin-top:40px;font-style:italic;text-shadow:${TEXT_HALO}">Galderarik?</div>
      <div style="font:500 23px/1.6 var(--sans);color:var(--mute);margin-top:70px;text-shadow:${TEXT_HALO}">Eneritz Baranda · Urtzi Castillo · Ane Hormaetxe · Nora Navascues · Aitor Alboniga</div></div>`);
  },
  enter(b) { this.rig.arrive(V(0, .4, 11), V(0, .1, 0), 34); this.out.set(b); this.lead.set(0); if (!b) this.lead.to(1, 1.6, ease.io, .7); },
  beat(b) { this.out.to(b, 2.6, ease.io); this.lead.to(b ? 0 : 1, b ? .6 : 1.4, ease.io); },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const o = this.out.v, tg = this.tb.group;
    // tube: a gentle sway around the label facing the camera; on beat 1 it sinks away below the frame
    tg.rotation.y = -Math.PI * .25 + Math.sin(t * .35) * .38;
    tg.position.y = TUBE_Y - ease.in(o) * 6.5;
    this.back.position.y = .3 + o * .25; this.back.scale.setScalar(6 + o * 5); this.back.material.opacity = .1 + o * .05;

    // ring shape per enzyme: a staggered blend from the small orbit to the wide one, so the ring "unfurls" around the text
    const rot = t * .09;
    for (let i = 0; i < this.n; i++) {
      const E = this.O[i];
      const k = ease.io(clamp((o * 1.35 - E.lag) / .85));
      const ry = RING0.y + (RING1.y - RING0.y) * k, rx = RING0.rx + (RING1.rx - RING0.rx) * k, rz = RING0.rz + (RING1.rz - RING0.rz) * k, tl = RING0.tilt + (RING1.tilt - RING0.tilt) * k;
      const a = E.a + rot * (1 - .45 * k) + Math.sin(k * Math.PI) * .6;
      const lx = Math.cos(a) * rx, lz = Math.sin(a) * rz, bob = Math.sin(t * .8 + E.ph) * .05 * (1 + k);
      this.p.set(lx, ry + bob - lz * Math.sin(tl), lz * Math.cos(tl));
      this.q.setFromAxisAngle(E.ax, t * E.sp + E.ph); this.sv.setScalar(E.s * (.68 + .82 * k));
      this.m4.compose(this.p, this.q, this.sv); this.orb.setMatrixAt(i, this.m4);
    }
    this.orb.instanceMatrix.needsUpdate = true;
    // guide follows the global (unstaggered) ring shape; it fades out while the ring is unfurling
    const kg = ease.io(o), G = this.guide;
    G.position.y = RING0.y + (RING1.y - RING0.y) * kg; G.rotation.x = RING0.tilt + (RING1.tilt - RING0.tilt) * kg;
    G.scale.set(RING0.rx + (RING1.rx - RING0.rx) * kg, 1, RING0.rz + (RING1.rz - RING0.rz) * kg);
    this.guideMat.opacity = .22 * Math.abs(o * 2 - 1) ** 2;

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
