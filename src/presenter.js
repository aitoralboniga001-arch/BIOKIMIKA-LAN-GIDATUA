// Presenter view: a second window (laptop screen) with the cue for this click, the next one, and a timer.
// Built by this page into an about:blank popup, so it works when the deck is opened straight from disk.
const CSS = `
*{box-sizing:border-box} body{margin:0;background:#0b1120;color:#F3EADB;font-family:'Segoe UI',system-ui,sans-serif;height:100vh;display:grid;grid-template-rows:auto 1fr auto;}
header{display:flex;align-items:center;gap:18px;padding:14px 22px;border-bottom:1px solid #222c44;}
header .ch{font:600 12px/1 'Segoe UI';letter-spacing:3px;text-transform:uppercase;color:#F2B45A}
header .tt{font:400 24px/1.1 'Sitka Banner',Georgia,serif;flex:1}
header .pos{font:600 15px/1 'Segoe UI';color:#8E9AB4}
.timer{font:600 34px/1 'Cascadia Mono',Consolas,monospace;color:#F3EADB;min-width:130px;text-align:right}
.timer.over{color:#FF7A6B}
main{display:grid;grid-template-columns:1.25fr .75fr;gap:0;min-height:0}
.now{padding:26px 30px;overflow:auto;border-right:1px solid #222c44}
.lbl{font:700 12px/1 'Segoe UI';letter-spacing:3px;text-transform:uppercase;color:#8E9AB4;margin-bottom:14px}
.cue{font:400 27px/1.45 'Segoe UI';white-space:pre-wrap}
.cue b{color:#F2B45A;font-weight:600}
.nx{padding:26px 26px;overflow:auto;opacity:.7}
.nx .cue{font-size:19px}
footer{display:flex;gap:6px;padding:10px 22px 14px;border-top:1px solid #222c44;align-items:center}
footer .seg{flex:1;height:30px;border-radius:5px;background:#151d31;position:relative;overflow:hidden;font:600 11px/30px 'Segoe UI';color:#8E9AB4;padding:0 8px;white-space:nowrap;text-overflow:ellipsis}
footer .seg.cur{outline:1.5px solid #F2B45A;color:#F3EADB}
footer .seg i{position:absolute;left:0;top:0;bottom:0;background:rgba(242,180,90,.18)}
footer .seg span{position:relative}
.keys{font:12px 'Segoe UI';color:#8E9AB4;margin-left:10px;white-space:nowrap}
button{background:#1b2338;color:#F3EADB;border:1px solid #33405e;border-radius:6px;font:600 13px 'Segoe UI';padding:6px 10px;cursor:pointer}
`;
// suggested minutes per chapter (talk script appendix): 1 + 3 + 3 + 2 + 1 = 10
const BUDGET = [1, 3, 3, 2, 1];

export class Presenter {
  constructor({ slides, notes, chapters, onKey, getState }) { Object.assign(this, { slides, notes, chapters, onKey, getState }); this.w = null; this.chStart = {}; }
  open(state) {
    if (this.w && !this.w.closed) { this.w.focus(); return; }
    const w = window.open('', 'aurkezlea', 'width=1100,height=720');
    if (!w) { alert('Baimendu leiho gainerakorrak (pop-up) aurkezlearen ikuspegirako.'); return; }
    this.w = w;
    w.document.open();
    w.document.write(`<!doctype html><html lang="eu"><head><meta charset="utf-8"><title>Aurkezlea · Entzimak</title><style>${CSS}</style></head><body>
      <header><div><div class="ch" id="ch"></div><div class="tt" id="tt"></div></div><div style="flex:1"></div><div class="pos" id="pos"></div>
      <button id="rst" title="Kronometroa berrabiarazi">⟲</button><div class="timer" id="tm">00:00</div></header>
      <main><section class="now"><div class="lbl">Orain pantailan · esan</div><div class="cue" id="cue"></div></section>
      <section class="nx"><div class="lbl">Hurrengo klika</div><div class="cue" id="nx"></div></section></main>
      <footer id="ft"></footer></body></html>`);
    w.document.close();
    w.document.addEventListener('keydown', e => this.onKey(e));
    w.document.getElementById('rst').onclick = () => { this.getState().t0 = performance.now(); this.tick(); };
    const ft = w.document.getElementById('ft');
    this.segs = this.chapters.map((c, i) => { const d = w.document.createElement('div'); d.className = 'seg'; d.innerHTML = `<i></i><span>${i + 1}. ${c} · ${BUDGET[i]}′</span>`; ft.appendChild(d); return d; });
    const k = w.document.createElement('div'); k.className = 'keys'; k.textContent = '→ hurrengoa · ← aurrekoa · B beltza'; ft.appendChild(k);
    clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 500);
    this.update(state);
  }
  cueOf(si, bi) {
    const s = this.slides[si]; if (!s) return '— amaiera —';
    const n = (this.notes[s.id] || [])[bi] || '';
    return n.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  update(state) {
    const w = this.w; if (!w || w.closed) return;
    const d = w.document, s = this.slides[state.si];
    d.getElementById('ch').textContent = s.chapter >= 0 ? `${s.chapter + 1}. ${this.chapters[s.chapter]}` : 'Hasiera';
    d.getElementById('tt').textContent = s.title;
    d.getElementById('pos').textContent = `${state.si + 1}/${this.slides.length} · klika ${state.bi + 1}/${s.beats}`;
    d.getElementById('cue').innerHTML = this.cueOf(state.si, state.bi);
    let ns = state.si, nb = state.bi + 1; if (nb >= s.beats) { ns++; nb = 0; }
    const nslide = this.slides[ns];
    d.getElementById('nx').innerHTML = nslide ? (ns !== state.si ? `<b>▸ ${nslide.title}</b>\n` : '') + this.cueOf(ns, nb) : '— amaiera —';
    if (s.chapter >= 0 && this.chStart[s.chapter] == null && state.t0 != null) this.chStart[s.chapter] = performance.now();
    this.segs.forEach((e, i) => e.classList.toggle('cur', i === s.chapter));
    this.tick();
  }
  tick() {
    const w = this.w; if (!w || w.closed) { clearInterval(this.iv); return; }
    const st = this.getState(); const el = w.document.getElementById('tm');
    const sec = st.t0 == null ? 0 : Math.floor((performance.now() - st.t0) / 1000);
    el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    el.classList.toggle('over', sec > 600);
    // chapter fill = elapsed share of the cumulative budget
    let acc = 0; this.segs.forEach((e, i) => { const a = acc * 60, b = (acc + BUDGET[i]) * 60; acc += BUDGET[i]; const f = Math.max(0, Math.min(1, (sec - a) / (b - a))); e.querySelector('i').style.width = (f * 100) + '%'; });
  }
}
