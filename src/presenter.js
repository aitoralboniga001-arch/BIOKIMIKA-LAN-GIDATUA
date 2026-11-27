// Presenter view: a second window (laptop screen) with the cue for this click, the next one, who speaks, a timer with a
// traffic light against the script's time budget, and a rehearsal mode (R) that records real times per click.
// Built by this page into an about:blank popup, so it works when the deck is opened straight from disk.
import { SPEAKERS } from './notes.js';

const font = f => new URL('vendor/fonts/' + f, location.href).href;
const CSS = () => `
@font-face{font-family:Inter;src:url(${font('Inter.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:Newsreader;src:url(${font('Newsreader-Roman.woff2')}) format('woff2');font-weight:300 700}
@font-face{font-family:'JetBrains Mono';src:url(${font('JetBrainsMono-500.woff2')}) format('woff2');font-weight:500}
:root{--bg:#0d1322;--panel:#131b2e;--line:#232d45;--ink:#F1ECE3;--mute:#8F9AB3;--acc:#F2B45A;--ok:#3CC48A;--warn:#F2B45A;--bad:#FF6F61}
body.light{--bg:#FBF9F5;--panel:#F1EEE8;--line:#E0DBD2;--ink:#142033;--mute:#5F6A82;--acc:#A65A08;--ok:#1F9A63;--warn:#B8650A;--bad:#C0283D}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,'Segoe UI',system-ui,sans-serif;height:100vh;display:grid;grid-template-rows:auto 1fr auto;font-feature-settings:'cv11'}
header{display:flex;align-items:center;gap:22px;padding:16px 26px;border-bottom:1px solid var(--line)}
.ch{font:600 13px/1 Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.tt{font:400 28px/1.1 Newsreader,Georgia,serif;margin-top:6px}
.who{font:600 15px/1.2 Inter,sans-serif;color:var(--mute);margin-top:6px}.who b{color:var(--ink)}
.hand{display:none;margin-top:6px;font:700 14px/1 Inter;color:var(--warn);letter-spacing:.04em}.hand.on{display:block}
.pos{font:500 15px/1 'JetBrains Mono',monospace;color:var(--mute);text-align:right;line-height:1.5}
.clock{display:flex;align-items:center;gap:14px}
.light-dot{width:20px;height:20px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 25%,transparent)}
.light-dot.amber{background:var(--warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--warn) 25%,transparent)}
.light-dot.red{background:var(--bad);box-shadow:0 0 0 4px color-mix(in srgb,var(--bad) 25%,transparent)}
.timer{font:500 40px/1 'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;min-width:140px;text-align:right}
.target{font:500 14px/1.3 'JetBrains Mono',monospace;color:var(--mute);text-align:right}
main{display:grid;grid-template-columns:1.35fr .65fr;min-height:0}
.now{padding:28px 34px;overflow:auto;border-right:1px solid var(--line)}
.lbl{font:600 12px/1 Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin-bottom:16px}
.cue{font:400 30px/1.42 Inter,sans-serif;white-space:pre-wrap;letter-spacing:-.005em}
.cue b{color:var(--acc);font-weight:600}
.nx{padding:24px 26px;overflow:auto}
.nx img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:var(--panel);margin-bottom:16px}
#sample-keys{margin:-10px 0 20px;color:var(--mute);font:500 13px/1.4 Inter}
.stage-actions{display:flex;gap:6px;margin:-6px 0 22px;flex-wrap:wrap}
.stage-actions [aria-pressed=true]{color:var(--acc);border-color:var(--acc)}#current-preview{cursor:crosshair}
.nx .cue{font-size:19px;line-height:1.45;color:var(--mute)} .nx .cue b{color:var(--ink)}
footer{display:flex;gap:6px;padding:12px 26px 16px;border-top:1px solid var(--line);align-items:center}
.seg{flex:1;height:32px;border-radius:7px;background:var(--panel);position:relative;overflow:hidden;font:600 12px/32px Inter;color:var(--mute);padding:0 10px;white-space:nowrap;text-overflow:ellipsis}
.seg.cur{outline:1.5px solid var(--acc);color:var(--ink)}
.seg i{position:absolute;left:0;top:0;bottom:0;background:color-mix(in srgb,var(--acc) 20%,transparent)}
.seg span{position:relative}
.keys{font:12px Inter;color:var(--mute);margin-left:10px;white-space:nowrap}
button{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:7px;font:600 13px Inter;padding:7px 11px;cursor:pointer}
.rec{display:none;font:700 12px/1 Inter;letter-spacing:.12em;color:var(--bad)}.rec.on{display:block}
#rep{position:fixed;inset:40px;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:26px 30px;overflow:auto;display:none;box-shadow:0 20px 60px rgba(0,0,0,.35)}
#rep.on{display:block} #rep h2{margin:0 0 6px;font:400 30px Newsreader,serif} #rep p{color:var(--mute);margin:0 0 16px}
#rep table{border-collapse:collapse;width:100%;font:15px/1.4 Inter;font-variant-numeric:tabular-nums}
#rep td,#rep th{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left} #rep th{color:var(--mute);font-weight:600}
#rep td.n{text-align:right;font-family:'JetBrains Mono',monospace} #rep tr.over td.n:last-child{color:var(--bad)}
`;
// suggested minutes per chapter (talk script appendix): 1 + 3 + 3 + 2 + 1 = 10; the cover counts toward chapter 1
const BUDGET = [1, 3, 2, 3, 1];  // the infarct example (figure 5, ~1 min) moved from part 3 to the end of part 4
const mmss = s => `${s < 0 ? '−' : ''}${String(Math.floor(Math.abs(s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.abs(s)) % 60).padStart(2, '0')}`;
const LS = 'entzimak.rehearsal';

export class Presenter {
  constructor({ slides, notes, chapters, onKey, getState, stageTools, subpointAt }) {
    Object.assign(this, { slides, notes, chapters, onKey, getState, stageTools, subpointAt }); this.w = null;
    // per-beat target seconds: each chapter's budget spread over that chapter's beats
    this.beats = []; // { si, bi, ch, target, start } in talk order
    const chOf = s => Math.max(0, s.chapter);
    const perCh = BUDGET.map((_, c) => slides.filter(s => chOf(s) === c).reduce((a, s) => a + s.beats, 0));
    let acc = 0;
    slides.forEach((s, si) => { for (let bi = 0; bi < s.beats; bi++) { const c = chOf(s), t = BUDGET[c] * 60 / perCh[c]; this.beats.push({ si, bi, ch: c, target: t, start: acc }); acc += t; } });
    this.index = new Map(this.beats.map((b, i) => [b.si + '.' + b.bi, i]));
    this.rehearse = false; this.rec = null; this.last = null;
  }
  open(state) {
    if (this.w && !this.w.closed) { this.w.focus(); return; }
    const w = window.open('', 'aurkezlea', 'width=1200,height=760');
    if (!w) { alert('Baimendu leiho gainerakorrak (pop-up) aurkezlearen ikuspegirako.'); return; }
    this.mount(w); this.update(state);
  }
  // builds the view into a window (the popup, or any same-origin window for testing)
  mount(w) {
    this.w = w;
    w.document.open();
    w.document.write(`<!doctype html><html lang="eu"><head><meta charset="utf-8"><title>Aurkezlea · Entzimak</title><style>${CSS()}</style></head><body>
      <header><div style="flex:1;min-width:0"><div class="ch" id="ch"></div><div class="tt" id="tt"></div><div class="who" id="who"></div><div class="hand" id="hand"></div></div>
      <div class="pos" id="pos"></div><div class="rec" id="rec">● ENTSEGUA</div>
      <button id="th" title="Gai argia / iluna">◐</button><button id="rst" title="Kronometroa berrabiarazi">⟲</button>
      <div><div class="clock"><div class="light-dot" id="dot"></div><div class="timer" id="tm">00:00</div></div><div class="target" id="tg"></div></div></header>
      <main><section class="now"><div class="lbl">Orain pantailan · esan</div><div class="cue" id="cue"></div></section>
      <section class="nx"><div class="lbl">Uneko lagina · erakutsi</div>
      <img id="current-preview" draggable="false" alt="Uneko diapositiba">
      <div class="stage-actions"><button data-key="l">Laserra</button><button data-key="s">Fokua</button><button data-key="c">Kontrastea</button></div>
      <div id="sample-keys" hidden>Shift + ←/→ · laginaren unea &nbsp; Esc · gidoira itzuli</div>
      <div class="lbl">Hurrengo klika</div><img id="nimg" alt=""><div class="cue" id="nx"></div></section></main>
      <footer id="ft"></footer><div id="rep"></div></body></html>`);
    w.document.close();
    const d = w.document;
    d.addEventListener('keydown', e => {
      if(e.target.closest('button') && (e.key==='Enter'||e.key===' ')) return;
      this.onKey(e);
    });
    const preview=d.getElementById('current-preview');
    preview.onpointermove=e=>{
      if(!this.stageTools.mode)return;
      const r=preview.getBoundingClientRect();
      this.stageTools.point((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
    };
    d.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>this.onKey({key:b.dataset.key,preventDefault(){}}));
    d.getElementById('rst').onclick = () => { this.getState().t0 = performance.now(); this.tick(); };
    d.getElementById('th').onclick = () => { d.body.classList.toggle('light'); try { localStorage.setItem('entzimak.presenterTheme', d.body.classList.contains('light') ? 'light' : 'dark'); } catch {} };
    try { if (localStorage.getItem('entzimak.presenterTheme') === 'light') d.body.classList.add('light'); } catch {}
    const ft = d.getElementById('ft');
    this.segs = this.chapters.map((c, i) => { const e = d.createElement('div'); e.className = 'seg'; e.innerHTML = `<i></i><span>${i + 1}. ${c} · ${BUDGET[i]}′</span>`; ft.appendChild(e); return e; });
    const k = d.createElement('div'); k.className = 'keys'; k.textContent = '→ hurrengoa · ← aurrekoa · B beltza · R entsegua'; ft.appendChild(k);
    clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 500);
  }
  syncTools() {
    if(!this.w || this.w.closed)return;
    this.w.document.querySelectorAll('[data-key]').forEach(b=>{
      const on=b.dataset.key==='c'?document.body.classList.contains('projector'):this.stageTools.mode===b.dataset.key;
      b.setAttribute('aria-pressed',String(on));
    });
  }
  cueOf(si, bi) {
    const s = this.slides[si]; if (!s) return '— amaiera —';
    const n = (this.notes[s.id] || [])[bi] || '';
    return n.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  speaker(si) { const s = this.slides[si]; return s ? (SPEAKERS[Math.max(0, s.chapter)] || '') : ''; }
  update(state) {
    this.record(state);
    const w = this.w; if (!w || w.closed) return;
    const d = w.document, s = this.slides[state.si];
    d.getElementById('ch').textContent = s.chapter >= 0 ? `${s.chapter + 1}. ${this.chapters[s.chapter]}` : 'Hasiera';
    { const sp = this.subpointAt && this.subpointAt(s.id, state.bi); d.getElementById('tt').textContent = sp ? `${sp[0]} · ${sp[1]} — ${s.title}` : s.title; }
    d.getElementById('pos').innerHTML = `${state.si + 1}/${this.slides.length}<br>klika ${state.bi + 1}/${s.beats}${state.autoQ ? '<br>Q automatikoa' : ''}`;
    d.getElementById('cue').innerHTML = this.cueOf(state.si, state.bi);
    let ns = state.si, nb = state.bi + 1; if (nb >= s.beats) { ns++; nb = 0; }
    const nslide = this.slides[ns];
    d.getElementById('nx').innerHTML = nslide ? (ns !== state.si ? `<b>▸ ${nslide.title}</b>\n` : '') + this.cueOf(ns, nb) : '— amaiera —';
    const url=new URL(`fallback/${state.si+1}.${state.bi+1}.jpg`,location.href).href;
    const current=d.getElementById('current-preview');
    if(current.src!==url)current.src=url;
    this.syncTools();
    d.getElementById('sample-keys').hidden=!this.stageTools.getPlot();
    const img = d.getElementById('nimg');
    if (nslide) { img.style.display = ''; img.src = new URL(`fallback/${ns + 1}.${nb + 1}.jpg`, location.href).href; } else img.style.display = 'none';
    // who speaks, and a warning one click before the hand-over (only once the group has filled SPEAKERS in)
    const who = this.speaker(state.si), nwho = nslide ? this.speaker(ns) : '';
    d.getElementById('who').innerHTML = who ? `Hizlaria: <b>${who}</b>` : '';
    const hand = d.getElementById('hand');
    hand.classList.toggle('on', !!(nwho && nwho !== who)); hand.textContent = nwho && nwho !== who ? `Hurrengo klikean txanda: ${nwho} ▸` : '';
    this.segs.forEach((e, i) => e.classList.toggle('cur', i === Math.max(0, s.chapter)));
    this.tick();
  }
  tick() {
    const w = this.w; if (!w || w.closed) { clearInterval(this.iv); return; }
    const st = this.getState(), d = w.document;
    const sec = st.t0 == null ? 0 : (performance.now() - st.t0) / 1000;
    d.getElementById('tm').textContent = mmss(sec);
    // traffic light against the cumulative target at the end of the current click
    const b = this.beats[this.index.get(st.si + '.' + st.bi) ?? 0];
    const due = b.start + b.target, late = sec - due;
    const dot = d.getElementById('dot');
    dot.className = 'light-dot' + (st.t0 == null || late <= 5 ? '' : late <= 20 ? ' amber' : ' red');
    d.getElementById('tg').textContent = st.t0 == null ? `helburua ${mmss(due)}` : `helburua ${mmss(due)} · ${late > 0 ? '+' : ''}${Math.round(late)} s`;
    let acc = 0; this.segs.forEach((e, i) => { const a = acc * 60, z = (acc + BUDGET[i]) * 60; acc += BUDGET[i]; const f = Math.max(0, Math.min(1, (sec - a) / (z - a))); e.querySelector('i').style.width = (f * 100) + '%'; });
    d.getElementById('rec').classList.toggle('on', this.rehearse);
  }

  // ---- rehearsal: R starts recording real seconds per click; R again stops and shows the clicks that ran over
  toggleRehearsal() {
    if (!this.rehearse) {
      this.rehearse = true; this.rec = {}; this.last = null;
      const st = this.getState(); st.t0 = performance.now(); this.record(st);
      const rep = this.w && !this.w.closed && this.w.document.getElementById('rep'); if (rep) rep.classList.remove('on');
    } else {
      this.record(this.getState(), true); this.rehearse = false;
      try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), rec: this.rec })); } catch {}
      this.report();
    }
    this.tick();
  }
  record(state, flush = false) {
    if (!this.rehearse) return;
    const now = performance.now(), key = state.si + '.' + state.bi;
    if (this.last && (flush || this.last.key !== key)) { const k = this.last.key; this.rec[k] = (this.rec[k] || 0) + (now - this.last.t) / 1000; this.last = null; }
    if (!flush && !this.last) this.last = { key, t: now };
    try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), rec: this.rec })); } catch {}
  }
  report() {
    const w = this.w; if (!w || w.closed) return;
    const rows = this.beats.map(b => ({ b, real: this.rec[b.si + '.' + b.bi] || 0 })).filter(r => r.real > 0);
    const total = rows.reduce((a, r) => a + r.real, 0);
    const isOver = r => r.real > r.b.target * 1.25 + 2;
    const over = rows.filter(isOver).sort((x, y) => (y.real - y.b.target) - (x.real - x.b.target));
    const rep = w.document.getElementById('rep');
    rep.innerHTML = `<h2>Entseguaren laburpena</h2><p>Guztira ${mmss(total)} · aurrekontua ${mmss(this.beats.reduce((a, b) => a + b.target, 0))} · ${over.length} klik denbora gainetik (klik egin ixteko)</p>
      <table><tr><th>Klika</th><th>Diapositiba</th><th class="n">Helburua</th><th class="n">Benetakoa</th></tr>
      ${(over.length ? over : rows).map(r => `<tr class="${isOver(r) ? 'over' : ''}"><td>${r.b.si + 1}.${r.b.bi + 1}</td><td>${this.slides[r.b.si].title}</td><td class="n">${Math.round(r.b.target)} s</td><td class="n">${Math.round(r.real)} s</td></tr>`).join('')}</table>`;
    rep.classList.add('on');
    rep.onclick = () => rep.classList.remove('on');
  }
}
