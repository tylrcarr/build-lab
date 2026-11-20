// My Meta: a scoring learned from your choices (a Bradley-Terry model, fitted by MAP logistic regression).
// P(A beats B) = σ(w·(x_A − x_B)). x: tasteFeatures (the house meta, every tier step held, position, height, speed and
// agility), plus
//   families: per attribute, how many badge tier steps the build holds that need it ("fam:pass_accuracy": passing
//     badges), so a lesson about Hook Specialist carries to the other close-shot badges;
//   context copies: the same tier and family terms again, keyed by the kind of build (tasteCtx: guard / wing / big,
//     dunks or not), so "passing over close shot on dunking bigs" can be learned without forcing it onto every build.
//     Shrunk toward 0: a lesson carries everywhere until your choices on another kind of build disagree with it.
// The prior pulls each weight toward the house meta (house weight 1, every adjustment 0) unless you start from scratch.
// Choices come from matchups (two builds) and questions (questions.js: a few versions of one build, differing only in
// a trade); a question answer counts as "the chosen version beat each of the others".
import { attributes, name as label } from './engine.js';
import { byName, goals, metaScore, tasteCtx, tasteFeatures, tasteRaw, TASTE_SCALE } from './breakpoints.js';

export const TASTE_KEY = 'build-lab.taste.v1';
export const TASTE_EVENT = 'build-lab-taste'; // fired when My Meta's picks change, so the Lab re-reads them
export const emptyTaste = () => ({ pool: [], picks: [], answers: [], settings: { fromHouse: true, trust: 1 }, manual: {} });

// Prior per kind of weight: [mean, standard deviation]. A tier step of 0.25 ≈ 2.5 meta points either way before any pick.
// ctx 0.35: on a simulated player who traded close shot for passing on dunking bigs but not on post bigs, 0.2 let the
// dunking-big lesson override them on post bigs even after three answers saying otherwise; 0.35 split after one.
// fam: a family's feature is the share of its tier steps held (0–1), so its weight is "the whole family": sd 0.8 = 8 meta
// points from none to all (per tier step it was 0.2, and Three Point feeds 27 steps: five answers moved shortlists by 25+
// points). Context copies are looser than the shared terms (ctx, ctxfam) so kinds of builds can split on few answers: with
// these, one answer on a post big that disagrees with three on dunking bigs flips post bigs and leaves dunkers alone.
export const PRIOR = { house: [1, 0.35], tier: [0, 0.25], fam: [0, 0.8], ctx: [0, 0.3], ctxfam: [0, 1.4], pos: [0, 0.4], h: [0, 0.3], h2: [0, 0.2],
  speed: [0, 0.35], agility: [0, 0.35], off: [0, 0.3] };
export const kindOf = k => k === 'house' ? 'house' : k.endsWith('|offset') ? 'off' : k.includes('|') ? (k.includes('fam:') ? 'ctxfam' : 'ctx') : k.startsWith('fam:') ? 'fam'
  : k.startsWith('pos:') ? 'pos' : k in PRIOR ? k : 'tier';
// The attributes a badge's requirements use (its families), and each family's size in tier steps.
export const FAMILY = Object.fromEntries(goals.map(g => [g.name, [...new Set(g.tiers.flatMap(t => t.requirements.map(r => r.name)))]]));
const FAMILY_STEPS = {};
for (const g of goals) for (const a of FAMILY[g.name]) FAMILY_STEPS[a] = (FAMILY_STEPS[a] ?? 0) + g.tiers.length;
export const CONTEXTS = ['guard', 'wing', 'big'].flatMap(g => [`${g}|dunk`, `${g}|nodunk`]);
export function priorOf(k, settings = {}) {
  const [mu, sd] = PRIOR[kindOf(k)];
  // trust: how hard the start holds (2 = twice as stiff, 0.5 = moves twice as easily).
  return [k === 'house' && settings.fromHouse === false ? 0 : mu, sd / Math.sqrt(Math.max(0.05, settings.trust ?? 1))];
}

const featureCache = new Map();
export function featuresOf(item) {
  const key = item.id ?? item.body.position + item.body.height + item.final.join();
  if (!featureCache.has(key)) {
    const x = tasteFeatures(item.final, item.body.height, item.body.position), ctx = tasteCtx(item.body.position, item.final);
    for (const k of Object.keys(x)) if (kindOf(k) === 'tier') for (const a of FAMILY[k.split(':')[0]] ?? []) x['fam:' + a] = (x['fam:' + a] ?? 0) + 1 / FAMILY_STEPS[a];
    for (const k of Object.keys(x)) if (kindOf(k) === 'tier' || kindOf(k) === 'fam') x[ctx + '|' + k] = x[k];
    x[ctx + '|offset'] = 1; // the kind's own level (see contextRefs)
    featureCache.set(key, x);
  }
  return featureCache.get(key);
}
const sigmoid = z => 1 / (1 + Math.exp(-z));

// pairs: [{ a, b, y }] with a/b pool items and y = 1 (a better), 0 (b better), 0.5 (about the same).
// Returns weights (prior means for anything the picks never touched) plus your manual nudges on top.
export function fitTaste(pairs, settings = {}, manual = {}, { iterations = 300 } = {}) {
  const fromScratch = settings.fromHouse === false;
  const refs = contextRefs(pairs);
  const diffs = pairs.map(({ a, b, y }) => {
    const xa = centered(a, refs), xb = centered(b, refs), d = {};
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
  // Back to plain features: a kind's level absorbs its centering, so scoring needs no references.
  for (const [ctx, ref] of refs) { let c = 0; for (const k in ref) c += (out[k] ?? 0) * ref[k]; out[ctx + '|offset'] = (out[ctx + '|offset'] ?? 0) - c; }
  for (const [k, v] of Object.entries(manual)) out[k] = (out[k] ?? priorOf(k, settings)[0]) + v;
  return out;
}
// Answers to a question compare versions of one build, so they teach what matters *within* a kind of build (this
// dunking big vs that one), never whether dunking bigs as a whole beat wings. Fitted as is, the prior set that level
// arbitrarily: "dunking bigs: rebounding badges +8" lifted every dunking big over every wing (five answers turned an
// all-positions shortlist into twelve bigs). So a kind's terms are fitted centered on the builds you were shown of that
// kind (a build like them gets about nothing from them), and each kind has its own level term (<ctx>|offset, prior 3 meta
// points), which only choices between kinds (matchups, or a version that crosses the dunk line) can move.
function contextRefs(pairs) {
  const refs = new Map(), n = new Map(), seen = new Set();
  for (const p of pairs) for (const it of [p.a, p.b]) {
    const id = it.id ?? JSON.stringify([it.body, it.final]);
    if (seen.has(id)) continue;
    seen.add(id);
    const ctx = tasteCtx(it.body.position, it.final), x = featuresOf(it), ref = refs.get(ctx) ?? {};
    for (const k in x) if (k.startsWith(ctx + '|') && kindOf(k) !== 'off') ref[k] = (ref[k] ?? 0) + x[k];
    refs.set(ctx, ref); n.set(ctx, (n.get(ctx) ?? 0) + 1);
  }
  for (const [ctx, ref] of refs) for (const k in ref) ref[k] /= n.get(ctx);
  return refs;
}
function centered(it, refs) {
  const x = { ...featuresOf(it) }, ref = refs.get(tasteCtx(it.body.position, it.final)) ?? {};
  for (const k in ref) x[k] = (x[k] ?? 0) - ref[k];
  return x;
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
export const CTX_NAMES = { 'guard|dunk': 'Dunking guards', 'guard|nodunk': 'Guards who don\'t dunk', 'wing|dunk': 'Dunking wings',
  'wing|nodunk': 'Wings who don\'t dunk', 'big|dunk': 'Dunking bigs', 'big|nodunk': 'Bigs who don\'t dunk' };
export function featureLabel(k) {
  if (k.includes('|')) { const p = k.split('|'); return `${CTX_NAMES[p[0] + '|' + p[1]]}: ${featureLabel(p.slice(2).join('|'))}`; }
  if (k.startsWith('fam:')) return `${label(k.slice(4))} badges (all of them)`;
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
  return Object.keys(w).filter(k => kindOf(k) !== 'off').map(k => {
    const delta = (w[k] - priorOf(k, settings)[0]) * (k === 'house' ? 1 : TASTE_SCALE) * (k === 'h2' ? -1 : 1);
    return { key: k, label: featureLabel(k), delta, weight: w[k], picks: touched.get(k) ?? 0 };
  }).filter(x => Math.abs(x.delta) >= 0.05)
    // Family lessons first ("Pass Accuracy badges", "Dunking bigs: Close Shot badges"): they're what a choice usually says.
    .sort((a, b) => (/fam:/.test(b.key) - /fam:/.test(a.key)) || Math.abs(b.delta) - Math.abs(a.delta));
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

// Optimizer weights. The optimizer reads per-tier weights only, so families and context terms are folded into them
// (exact: both are sums of tier steps). w: the shared weights (no context terms); byCtx: one set per kind of build.
const GROUP_POSITIONS = { guard: ['PG', 'SG'], wing: ['SF'], big: ['PF', 'C'] };
export function foldTaste(w, ctx = null) {
  const out = {};
  for (const [k, v] of Object.entries(w)) { const kind = kindOf(k); if (!['tier', 'fam', 'ctx', 'ctxfam', 'off'].includes(kind)) out[k] = v; }
  // A kind's offset is a constant for every build of that kind: carried on its positions' terms (always 1 for them).
  if (ctx && w[ctx + '|offset']) for (const p of GROUP_POSITIONS[ctx.split('|')[0]]) out['pos:' + p] = (out['pos:' + p] ?? 0) + w[ctx + '|offset'];
  for (const g of goals) for (let r = 1; r <= g.tiers.length; r++) {
    const k = `${g.name}:${r}`;
    let v = (w[k] ?? 0) + (ctx ? w[`${ctx}|${k}`] ?? 0 : 0);
    for (const a of FAMILY[g.name]) v += ((w['fam:' + a] ?? 0) + (ctx ? w[`${ctx}|fam:${a}`] ?? 0 : 0)) / FAMILY_STEPS[a];
    out[k] = v;
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Math.abs(v) >= 1e-3));
}
export const tasteOpts = w => ({ w: foldTaste(w), byCtx: Object.fromEntries(CONTEXTS.map(c => [c, foldTaste(w, c)])) });
// How far apart two contexts' weights are (meta points on the biggest tier step): worth a search per context?
export const ctxGap = (taste, group) => {
  const a = taste.byCtx?.[group + '|dunk'] ?? {}, b = taste.byCtx?.[group + '|nodunk'] ?? {};
  let gap = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) gap = Math.max(gap, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
  return gap * TASTE_SCALE;
};

// Picks stored by pool id → pairs of items (picks whose builds left the pool are dropped), plus each answered question:
// the chosen version beat every other version shown.
export function pairsOf(taste) {
  const byId = new Map(taste.pool.map(x => [x.id, x]));
  const picks = taste.picks.map(p => ({ a: byId.get(p.a), b: byId.get(p.b), y: p.y })).filter(p => p.a && p.b);
  // best: the version(s) you'd play. Several = about the same (a tie, y 0.5, between them); each beats every other version.
  const answers = (taste.answers ?? []).flatMap(q => {
    const best = q.best ?? (q.chosen == null ? [] : [q.chosen]), out = [];
    best.forEach((i, n) => {
      for (const j of best.slice(n + 1)) out.push({ a: asItem(q.options[i]), b: asItem(q.options[j]), y: 0.5, answer: true });
      q.options.forEach((o, j) => { if (!best.includes(j)) out.push({ a: asItem(q.options[i]), b: asItem(o), y: 1, answer: true }); });
    });
    return out;
  });
  return [...picks, ...answers];
}
const asItem = o => ({ id: poolId(o.body, o.final), body: o.body, final: o.final });
// The fitted weights for a stored taste, memoized on its picks and settings (the Lab asks on every search).
let memo = { key: null, w: null };
export function fittedTaste(taste) {
  const key = JSON.stringify([taste.picks, taste.answers?.length, taste.answers?.at(-1)?.at, taste.settings, taste.manual, taste.pool.length]);
  if (memo.key !== key) memo = { key, w: fitTaste(pairsOf(taste), taste.settings, taste.manual) };
  return memo.w;
}
export function readTaste() {
  try { return { ...emptyTaste(), ...JSON.parse(localStorage.getItem(TASTE_KEY)) }; } catch { return emptyTaste(); }
}
export const MIN_PICKS = 10;
// A stable id for a build in the pool: same body and ratings = same build.
export const poolId = (body, final) => [body.position, body.height, body.weight, body.wingspan, ...final].join('.');
