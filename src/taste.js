// My Meta: a scoring learned from your "this one's better" picks (a Bradley-Terry model, fitted by MAP logistic
// regression). P(A beats B) = σ(w·(x_A − x_B)), x = tasteFeatures (the house meta, every tier step held, position, height,
// speed and agility). The prior pulls each weight toward a starting point: the house meta (house weight 1, every
// adjustment 0) unless you start from scratch. With few picks it stays close to that start; every pick moves it.
import { attributes, name as label } from './engine.js';
import { byName, metaScore, tasteFeatures, tasteRaw, TASTE_SCALE } from './breakpoints.js';

export const TASTE_KEY = 'build-lab.taste.v1';
export const TASTE_EVENT = 'build-lab-taste'; // fired when My Meta's picks change, so the Lab re-reads them
export const emptyTaste = () => ({ pool: [], picks: [], settings: { fromHouse: true, trust: 1 }, manual: {} });

// Prior per kind of weight: [mean, standard deviation]. A tier step of 0.35 ≈ 3.5 meta points either way before any pick.
export const PRIOR = { house: [1, 0.35], tier: [0, 0.25], pos: [0, 0.4], h: [0, 0.3], h2: [0, 0.2], speed: [0, 0.35], agility: [0, 0.35] };
export const kindOf = k => k === 'house' ? 'house' : k.startsWith('pos:') ? 'pos' : k in PRIOR ? k : 'tier';
export function priorOf(k, settings = {}) {
  const [mu, sd] = PRIOR[kindOf(k)];
  // trust: how hard the start holds (2 = twice as stiff, 0.5 = moves twice as easily).
  return [k === 'house' && settings.fromHouse === false ? 0 : mu, sd / Math.sqrt(Math.max(0.05, settings.trust ?? 1))];
}

const featureCache = new Map();
export function featuresOf(item) {
  const key = item.id ?? item.body.position + item.body.height + item.final.join();
  if (!featureCache.has(key)) featureCache.set(key, tasteFeatures(item.final, item.body.height, item.body.position));
  const x = featureCache.get(key);
  return x;
}
const sigmoid = z => 1 / (1 + Math.exp(-z));

// pairs: [{ a, b, y }] with a/b pool items and y = 1 (a better), 0 (b better), 0.5 (about the same).
// Returns weights (prior means for anything the picks never touched) plus your manual nudges on top.
export function fitTaste(pairs, settings = {}, manual = {}, { iterations = 300 } = {}) {
  const fromScratch = settings.fromHouse === false;
  const diffs = pairs.map(({ a, b, y }) => {
    const xa = featuresOf(a), xb = featuresOf(b), d = {};
    for (const k in xa) d[k] = (d[k] ?? 0) + xa[k];
    for (const k in xb) d[k] = (d[k] ?? 0) - xb[k];
    for (const k in d) if (d[k] === 0 || (fromScratch && k === 'house')) delete d[k];
    return { d, y };
  });
  const keys = [...new Set(['house', ...diffs.flatMap(x => Object.keys(x.d))])], n = keys.length, at = new Map(keys.map((k, i) => [k, i]));
  const mu = keys.map(k => priorOf(k, settings)[0]), prec = keys.map(k => 1 / priorOf(k, settings)[1] ** 2);
  const rows = diffs.map(({ d, y }) => ({ y, ix: Object.keys(d).map(k => at.get(k)), v: Object.values(d) }));
  const w = [...mu];
  // Newton's method (the loss is convex and smooth): a few exact steps, each solving H·step = gradient by Cholesky.
  for (let it = 0; it < Math.min(iterations, 25); it++) {
    const g = w.map((x, i) => -(x - mu[i]) * prec[i]);
    const H = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = prec[i]; return r; });
    for (const { y, ix, v } of rows) {
      let z = 0;
      for (let j = 0; j < ix.length; j++) z += w[ix[j]] * v[j];
      const p = sigmoid(z), r = y - p, c = p * (1 - p);
      for (let j = 0; j < ix.length; j++) {
        g[ix[j]] += r * v[j];
        for (let l = 0; l < ix.length; l++) H[ix[j]][ix[l]] += c * v[j] * v[l];
      }
    }
    const step = cholSolve(H, g);
    let moved = 0;
    for (let i = 0; i < n; i++) { w[i] += step[i]; moved = Math.max(moved, Math.abs(step[i])); }
    if (moved < 1e-7) break;
  }
  const out = Object.fromEntries(keys.map((k, i) => [k, w[i]]));
  if (fromScratch) out.house = 0;
  for (const [k, v] of Object.entries(manual)) out[k] = (out[k] ?? priorOf(k, settings)[0]) + v;
  return out;
}
// Solve A·x = b for a symmetric positive-definite A (Cholesky, in place on a copy).
function cholSolve(A, b) {
  const n = b.length, L = A.map(r => Float64Array.from(r));
  for (let j = 0; j < n; j++) {
    let d = L[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    L[j][j] = Math.sqrt(Math.max(d, 1e-12));
    for (let i = j + 1; i < n; i++) {
      let s = L[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

export const scoreOf = (item, w) => TASTE_SCALE * tasteRaw(featuresOf(item), w);
const houseOf = item => metaScore(item.final, item.body.height, item.body.position);

// How well it predicts you: share of decided picks (not "about the same") each side gets right. The house: its own meta
// score. Yours: k-fold, so each pick is predicted by a model that never saw it.
export function agreement(pairs, settings = {}, manual = {}, folds = 5) {
  const decided = pairs.filter(p => p.y !== 0.5);
  if (!decided.length) return null;
  const right = (p, sa, sb) => (sa > sb) === (p.y === 1) && sa !== sb;
  const house = decided.filter(p => right(p, houseOf(p.a), houseOf(p.b))).length / decided.length;
  let hits = 0;
  if (decided.length >= folds * 2) {
    decided.forEach((p, n) => { p._fold = n % folds; });
    for (let f = 0; f < folds; f++) {
      const w = fitTaste(pairs.filter(p => p._fold !== f), settings, manual, { iterations: 150 });
      hits += decided.filter(p => p._fold === f && right(p, scoreOf(p.a, w), scoreOf(p.b, w))).length;
    }
  }
  return { house, mine: decided.length >= folds * 2 ? hits / decided.length : null, decided: decided.length };
}

// Builds that are basically the same aren't a useful question.
const distance = (a, b) => a.final.reduce((s, v, i) => s + Math.abs(v - b.final[i]), 0) + 4 * Math.abs(a.body.height - b.body.height);

// The next matchup: two builds the model can't separate (its closest call teaches it the most), that you haven't compared
// yet, that differ enough to judge, leaning toward builds you've seen less. One in five is random, so it doesn't only
// ever ask about one corner of the meta.
export function nextPair(pool, picks, w, rand = Math.random) {
  if (pool.length < 2) return null;
  const seen = new Map(), asked = new Set();
  for (const p of picks) { seen.set(p.a, (seen.get(p.a) ?? 0) + 1); seen.set(p.b, (seen.get(p.b) ?? 0) + 1); asked.add([p.a, p.b].sort().join('|')); }
  const score = new Map(pool.map(x => [x.id, scoreOf(x, w)]));
  const explore = rand() < 0.2;
  let best = null;
  for (let n = 0; n < 600; n++) {
    const a = pool[Math.floor(rand() * pool.length)], b = pool[Math.floor(rand() * pool.length)];
    if (a === b || asked.has([a.id, b.id].sort().join('|')) || distance(a, b) < 12) continue;
    const close = Math.abs(score.get(a.id) - score.get(b.id)) / TASTE_SCALE;
    const value = explore ? rand() : -close - 0.15 * ((seen.get(a.id) ?? 0) + (seen.get(b.id) ?? 0));
    if (!best || value > best.value) best = { a, b, value };
  }
  return best && (rand() < 0.5 ? [best.a, best.b] : [best.b, best.a]);
}

// A weight in words.
const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold', 'Hall of Fame'];
const POS_NAMES = { PG: 'Point guards', SG: 'Shooting guards', SF: 'Small forwards', PF: 'Power forwards', C: 'Centers' };
export function featureLabel(k) {
  if (k === 'house') return 'The house meta';
  if (k.startsWith('pos:')) return POS_NAMES[k.slice(4)] ?? k.slice(4);
  if (k === 'h') return 'Taller (per 4")';
  if (k === 'h2') return 'Height near 6\'8" (vs extremes)';
  if (k === 'speed' || k === 'agility') return `${label(k)} (per 10)`;
  const [name, tier] = k.split(':'), g = byName[name];
  if (!g) return k;
  const nm = g.label ?? label(name).replace(/^Takeover /, '');
  const kind = g.discipline === 'takeover' ? 'Takeover: ' : '';
  return kind + nm + (g.tiers.length > 1 ? ' ' + TIER_NAMES[+tier] : '');
}

// What it learned: every weight that moved off its start, biggest first, in meta points (h2 flipped: positive = likes the
// middle). Each: { key, label, delta, weight, picks } (picks: how many matchups differed on it).
export function learned(w, pairs, settings = {}) {
  const touched = new Map();
  for (const { a, b } of pairs) {
    const xa = featuresOf(a), xb = featuresOf(b);
    for (const k of new Set([...Object.keys(xa), ...Object.keys(xb)])) if ((xa[k] ?? 0) !== (xb[k] ?? 0)) touched.set(k, (touched.get(k) ?? 0) + 1);
  }
  return Object.keys(w).map(k => {
    const delta = (w[k] - priorOf(k, settings)[0]) * (k === 'house' ? 1 : TASTE_SCALE) * (k === 'h2' ? -1 : 1);
    return { key: k, label: featureLabel(k), delta, weight: w[k], picks: touched.get(k) ?? 0 };
  }).filter(x => Math.abs(x.delta) >= 0.05).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// What differs between two builds, for the matchup: tier steps one has that the other doesn't, and ratings 3+ apart.
export function differences(a, b) {
  const xa = featuresOf(a), xb = featuresOf(b);
  const tiers = x => { const top = {}; for (const k in x) { const [n, t] = k.split(':'); if (t && byName[n]) top[n] = Math.max(top[n] ?? 0, +t); } return top; };
  const ta = tiers(xa), tb = tiers(xb);
  const only = (p, q) => Object.entries(p).filter(([n, t]) => (q[n] ?? 0) < t).map(([n, t]) => ({ name: n, tier: t, from: q[n] ?? 0,
    label: featureLabel(`${n}:${t}`) })).sort((x, y) => y.tier - x.tier);
  const ratings = attributes.map(at => ({ i: at.index, name: at.name, a: a.final[at.index], b: b.final[at.index] })).filter(r => Math.abs(r.a - r.b) >= 3);
  return { onlyA: only(ta, tb), onlyB: only(tb, ta), ratings };
}

// Optimizer weights: only what the search can use, small values dropped.
export const tasteOpts = w => ({ w: Object.fromEntries(Object.entries(w).filter(([, v]) => Math.abs(v) >= 1e-3)) });

// Picks stored by pool id → pairs of items (picks whose builds left the pool are dropped).
export function pairsOf(taste) {
  const byId = new Map(taste.pool.map(x => [x.id, x]));
  return taste.picks.map(p => ({ a: byId.get(p.a), b: byId.get(p.b), y: p.y })).filter(p => p.a && p.b);
}
// The fitted weights for a stored taste, memoized on its picks and settings (the Lab asks on every search).
let memo = { key: null, w: null };
export function fittedTaste(taste) {
  const key = JSON.stringify([taste.picks, taste.settings, taste.manual, taste.pool.length]);
  if (memo.key !== key) memo = { key, w: fitTaste(pairsOf(taste), taste.settings, taste.manual) };
  return memo.w;
}
export function readTaste() {
  try { return { ...emptyTaste(), ...JSON.parse(localStorage.getItem(TASTE_KEY)) }; } catch { return emptyTaste(); }
}
export const MIN_PICKS = 10;
// A stable id for a build in the pool: same body and ratings = same build.
export const poolId = (body, final) => [body.position, body.height, body.weight, body.wingspan, ...final].join('.');
