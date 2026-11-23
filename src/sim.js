// Shared simulation models. Everything on screen that shows a plasma activity over time should read
// from one of these, so the curve, the tube level, the flow arrows and the numbers always agree.

// ---------------------------------------------------------------- one-compartment balance
// Plasma activity A(t) obeys  dA/dt = release(t) − k·A  (arrival from the tissue minus removal).
// Time is normalised to 0..1 across the chart. Before the lesion the plasma sits at `base`, kept there by
// a basal release equal to k·base. The lesion adds a release pulse that starts at `onset`, peaks
// `tRise` later and fades with shape exponent `shape`. The excess is scaled so the activity peaks at `peak`.
// k is the elimination constant in "per chart width": larger k = faster clearance = earlier, narrower curve.
// Returns lookup functions (linear interpolation over a precomputed table):
//   A(t)    plasma activity            rel(t)  arrival rate (basal + lesion)
//   elim(t) removal rate = k·A(t)      tPeak   time of the activity maximum
export function balanceModel({ base = .06, peak = .8, k = 8, onset = .02, tRise = .06, shape = 1.6, n = 1200 } = {}) {
  const pulse = t => { const u = t - onset; if (u <= 0) return 0; const x = u / tRise; return Math.pow(x, shape) * Math.exp(shape * (1 - x)); };
  // integrate the excess (linear ODE, so it can be scaled afterwards) with RK4
  const h = 1 / n, ex = new Float32Array(n + 1);
  let y = 0;
  const f = (t, y) => pulse(t) - k * y;
  for (let i = 0; i < n; i++) {
    const t = i * h;
    const k1 = f(t, y), k2 = f(t + h / 2, y + h * k1 / 2), k3 = f(t + h / 2, y + h * k2 / 2), k4 = f(t + h, y + h * k3);
    y += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6; ex[i + 1] = y;
  }
  let mx = 0, iPk = 0; for (let i = 0; i <= n; i++) if (ex[i] > mx) { mx = ex[i]; iPk = i; }
  const s = mx > 0 ? (peak - base) / mx : 0;
  const look = (arr, t) => { const x = Math.min(n, Math.max(0, t * n)), i = Math.floor(x), fr = x - i; return i >= n ? arr[n] : arr[i] + (arr[i + 1] - arr[i]) * fr; };
  const A = t => base + s * look(ex, t);
  return {
    A,
    rel: t => k * base + s * pulse(t),
    elim: t => k * A(t),
    tPeak: iPk / n,
    params: { base, peak, k, onset, tRise, shape },
  };
}

// half-life (in chart widths) that matches an elimination constant, for captions like "t½"
export const halfLife = k => Math.LN2 / k;

// ---------------------------------------------------------------- random subunit assembly (isoenzymes)
// Subunits of two kinds (e.g. M/B for CK dimers, H/M for LDH tetramers) associate at random.
// With a fraction p of the first kind, the share of each form follows the binomial expansion:
// dimers p², 2pq, q²; tetramers p⁴, 4p³q, 6p²q², 4pq³, q⁴. Returns the shares, first-kind-richest first.
export function binomialShares(p, size) {
  const q = 1 - p, out = [];
  const C = (n, r) => { let c = 1; for (let i = 0; i < r; i++) c = c * (n - i) / (i + 1); return c; };
  for (let j = 0; j <= size; j++) out.push(C(size, j) * Math.pow(p, size - j) * Math.pow(q, j));
  return out;
}
