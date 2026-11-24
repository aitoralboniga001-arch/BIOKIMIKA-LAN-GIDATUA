// 0 · Title helper — a low, live "activity" trace along the bottom of the cover, written by the turnover events in the loupe.
// The baseline sits exactly where the loading screen's progress line was, so the loader hands off into it.
import { add, Tw, ease, clamp } from '../core.js';
import { PAL } from '../theme.js';

export const TRACE = { x: 120, y: 930, w: 1680, h: 96 }; // stage px; baseline at y + h - 8 (= 1018), mirrored in style.css #loading

export function makeTrace(layer) {
  const { x, y, w, h } = TRACE, S = Math.min(1.25,window.devicePixelRatio || 1), speed = 105, HZ = 30;
  const el = add(layer, `<div class="abs cv-trace" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">
    <canvas width="${w * S}" height="${h * S}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    <div class="cv-read mono"><span class="k">jarduera</span><span class="sep">·</span><b>32</b><span class="u sch">eskematikoa</span></div></div>`);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), num = el.querySelector('b'), read = el.querySelector('.cv-read');
  const N = Math.ceil(w / speed * HZ) + 8, buf = new Float32Array(N);
  let head = 0, acc = 0, imp = 0, out = 0, rate = 2.4, shown = 31, nextTick = 0, nextPaint = 0, tt = 0;
  const events = []; // recent event times
  const base = h - 8, amp = (h - 22) * .62;
  const headK = new Tw(1);
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  function sample() {
    out += (imp - out) * .42; imp *= .76;
    const lvl = .16 + .12 * Math.min(1.6, rate / 2.4) + .025 * Math.sin(tt * .7) + .012 * Math.sin(tt * 2.3 + 1);
    head = (head + 1) % N; buf[head] = lvl + out + (rnd() - .5) * .012;
  }
  for (let i = 0; i < N; i++) { tt += 1 / HZ; sample(); }
  const grad = ctx.createLinearGradient(0, base - amp, 0, base);
  grad.addColorStop(0, 'rgba(184,101,10,.16)'); grad.addColorStop(1, 'rgba(184,101,10,0)');
  const fade = ctx.createLinearGradient(0, 0, 150, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  const pts = new Float32Array(N * 2);

  return {
    el,
    pulse(a = 1) { imp += (.32 + rnd() * .3) * a; events.push(tt); },
    intro(delay) { headK.set(0).to(1, 2.4, ease.out, delay); },
    skip() { headK.set(1); },
    update(dt, t) {
      acc += dt; while (acc >= 1 / HZ) { acc -= 1 / HZ; tt += 1 / HZ; sample(); }
      while (events.length && events[0] < tt - 6) events.shift();
      if (t > nextTick) { // the readout ticks a couple of times per second, easing towards the measured rate
        nextTick = t + .6; rate += (events.length / 6 - rate) * .5;
        const target = Math.round(12 + rate * 8); shown += Math.sign(target - shown) * Math.min(2, Math.abs(target - shown));
        num.textContent = shown;
      }
      if(t<nextPaint && t>nextPaint-.1) return;
      nextPaint=t+1/HZ-.001;
      const hk = headK.v, hx = 4 + (w - 12) * hk;
      read.style.opacity = clamp((hk - .75) / .25);
      ctx.setTransform(S, 0, 0, S, 0, 0); ctx.clearRect(0, 0, w, h);
      // trace points, newest at the write head, scrolling left
      let n = 0;
      for (let i = 0; i < N; i++) {
        const px = hx - (i / HZ + acc) * speed; if (px < -4) break;
        pts[n * 2] = px; pts[n * 2 + 1] = base - buf[(head - i + N) % N] * amp; n++;
      }
      if (n > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
        ctx.lineTo(pts[(n - 1) * 2], base); ctx.lineTo(pts[0], base); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.7; ctx.strokeStyle = 'rgba(58,70,92,.82)'; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = fade; ctx.fillRect(0, 0, 150, h); ctx.globalCompositeOperation = 'source-over';
      // Keep individual turnover events visible underneath the signal they generated.
      ctx.strokeStyle = 'rgba(155,85,23,.68)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (const event of events) {
        const x = hx - (tt - event) * speed;
        if (x < 0) continue;
        ctx.moveTo(x, base + 2); ctx.lineTo(x, base + 7);
      }
      ctx.stroke();
      // baseline hairline (same weight and place as the loader line) and the write head
      ctx.fillStyle = 'rgba(20,32,51,.16)'; ctx.fillRect(0, base - .5, w, 1);
      if (n) {
        const hy = pts[1];
        ctx.fillStyle = 'rgba(184,101,10,.16)'; ctx.beginPath(); ctx.arc(hx, hy, 8 + 2 * Math.sin(t * 3), 0, 6.283); ctx.fill();
        ctx.fillStyle = PAL.amber; ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, 6.283); ctx.fill();
      }
    },
  };
}
