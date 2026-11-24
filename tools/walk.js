// pasted into the page: forward/backward walk with per-frame CPU / GPU timing and linkProgram counting
window.__H = (() => {
  const c = document.getElementById('gl'), gl = c.getContext('webgl2'), px = new Uint8Array(4);
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const H = { links: 0, rows: [], done: false, log: [] };
  if (!WebGL2RenderingContext.prototype.__lp) {
    const o = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.__lp = o;
    WebGL2RenderingContext.prototype.linkProgram = function (p) { window.__H && window.__H.links++; window.__H && window.__H.log.push(window.__H.where); return o.call(this, p); };
  }
  function st() { drain(); const t0 = performance.now(); __pres.step(1); const t1 = performance.now(); drain(); const t2 = performance.now(); return [t1 - t0, t2 - t1]; }
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(1) : 0; };
  H.walk = async (dir = 1, steady = 12) => {
    H.rows = []; H.done = false;
    const S = __pres.SLIDES; let guard = 0;
    while (guard++ < 200) {
      const s0 = __pres.state.si, b0 = __pres.state.bi;
      if (dir > 0 && s0 === S.length - 1 && b0 === S[s0].beats - 1) break;
      if (dir < 0 && s0 === 0 && b0 === 0) break;
      H.where = `${s0 + 1}.${b0 + 1}`;
      dir > 0 ? __pres.next() : __pres.prev();
      const br = [], sd = []; let n = 0;
      // first frame performs the swap (if any)
      br.push(st());
      while (__pres.bridge && n++ < 400) br.push(st());
      for (let i = 0; i < steady; i++) sd.push(st());
      const lab = `${s0 + 1}.${b0 + 1}>${__pres.state.si + 1}.${__pres.state.bi + 1}`;
      const isBr = s0 !== __pres.state.si && br.length > 3;
      H.rows.push({ lab, isBr, nBr: br.length, brCpu: q(br.map(x => x[0]), 1), brGpuMed: q(br.map(x => x[1]), .5), brGpu90: q(br.map(x => x[1]), .9), brGpuMax: q(br.map(x => x[1]), 1),
        sdCpuMax: q(sd.map(x => x[0]), 1), sdGpuMed: q(sd.map(x => x[1]), .5), sdGpuMax: q(sd.map(x => x[1]), 1) });
      await new Promise(r => setTimeout(r, 0));
    }
    H.done = true;
  };
  H.sum = () => {
    const br = H.rows.filter(r => r.isBr);
    return { links: H.links, linkWhere: [...new Set(H.log)].slice(0, 20), n: H.rows.length,
      maxCpu: Math.max(...H.rows.map(r => Math.max(r.brCpu, r.sdCpuMax))), worstCpu: H.rows.map(r => [r.lab, Math.max(r.brCpu, r.sdCpuMax)]).sort((a, b) => b[1] - a[1]).slice(0, 5),
      bridges: br.map(r => `${r.lab} med${r.brGpuMed} p90 ${r.brGpu90} max${r.brGpuMax} cpu${r.brCpu}`),
      steadyGpuMed: Math.max(...H.rows.map(r => r.sdGpuMed)), steadyWorst: H.rows.map(r => [r.lab, r.sdGpuMed]).sort((a, b) => b[1] - a[1]).slice(0, 6) };
  };
  return H;
})();
