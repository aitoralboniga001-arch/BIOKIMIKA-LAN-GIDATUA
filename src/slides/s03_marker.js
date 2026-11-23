// 3 · What makes a useful enzyme marker (four properties) + substrate vs tissue specificity.
// Beat 1: a 3D enzyme turning substrate over (the measured signal) feeds, with the other data, into the interpretation.
// Beats 2-5: one property at a time, centre stage, each with a live simulation (2D canvas):
//   1 tissue specificity: a lesion hits liver / heart / muscle; ALT only rises for the liver, LDH for all of them
//   2 sensitivity: small tissue lesions; a sensitive marker climbs above the reference limit, an insensitive one stays in the noise
//   3 reproducibility: repeated measurements of one sample pile up tightly (A) or scattered (B)
//   4 analytical accuracy: both methods repeat well, but only one is centred on the true value (precision ≠ accuracy)
// Beat 6: lock and key (the right substrate fits the slot-shaped active site, a wrong molecule bounces off) next to a
// glass body whose organs are coloured by their ALT content (schematic tissue distribution).
import { THREE, Tw, add, rng, clamp, ease, Label } from '../core.js';
import { makeScene, contactShadow, Pts, C, COL3 } from '../lib3d.js';
import { PAL, INK, INK2, MUTE, LINE, LINE2, alpha } from '../theme.js';
import { el } from '../chart.js';
import { CamRig, V } from '../rig.js';
import { ICON, icon } from '../icons.js';
import { makeDockEnzyme, makeBody } from './s03_marker_3d.js';

const CW = 358; // canvas width in drawing units; heights per simulation
const SC = 1.95; // the active simulation is shown SC times larger (CSS transform), the canvas is backed at high resolution so it stays crisp
const PW = 1300, PH = 640, PX = (1920 - PW) / 2, PY = 310; // property panel
// all canvas text is >= 21 px on the 1920 stage
const FONT = `600 21px 'Segoe UI', system-ui, sans-serif`, FONTB = `700 22px 'Segoe UI', system-ui, sans-serif`;
function mkCanvas(CHT) {
  const c = document.createElement('canvas'); c.width = CW * 2.8; c.height = CHT * 2.8; c.style.cssText = `width:${CW}px;height:${CHT}px;display:block`;
  const x = c.getContext('2d'); x.scale(2.8, 2.8); return { c, x };
}
function gauss(R) { let u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
const wob = (t, p) => Math.sin(t * 13.1 + p) * .5 + Math.sin(t * 29.7 + p * 2.3) * .3 + Math.sin(t * 47.3 + p * .7) * .2; // smooth pseudo-noise
const bump = u => u <= 0 ? 0 : (u / .9) * Math.exp(1 - u / .9);

// ---------------------------------------------------------------- 1 · tissue specificity
const ORG = [['liver', 'gibelean'], ['heart', 'bihotzean'], ['muscle', 'muskuluan']];
function simSpec(host) {
  const CHT = 284, { c, x } = mkCanvas(CHT); host.appendChild(c); host.style.position = 'relative';
  const ROW = 64, IY = 4;
  const icons = ORG.map(([k], i) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:6px;top:${IY + i * ROW}px;width:50px;height:50px;color:${MUTE};opacity:.4;transition:opacity .3s,color .3s,transform .3s`; d.innerHTML = ICON[k]; host.appendChild(d); return d; });
  const P = []; for (let i = 0; i < 40; i++) P.push({ on: false, t: 0, y0: 0, k: 0 });
  const lv = [.08, .08]; let cur = -1, emitted = 0, per = -1;
  const TX = [268, 324], TOP = 18, BOT = 186, PER = 3;
  return (dt, t) => {
    const p = Math.floor(t / PER), ph = t - p * PER, o = p % 3;
    if (p !== per) { per = p; emitted = 0; }
    if (o !== cur) { cur = o; icons.forEach((d, i) => { d.style.opacity = i === o ? 1 : .35; d.style.color = i === o ? PAL.coral : MUTE; d.style.transform = i === o ? 'scale(1.12)' : 'none'; }); }
    // emission during the first .8 s of the lesion: liver releases ALT (gold) + LDH (blue), heart / muscle only LDH
    const want = Math.min(12, Math.floor(ph / .8 * 12));
    while (emitted < want) { const k = o === 0 ? emitted % 2 : 1; const q = P.find(z => !z.on); if (q) { q.on = true; q.t = 0; q.k = k; q.y0 = IY + 25 + o * ROW + (Math.random() - .5) * 16; q.j = Math.random(); } emitted++; }
    for (let i = 0; i < 2; i++) lv[i] = Math.max(.08, lv[i] - (lv[i] - .08) * .45 * dt);
    x.clearRect(0, 0, CW, CHT);
    // tube with two bars
    x.strokeStyle = LINE2; x.lineWidth = 2; x.beginPath(); x.roundRect(242, TOP - 6, 108, BOT - TOP + 12, 16); x.stroke();
    [PAL.gold, PAL.blue].forEach((col, i) => { const hgt = clamp(lv[i]) * (BOT - TOP); x.fillStyle = col; x.beginPath(); x.roundRect(TX[i] - 12, BOT - hgt, 24, hgt, 7); x.fill(); });
    x.font = FONTB; x.textAlign = 'center'; x.fillStyle = PAL.gold; x.fillText('ALT', TX[0], BOT + 32); x.fillStyle = PAL.blue; x.fillText('LDH', TX[1], BOT + 32);
    // particles: organ → tube
    for (const q of P) { if (!q.on) continue; q.t += dt / 1.1; if (q.t >= 1) { q.on = false; lv[q.k] = Math.min(1, lv[q.k] + .075); continue; }
      const k = q.t, ex = TX[q.k], ey = TOP + 4, cx = 160, cy = q.y0 - 40 - q.j * 30;
      const px = (1 - k) * (1 - k) * 58 + 2 * (1 - k) * k * cx + k * k * ex, py = (1 - k) * (1 - k) * q.y0 + 2 * (1 - k) * k * cy + k * k * ey;
      x.globalAlpha = Math.min(1, k * 6); x.fillStyle = q.k ? PAL.blue : PAL.gold; x.beginPath(); x.arc(px, py, 5, 0, 6.283); x.fill(); }
    x.globalAlpha = 1;
    x.font = FONT; x.textAlign = 'center'; x.fillStyle = INK2;
    x.fillText(`kaltea ${ORG[o][1]} →`, 118, 236); x.font = FONTB;
    if (o === 0) { x.fillStyle = PAL.gold; x.fillText('ALT ↑', 72, 272); x.fillStyle = PAL.blue; x.fillText('LDH ↑', 166, 272); }
    else { x.fillStyle = PAL.blue; x.fillText('LDH ↑', 72, 272); x.fillStyle = MUTE; x.fillText('ALT ≈', 166, 272); }
  };
}

// ---------------------------------------------------------------- 2 · sensitivity
function simSens(host) {
  const CHT = 284, { c, x } = mkCanvas(CHT); host.appendChild(c);
  const WIN = 7, X0 = 8, X1 = CW - 8, Y0 = 66, Y1 = 180, THR = .44, PER = 4.2;
  const Y = v => Y1 - v * (Y1 - Y0);
  const sig = (tt, gain, p) => { const te = Math.floor((tt - .8) / PER) * PER + .8; return .2 + gain * (bump(tt - te) + bump(tt - te + PER)) + .045 * wob(tt, p); };
  return (dt, t) => {
    x.clearRect(0, 0, CW, CHT);
    // lesion strip
    x.font = FONT; x.textAlign = 'left'; x.fillStyle = MUTE; x.fillText('ehun-kaltea (txikia)', X0, 20);
    for (let k = Math.floor((t - WIN - .8) / PER); k <= Math.floor((t - .8) / PER); k++) { const te = k * PER + .8, px = X0 + (te - (t - WIN)) / WIN * (X1 - X0); if (px < X0 || px > X1) continue;
      x.fillStyle = alpha(PAL.coral, .8); x.beginPath(); x.roundRect(px - 4, 28, 8, 12, 3); x.fill(); x.strokeStyle = alpha(PAL.coral, .25); x.setLineDash([3, 4]); x.beginPath(); x.moveTo(px, 42); x.lineTo(px, Y1); x.stroke(); x.setLineDash([]); }
    // reference limit (named in the legend below, so no trace ever runs through its label)
    x.strokeStyle = LINE2; x.lineWidth = 1.5; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(X0, Y(THR)); x.lineTo(X1, Y(THR)); x.stroke(); x.setLineDash([]);
    x.strokeStyle = alpha(INK, .45); x.lineWidth = 2; x.beginPath(); x.moveTo(X0, Y0 - 6); x.lineTo(X0, Y1); x.lineTo(X1, Y1); x.stroke();
    // two markers measured on the same lesions
    [[.15, MUTE, 2.5], [.8, PAL.blue, 3.5]].forEach(([g, col, w], j) => {
      x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.beginPath();
      for (let i = 0; i <= 110; i++) { const tt = t - WIN + i / 110 * WIN, px = X0 + i / 110 * (X1 - X0), py = Y(sig(tt, g, j * 3.1)); i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke(); });
    // detection ticks where the sensitive marker crosses the limit
    for (let k = Math.floor((t - WIN - .8) / PER); k <= Math.floor((t - .8) / PER); k++) { const tp = k * PER + .8 + .9, px = X0 + (tp - (t - WIN)) / WIN * (X1 - X0);
      if (tp > t || px < X0 + 10) continue; const v = sig(tp, .8, 3.1); if (v > THR) { x.fillStyle = PAL.blue; x.font = FONTB; x.textAlign = 'center'; x.fillText('✓', px + 16, Math.max(Y(v) + 8, 66)); } }
    // legend
    x.font = FONTB; x.textAlign = 'left'; x.fillStyle = PAL.blue; x.fillText('● sentikorra', X0, 210); x.fillStyle = MUTE; x.fillText('● ez-sentikorra', X0 + 160, 210);
    x.strokeStyle = LINE2; x.lineWidth = 2; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(X0, 240); x.lineTo(X0 + 40, 240); x.stroke(); x.setLineDash([]);
    x.font = FONT; x.fillStyle = INK2; x.fillText('erreferentzia-muga', X0 + 50, 247);
  };
}

// ---------------------------------------------------------------- 3 / 4 · repeated measurements piling up on a number line
function simDots(host, rows, { truth = null } = {}) {
  const CHT = 284, { c, x } = mkCanvas(CHT); host.appendChild(c);
  const R = rng(rows.length * 17 + (truth ? 5 : 1)), N = 15, BIN = 9, MID = CW / 2, DOT = 8.5;
  // each row owns a band: stack area (SA) above its baseline, then the mean marker and the row name below it;
  // a top strip is reserved for the true-value label. Stacks are squeezed to fit their band, never overflow it.
  const TOP = truth ? 36 : 6, RH = (CHT - TOP) / rows.length, SA = RH - 54;
  rows.forEach((r, i) => { r.buf = []; r.next = .2 + i * .25; r.base = TOP + i * RH + SA; });
  return (dt, t) => {
    x.clearRect(0, 0, CW, CHT);
    if (truth) { x.strokeStyle = INK; x.lineWidth = 2; x.setLineDash([5, 5]); x.beginPath(); x.moveTo(MID, TOP - 4); x.lineTo(MID, CHT - 4); x.stroke(); x.setLineDash([]);
      x.font = FONTB; x.textAlign = 'center'; x.fillStyle = INK; x.fillText(truth, MID, 22); }
    for (const r of rows) {
      r.next -= dt;
      if (r.next <= 0) { r.next = .5; r.buf.push({ v: MID + r.mu + gauss(R) * r.sd, t0: t }); if (r.buf.length > N) r.buf.shift(); }
      x.strokeStyle = alpha(INK, .4); x.lineWidth = 1.5; x.beginPath(); x.moveTo(10, r.base + 7); x.lineTo(CW - 10, r.base + 7); x.stroke();
      x.font = FONTB; x.textAlign = 'left'; x.fillStyle = r.col; x.fillText(r.name, 10, r.base + 46);
      const h = r.h || (r.h = new Map()); h.clear(); let sum = 0, top = 1;
      for (const d of r.buf) { const bx = Math.round(clamp(d.v, 14, CW - 14) / BIN); h.set(bx, (h.get(bx) || 0) + 1); top = Math.max(top, h.get(bx)); }
      const step = Math.min(DOT, (SA - 6) / Math.max(1, top - 1)); h.clear();
      for (const d of r.buf) { const bx = Math.round(clamp(d.v, 14, CW - 14) / BIN), k = h.get(bx) || 0; h.set(bx, k + 1); sum += d.v;
        const yT = r.base - k * step, fall = clamp((t - d.t0) / .3), y = r.base - SA + 4 + (yT - r.base + SA - 4) * fall * fall;
        x.globalAlpha = Math.min(1, fall * 3); x.fillStyle = r.col; x.beginPath(); x.arc(bx * BIN, y, 4.3, 0, 6.283); x.fill(); }
      x.globalAlpha = 1;
      if (r.buf.length > 2) { const m = sum / r.buf.length; x.fillStyle = r.col; x.beginPath(); x.moveTo(m, r.base + 10); x.lineTo(m - 8, r.base + 22); x.lineTo(m + 8, r.base + 22); x.closePath(); x.fill(); }
    }
  };
}

// three sample tubes in a rack: same visual weight as the clock / patient line icons
const TUBES = `<span style="display:inline-block;width:52px;height:52px;color:${INK2};vertical-align:middle"><svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
  [12, 28, 44].map((x0, i) => `<path d="M${x0 - 3} 10h14M${x0} 10v34a4 4 0 0 0 8 0V10"/><path d="M${x0} ${26 + i * 5}h8v18a4 4 0 0 1-8 0Z" fill="currentColor" fill-opacity=".3"/>`).join('') + `<path d="M6 34h52M6 34v20M58 34v20"/></svg></span>`;

const CSS = `<style>
@keyframes mkflow{to{stroke-dashoffset:-36}} .mkflow{animation:mkflow 1.1s linear infinite}
.mk-node>span:first-child{flex-shrink:0} .mk-node{position:absolute;display:flex;gap:16px;align-items:center;padding:14px 22px 14px 16px;border-radius:16px;background:var(--card);border:1px solid var(--line);box-shadow:var(--card-shadow);backdrop-filter:blur(8px);font:600 27px/1.15 var(--sans);color:var(--ink2)}
.mk-chip{display:inline-flex;gap:10px;align-items:center;padding:9px 20px 10px;border-radius:999px;border:1.5px solid ${alpha(INK, .16)};background:rgba(255,255,255,.75);font:600 23px/1 var(--sans);color:var(--mute);transition:all .5s}
.mk-chip b{font:700 18px/1 var(--sans);opacity:.8}
.mk-chip.act{color:var(--ink);background:#fff;box-shadow:0 8px 24px rgba(30,45,80,.14);transform:scale(1.06)}
.mk-panel{left:${PX}px;top:${PY}px;width:${PW}px;height:${PH}px;padding:34px 36px;display:flex;gap:40px}
.mk-panel .num{font:400 120px/1 var(--serif);margin:-10px 0 6px}
.mk-panel h4{font-size:48px;margin-bottom:16px}
.mk-panel p{font-size:30px;line-height:1.35}
.mk-panel .key{position:static;margin-top:auto;font:italic 400 31px/1.3 var(--serif);color:var(--ink);text-shadow:none;max-width:none}
.mk-bar{display:grid;grid-template-columns:232px 1fr;gap:16px;align-items:center;font:600 24px/1 var(--sans);color:var(--ink2);margin-top:20px}
.mk-bar i{display:block;height:22px;border-radius:11px;background:${PAL.gold};width:0;transition:width 1.2s cubic-bezier(.3,0,.2,1)}
</style>`;

// screen px -> world (z = 0) for the fixed camera at z = 10, fov 40
const WH = 2 * 10 * Math.tan(20 * Math.PI / 180), WW = WH * 16 / 9;
const SX = px => (px / 1920 - .5) * WW, SY = py => (.5 - py / 1080) * WH;
// enzyme placement per beat: [screen x, screen y, scale]
const ENZ = { 0: [520, 600, 1.3], 5: [470, 680, 1.22] };
const ALT = { liver: 1, kidney: .42, heart: .16, muscle: .1 }; // relative ALT content (schematic: liver >> kidney > heart > skeletal muscle)
const PER0 = 1.6, PER5 = 5.4;
const bez = (o, a, b, c, k) => { const u = 1 - k; return o.set(u * u * a.x + 2 * u * k * b.x + k * k * c.x, u * u * a.y + 2 * u * k * b.y + k * k * c.y, u * u * a.z + 2 * u * k * b.z + k * k * c.z); };

export default {
  id: 'marker', chapter: 1, beats: 6, title: 'Markatzaile entzimatiko on bat', bloom: .6,
  build(layer) {
    const S = makeScene({ gx: .5, gy: .5, dust: 90 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 40, drift: .03 });
    // ---- the hero enzyme (beat 1) that becomes the lock of the lock-and-key model (beat 6)
    const E = makeDockEnzyme(); this.E = E; this.scene.add(E.group);
    E.group.add(this.sub2 = E.sub.clone()); this.prods = [...E.prod, E.prod[0].clone(), E.prod[1].clone()]; E.group.add(this.prods[2], this.prods[3]);
    this.enzX = new Tw(SX(ENZ[0][0])); this.enzY = new Tw(SY(ENZ[0][1])); this.enzS = new Tw(ENZ[0][2]);
    const shadow = contactShadow({ size: 2.6, opacity: .16 }); shadow.position.set(0, -1.15, 0); E.group.add(shadow);
    // fixed points of the docking paths (enzyme-local)
    const P = E.pocket, d = E.d;
    this.pt = {
      dock: P.clone().addScaledVector(d, .1),
      ent: P.clone().addScaledVector(d, .75),
      s0: P.clone().addScaledVector(d, 1.3).add(V(-.45, 1.0, 0)),
      exitR: P.clone().addScaledVector(d, .9).add(V(1.35, .7, 0)), // products leave towards the "signal" line and vanish before reaching the title
      w0: P.clone().addScaledVector(d, .86).add(V(1.0, -.25, 0)),
      wHit: P.clone().addScaledVector(d, .86),
      w1: P.clone().addScaledVector(d, .86).add(V(.85, -.55, 0)),
      wMid: P.clone().addScaledVector(d, .86).add(V(.5, -.08, 0)),
    };
    this.tp = V(0, 0, 0); this.tq = V(0, 0, 0);
    // ---- glass body with ALT distribution (beat 6)
    const B = makeBody(ALT); this.B = B; this.scene.add(B.group);
    B.group.position.set(SX(1110), SY(690) - .08, 0); this.bodyK = new Tw(0); B.group.scale.setScalar(.001);
    this.spark = new Pts(26); B.group.add(this.spark.mesh); this.cGold = C(COL3.gold);
    this.R = rng(4);

    // ---- text
    layer.insertAdjacentHTML('beforeend', CSS);
    add(layer, `<div class="eyebrow"><b>2</b>Igoeraren jatorria</div>`);
    add(layer, `<div class="h1">Markatzaile entzimatiko <em>erabilgarri</em> bat</div>`);
    // beat 1: the measurement is the starting point; the other data complete the interpretation
    add(layer, `<div class="abs fx d1" data-b="0-0" style="left:${520 - 220}px;top:830px;width:440px;text-align:center">
      <span class="pill" style="color:var(--amber);font-size:27px">Entzima bat neurtzea</span>
      <div style="margin-top:10px;font:italic 400 28px/1 var(--serif);color:var(--ink2);text-shadow:var(--halo)">= abiapuntua</div></div>`);
    const svg = el('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', class: 'fx fade d3', style: 'position:absolute;left:0;top:0;overflow:visible' }); svg.dataset.b = '0-0'; layer.appendChild(svg);
    const NODES = [['tubes', 'beste markatzaileak', 400], ['clock', 'laginaren unea', 600], ['patient', 'datu klinikoak', 800]];
    const IX = 1470, IY = 600;
    const enzPath = `M720 560 C840 200 1300 190 ${IX} ${IY - 30}`;
    el('path', { d: enzPath, fill: 'none', stroke: alpha(PAL.amber, .22), 'stroke-width': 12, 'stroke-linecap': 'round' }, svg);
    el('path', { d: enzPath, fill: 'none', stroke: PAL.amber, 'stroke-width': 5, 'stroke-dasharray': '3 15', 'stroke-linecap': 'round', class: 'mkflow' }, svg);
    NODES.forEach(([, , y]) => {
      const dd = `M1265 ${y} C1360 ${y} 1370 ${IY} ${IX} ${IY}`;
      el('path', { d: dd, fill: 'none', stroke: alpha(INK, .14), 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
      el('path', { d: dd, fill: 'none', stroke: INK2, 'stroke-width': 3.5, 'stroke-dasharray': '3 15', 'stroke-linecap': 'round', class: 'mkflow' }, svg);
    });
    add(layer, `<div class="abs fx d2" data-b="0-0" style="left:880px;top:236px;font:700 24px/1 var(--sans);color:var(--amber);text-shadow:var(--halo);letter-spacing:.5px">jarduera · U/L</div>`);
    NODES.forEach(([ic, txt, y], i) => add(layer, `<div class="mk-node fx pop d${i + 2}" data-b="0-0" style="left:888px;top:${y - 40}px;width:377px;white-space:nowrap">${ic === 'tubes' ? TUBES : icon(ic, 52, INK2)}<span>+ ${txt}</span></div>`));
    add(layer, `<div class="mk-node fx pop d5" data-b="0-0" style="left:${IX}px;top:${IY - 78}px;width:350px;flex-direction:column;gap:10px;padding:22px 20px;border:2px solid ${alpha(INK, .5)}">
      ${icon('target', 64, INK)}<span style="font:700 34px/1 var(--sans);color:var(--ink)">interpretazioa</span></div>`);

    // beats 2-5: one property at a time, big; the others wait as chips in a row
    const cards = [
      ['Ehun-espezifikotasuna', 'Aldaketa jatorri tisular jakin batekin lotzea', 'ALTk jatorria seinalatzen du; LDHk ez', PAL.gold],
      ['Sentikortasuna', 'Ehunaren aldaketak odolean hautematea', 'Markatzaile sentikorrak kalte txikia ere hautematen du', PAL.blue],
      ['Errepikagarritasuna', 'Baldintza berean, emaitza antzekoak', 'Lagin bera, behin eta berriz neurtuta', PAL.teal],
      ['Zehaztasun analitikoa', 'Jarduera katalitikoa fidagarritasunez neurtzea', 'Errepikagarria izatea ez da zehatza izatea', PAL.amber],
    ];
    const chipRow = add(layer, `<div class="abs fx" data-b="1-4" style="left:0;right:0;top:226px;display:flex;justify-content:center;gap:14px"></div>`);
    this.chips = cards.map(([h4], i) => { const c = document.createElement('div'); c.className = 'mk-chip'; c.innerHTML = `<b>${i + 1}</b>${h4}`; c.style.setProperty('--c', cards[i][3]); chipRow.appendChild(c); return c; });
    this.panels = cards.map(([h4, p, key, c], i) => add(layer, `<div class="card mk-panel fx pop" data-b="${i + 1}-${i + 1}">
      <div style="width:470px;display:flex;flex-direction:column">
        <div class="num" style="color:${c}">${i + 1}</div><h4 style="color:${c}">${h4}</h4><p>${p}</p>
        <div class="key" style="border-left:4px solid ${c};padding-left:18px">${key}</div></div>
      <div style="width:${Math.round(CW * SC)}px;height:${Math.round(284 * SC)}px;position:relative"><div class="sim" style="position:absolute;left:0;top:0;width:${CW}px;transform:scale(${SC});transform-origin:0 0"></div></div></div>`));
    const hosts = this.panels.map(c => c.querySelector('.sim'));
    this.sims = [
      simSpec(hosts[0]),
      simSens(hosts[1]),
      simDots(hosts[2], [{ name: 'A metodoa · errepikagarria', mu: 0, sd: 7, col: PAL.teal }, { name: 'B metodoa · sakabanatua', mu: 0, sd: 30, col: MUTE }]),
      simDots(hosts[3], [{ name: 'zehatza', mu: 0, sd: 7, col: PAL.amber }, { name: 'desbideratua', mu: 56, sd: 7, col: MUTE }], { truth: 'egiazko balioa' }),
    ];
    this.b = 0;

    // beat 6: substrate specificity (lock and key, left) vs tissue specificity (ALT in the body, right)
    add(layer, `<div class="card l" data-b="5" style="left:96px;top:250px;width:820px;padding:22px 30px">
      <h4 style="color:var(--teal)">Substratuarekiko espezifikotasuna</h4><p>Entzimak <b style="color:var(--ink)">zer molekulari</b> eragiten dion</p></div>`);
    add(layer, `<div class="card r" data-b="5" style="left:1000px;top:250px;width:824px;padding:22px 30px">
      <h4 style="color:var(--gold)">Ehun-espezifikotasuna</h4><p><b style="color:var(--ink)">Zein ehunetan</b> dagoen eta zenbateraino nagusitzen den</p></div>`);
    add(layer, `<div class="abs" style="left:916px;top:250px;width:84px;height:760px;display:flex;justify-content:center"><div class="fx fade" data-b="5" style="width:2px;height:100%;background:linear-gradient(${alpha(INK, 0)},${alpha(INK, .16)} 15%,${alpha(INK, .16)} 85%,${alpha(INK, 0)})"></div></div>`);
    const bars = [['liver', 'Gibela'], ['kidney', 'Giltzurruna'], ['heart', 'Bihotza'], ['muscle', 'Muskulu eskeletikoa']];
    const bp = add(layer, `<div class="abs fx r d2" data-b="5" style="left:1322px;top:470px;width:510px">
      <div style="font:700 26px/1 var(--sans);color:var(--gold);text-shadow:var(--halo)">ALT ehunetan <span style="font:400 20px/1 var(--sans);color:var(--mute)">· eskematikoa</span></div>
      ${bars.map(([k, n]) => `<div class="mk-bar"><span>${n}</span><div style="height:22px;border-radius:11px;background:${alpha(PAL.gold, .1)}"><i data-k="${k}"></i></div></div>`).join('')}</div>`);
    this.barEls = [...bp.querySelectorAll('i')];
    this.labs = [
      new Label(layer, 'substratua ✓', { color: PAL.teal, b: '5' }),
      new Label(layer, '✗ ez da sartzen', { color: PAL.violet, b: '5' }),
      new Label(layer, 'gune aktiboa', { color: PAL.teal, anchor: P.clone().addScaledVector(E.e, -.5).addScaledVector(d, -.1).add(V(0, -.12, 0)), obj: E.group, side: 'l', b: '5' }),
      // organs named on the body, same order as the bars
      ...[['liver', 'Gibela', 'l'], ['kidney', 'Giltzurrunak', 'r'], ['heart', 'Bihotza', 'r'], ['muscle', 'Muskulua', 'l']].map(([k, n, sd]) => {
        const o = this.B.organs.find(z => z.key === k), m = o.meshes[0];
        const a = m.position.clone(); a.x += sd === 'l' ? -m.scale.x * 1.05 : m.scale.x * 1.05;
        if (k === 'kidney') a.copy(o.meshes[1].position).add(V(.07, 0, 0));
        if (k === 'muscle') a.x = m.position.x - .1;
        return new Label(layer, n, { color: o.level > .5 ? PAL.gold : INK2, anchor: a, obj: this.B.group, side: sd, b: '5' }); }),
    ];
    for (let i = 3; i < 7; i++) this.labs[i].el.querySelector('.t').style.fontSize = '21px';
    this.labs[2].el.classList.add('bg');
    this.m4 = new THREE.Matrix4();
  },
  enter(b) { this.rig.arrive(V(0, 0, 10), V(0, 0, 0), 40); this.beat(b, 0, true); },
  beat(b, dir, instant) {
    this.b = b;
    this.chips.forEach((c, i) => { const on = i + 1 === b; c.classList.toggle('act', on); c.style.color = on ? c.style.getPropertyValue('--c') : ''; c.style.borderColor = on ? c.style.getPropertyValue('--c') : ''; });
    const pose = ENZ[b];
    const d = instant ? 0 : 1.3;
    if (pose) { this.enzX.to(SX(pose[0]), d, ease.io); this.enzY.to(SY(pose[1]), d, ease.io); this.enzS.to(pose[2], instant ? 0 : 1.1, ease.out); }
    else this.enzS.to(0, instant ? 0 : .7, ease.in);
    this.bodyK.to(b === 5 ? 1 : 0, instant ? 0 : 1.2, b === 5 ? ease.out : ease.in);
    if (b === 5 && this.t5 == null) this.t5 = -1; // restart the docking cycle on arrival
    if (b !== 5) this.t5 = null;
    this.barEls.forEach((e, i) => { e.style.transitionDelay = b === 5 ? (.5 + i * .15) + 's' : '0s'; e.style.width = b === 5 ? (ALT[e.dataset.k] * 100).toFixed(0) + '%' : '0'; });
  },
  // place one moving piece (enzyme-local) with a scale
  put(m, p, s) { m.position.copy(p); m.scale.setScalar(Math.max(.001, s)); m.visible = s > .002; },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    const E = this.E, pt = this.pt, b = this.b;
    // enzyme pose
    const es = this.enzS.v; E.group.visible = es > .01;
    E.group.position.set(this.enzX.v, this.enzY.v + Math.sin(t * .7) * .03, 0); E.group.scale.setScalar(Math.max(.001, es));
    E.group.rotation.set(Math.sin(t * .4) * .05, Math.sin(t * .31) * .08 - .1, 0);
    for (const m of [E.sub, this.sub2, ...this.prods, E.wrong]) m.visible = false;
    let flash = 0;
    const subVis = [0, 0];
    if (E.group.visible && b === 0) {
      // a steady stream of turnovers: substrate docks, is converted, two products leave towards the "signal" line
      for (let j = 0; j < 2; j++) {
        const ev = Math.floor(t / PER0) - j, u = t - ev * PER0, sub = j ? this.sub2 : E.sub, odd = ((ev % 2) + 2) % 2;
        if (u < 1.2) { const k = ease.io(u / 1.2); bez(this.tp, pt.s0, pt.ent, pt.dock, k); this.put(sub, this.tp, clamp(u * 4)); }
        else if (u < 1.6) { this.put(sub, pt.dock, 1); flash = Math.max(flash, Math.sin((u - 1.2) / .4 * Math.PI)); }
        else if (u < 2.9) { const k = (u - 1.6) / 1.3;
          for (let q = 0; q < 2; q++) { const pr = this.prods[odd * 2 + q]; bez(this.tp, pt.dock, pt.ent, pt.exitR, ease.out(k)); this.tp.addScaledVector(E.e, (q ? .16 : -.16) * (1 + k * 2)); this.tp.y += (q ? .1 : -.1) * k;
            this.put(pr, this.tp, clamp((1 - k) * 4)); pr.rotation.z = k * (q ? 2 : -2); } }
      }
    }
    if (E.group.visible && b === 5) {
      if (this.t5 === -1) this.t5 = t;
      const u = (t - this.t5) % PER5;
      // the right substrate fits the slot and is converted
      if (u < 1.4) { bez(this.tp, pt.s0, pt.ent, pt.dock, ease.io(u / 1.4)); this.put(E.sub, this.tp, clamp(u * 4)); subVis[0] = clamp(u * 3); }
      else if (u < 2.1) { this.put(E.sub, pt.dock, 1); flash = Math.sin((u - 1.4) / .7 * Math.PI); subVis[0] = 1; }
      else if (u < 3.3) { const k = (u - 2.1) / 1.2;
        for (let q = 0; q < 2; q++) { const pr = this.prods[q]; this.tp.lerpVectors(pt.dock, pt.ent, ease.out(clamp(k * 2))); this.tp.addScaledVector(E.d, k * 1.2).addScaledVector(E.e, (q ? .16 : -.16) + (q ? 1 : -1) * k * .9);
          this.put(pr, this.tp, clamp((1 - k) * 3)); pr.rotation.z = k * (q ? 2 : -2); } }
      // a molecule of the wrong shape bumps against the rim and bounces off
      const w = E.wrong;
      if (u > 2.6 && u < 5.2) {
        let s = 1, sq = 0;
        if (u < 3.7) { const k = ease.in(clamp((u - 2.6) / 1.1)); bez(this.tp, pt.w0, pt.wMid, pt.wHit, k); s = clamp((u - 2.6) * 3); }
        else if (u < 3.9) { this.tp.copy(pt.wHit); sq = Math.sin((u - 3.7) / .2 * Math.PI); }
        else { const k = ease.out(clamp((u - 3.9) / 1.3)); this.tp.lerpVectors(pt.wHit, pt.w1, k); s = 1 - clamp((u - 4.6) / .6); w.rotation.z = k * 4; w.rotation.x = k * 2; }
        if (u < 3.9) { w.rotation.z = Math.sin(t * 2) * .3; w.rotation.x = .3; }
        this.put(w, this.tp, s); const ws = s * 1.3; w.scale.set(ws * (1 + sq * .18), ws * (1 - sq * .22), ws);
        subVis[1] = clamp((u - 2.8) * 3) * (1 - clamp((u - 4.8) * 3));
      }
    }
    E.siteHalo.material.opacity = flash * .7;
    E.mesh.scale.setScalar(1 + flash * .025);
    if (subVis[0]) E.sub.getWorldPosition(this.labs[0].anchor).y += .42 * es;
    if (subVis[1]) E.wrong.getWorldPosition(this.labs[1].anchor).y += .3 * es; // label above the molecule: it never reaches the divider
    this.labs[0].vis = subVis[0]; this.labs[1].vis = subVis[1]; this.labs[2].vis = E.group.visible && b === 5 ? 1 : 0;
    // body: organs glow by their ALT content; ALT-coloured specks drift off the liver
    const bk = this.bodyK.v, B = this.B; B.group.visible = bk > .01; B.group.scale.setScalar(Math.max(.001, bk * 1.28));
    if (B.group.visible) {
      B.group.rotation.y = Math.sin(t * .35) * .22;
      for (const o of B.organs) o.halo.material.opacity = o.level * (.42 + .14 * Math.sin(t * 2 + o.ph)) * bk;
      const L = B.organs[0].meshes[0].position;
      for (let i = 0; i < 26; i++) { const u = (t * .25 + i / 26) % 1, a = i * 2.4;
        this.spark.set(i, L.x + Math.cos(a) * (.12 + u * .35), L.y + Math.sin(a * 1.3) * .08 + u * .25, L.z + .12 + Math.sin(a) * .1, .05, this.cGold, Math.sin(u * Math.PI) * .9 * bk); }
      this.spark.commit();
    }
    for (let i = 3; i < 7; i++) this.labs[i].vis = clamp(bk * 2 - 1);
    for (const l of this.labs) l.update(this.camera);
    // run only the simulation that is on stage
    if (b >= 1 && b <= 4) this.sims[b - 1](dt, t);
  },
};
