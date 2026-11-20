// My Meta questions: a few legal versions of one build that differ only in a trade, so the choice says what you value
// (a matchup between two whole builds differs in dozens of things at once, and the model can't tell which one you picked
// for). Two kinds:
//   pay:   "You want more X. Which area pays for it?" Each version raises X to a breakpoint and lowers one area only;
//          every other rating stays exactly where it was. Plus "keep it as is".
//   split: "How would you split the points between X and Y?" Every other rating is locked; the versions are points on
//          the best X/Y trade-off curve: most X, about even, most Y.
// The starting build is planned for the house meta at a position and height you use, on a body that can reach the
// higher rating, but with that rating held about 9 below its breakpoint: asking for more of something the meta already
// maxed is an easy no and teaches little.
// Runs in a worker (the exact planner); each question takes a few seconds to about 20.
import { attributes, name } from './engine.js';
import { DUNKER, breakpointsFor, defaultPrefs, exactPlan, idx, metaScore, mipBody, optimizeBodyFull } from './breakpoints.js';
import { metaGroup, metaOf } from './meta.js';

export const AREAS = {
  inside: ['close_shot', 'post_control', 'driving_layup'],
  dunking: ['driving_dunk', 'standing_dunk'],
  shooting: ['mid_range', 'three_point', 'free_throw'],
  playmaking: ['pass_accuracy', 'ball_handle', 'speed_with_ball'],
  defense: ['interior_defense', 'perimeter_defense', 'steal', 'block'],
  rebounding: ['offensive_rebound', 'defensive_rebound'],
  athleticism: ['speed', 'agility', 'strength', 'vertical'],
};
export const AREA_NAMES = { inside: 'inside scoring', dunking: 'dunking', shooting: 'shooting', playmaking: 'playmaking', defense: 'defense',
  rebounding: 'rebounding', athleticism: 'athleticism' };

// What to ask about, per kind of player: the ratings people trade most.
export const ASKS = {
  big: { pay: ['pass_accuracy', 'close_shot', 'three_point', 'block', 'perimeter_defense', 'speed'],
    split: [['close_shot', 'pass_accuracy'], ['three_point', 'close_shot'], ['three_point', 'block'], ['post_control', 'pass_accuracy']] },
  wing: { pay: ['three_point', 'ball_handle', 'perimeter_defense', 'driving_dunk', 'pass_accuracy', 'speed'],
    split: [['three_point', 'driving_dunk'], ['ball_handle', 'perimeter_defense'], ['three_point', 'perimeter_defense'], ['pass_accuracy', 'three_point']] },
  guard: { pay: ['three_point', 'ball_handle', 'pass_accuracy', 'perimeter_defense', 'driving_layup', 'speed'],
    split: [['three_point', 'ball_handle'], ['pass_accuracy', 'three_point'], ['perimeter_defense', 'ball_handle'], ['driving_layup', 'three_point']] },
};

const N = attributes.length;
const NAMES = attributes.map(a => a.name);
const byName = m => NAMES.map(n => m[n]);
function houseOpts(breakers) {
  const p = defaultPrefs();
  return { values: p.values, caps: p.caps, continuous: p.continuous, notFeel: p.notFeel, continuousWeights: p.continuousWeights ?? {},
    minimums: Array(N).fill(25), maximums: Array(N).fill(99), breakers, mustHave: {}, mode: '5v5', metaRate: 1, archetypes: false };
}
const withMin = (o, m) => ({ ...o, minimums: o.minimums.map((v, i) => Math.max(v, m[NAMES[i]] ?? 25)) });
const withMax = (o, m) => ({ ...o, maximums: o.maximums.map((v, i) => Math.min(v, m[NAMES[i]] ?? 99)) });
const ok = r => r && !r.error ? r : null;
const slim = (r, tag) => ({ tag, body: { position: r.body.position, height: r.body.height, weight: r.body.weight, wingspan: r.body.wingspan }, final: [...r.final] });

// The rating to aim for: a breakpoint from 80 to 95 that opens a badge the meta values at this position.
function targetFor(attr, position, height) {
  const marks = breakpointsFor(idx[attr], height)
    .filter(m => m.rating >= 80 && m.rating <= 95 && m.unlocks.some(u => u.badge && metaOf(u.badge, position) >= 0.5));
  if (!marks.length) return attr === 'speed' ? 85 : null; // speed counts smoothly: no badge to aim at
  return marks.sort((a, b) => Math.max(...b.unlocks.map(u => u.badge ? metaOf(u.badge, position) : 0)) - Math.max(...a.unlocks.map(u => u.badge ? metaOf(u.badge, position) : 0))
    || a.rating - b.rating)[0].rating;
}

// The starting build: house meta at this position, height and dunk context, on a body with room for `attr` at `target`,
// with `attr` held at target - 9.
export function startFor({ position, height, dunk, attr, target, breakers, free = [attr] }) {
  let o = houseOpts(breakers);
  // The dunk context, unless the trade is about dunking itself.
  if (!free.includes('driving_dunk')) o = dunk ? withMin(o, { driving_dunk: DUNKER }) : withMax(o, { driving_dunk: DUNKER - 7 });
  const roomy = ok(exactPlan(position, height, withMin(o, { [attr]: target }), { rounds: 2, time: 3 }));
  if (!roomy) return null;
  const held = withMax(o, { [attr]: target - 9 });
  const start = ok(mipBody(roomy.body, { ...held, mipTime: 5 }, roomy.playerType)) ?? ok(optimizeBodyFull(roomy.body, held));
  return start ? { start, opts: o } : null;
}

// The best build on the start's body with every rating pinned to the start except `free`, each free one within
// bounds[name] = [lo, hi].
function pinned(start, o, free, bounds) {
  const mins = {}, maxs = {};
  NAMES.forEach((n, i) => { if (!free.includes(n)) { mins[n] = start.final[i]; maxs[n] = start.final[i]; } });
  for (const [n, [lo, hi]] of Object.entries(bounds)) { if (lo != null) mins[n] = lo; if (hi != null) maxs[n] = hi; }
  const oo = { ...o, minimums: byName(mins).map(v => v ?? 25), maximums: byName(maxs).map(v => v ?? 99) };
  if (oo.minimums.some((v, i) => v > oo.maximums[i])) return null;
  const r = ok(mipBody(start.body, { ...oo, mipTime: 3 }, start.playerType));
  // Linked ratings can drag a pinned one along (Three Point down, Free Throw up): then it isn't the trade we asked about.
  return r && NAMES.every((n, i) => free.includes(n) || r.final[i] === start.final[i]) ? r : null;
}
const same = (a, b) => a.final.every((v, i) => v === b.final[i]);

export function payQuestion({ position, height, dunk, attr, breakers }) {
  const target = targetFor(attr, position, height);
  if (!target) return null;
  const s = startFor({ position, height, dunk, attr, target, breakers });
  if (!s) return null;
  const { start, opts } = s, from = start.final[idx[attr]];
  if (from >= target) return null;
  dunk = start.final[idx.driving_dunk] >= DUNKER;
  const ways = [];
  for (const [area, members] of Object.entries(AREAS)) {
    const payers = members.filter(n => n !== attr);
    if (!payers.length) continue;
    const r = pinned(start, opts, [attr, ...payers], { [attr]: [target, null], ...Object.fromEntries(payers.map(n => [n, [null, start.final[idx[n]]]])) });
    if (r && !ways.some(w => same(w.r, r))) ways.push({ r, area, cost: metaScore(start.final, height, position) - metaScore(r.final, height, position) });
  }
  // Seven ways to pay is too many to weigh: the three cheapest on the house meta (the ones a sensible player might take).
  ways.sort((x, y) => x.cost - y.cost);
  const options = [slim(start, 'Keep it as is'), ...ways.slice(0, 3).map(w => ({ ...slim(w.r, `Pay with ${AREA_NAMES[w.area]}`), area: w.area }))];
  if (options.length < 3) return null;
  return { kind: 'pay', attr, from, target, position, height, dunk, options,
    title: `More ${name(attr)}: how would you pay for it?`,
    intro: `A ${dunk ? 'dunking' : 'non-dunking'} ${position} with ${name(attr)} ${from}. You want ${name(attr)} ${target}. Each version pays for it from one area only; every other rating stays exactly the same.` };
}

export function splitQuestion({ position, height, dunk, pair: [a, b], breakers }) {
  const target = targetFor(b, position, height);
  if (!target) return null;
  const s = startFor({ position, height, dunk, attr: b, target, breakers, free: [a, b] });
  if (!s) return null;
  const { start, opts } = s, a0 = start.final[idx[a]], b0 = start.final[idx[b]];
  dunk = start.final[idx.driving_dunk] >= DUNKER;
  // The trade-off curve: for each value of a (2 apart), the most b that fits with everything else locked. Scanned from
  // the top (linked ratings make feasibility non-monotone), starting where the last value of a ended.
  const curve = [];
  let top = Math.min(99, b0 + 16);
  for (let va = Math.max(55, a0 - 16); va <= Math.min(99, a0 + 12); va += 2) {
    let found = null;
    for (let vb = top; vb >= Math.max(40, b0 - 24); vb--) {
      const r = pinned(start, opts, [a, b], { [a]: [va, va], [b]: [vb, vb] });
      if (r) { found = r; break; }
    }
    if (found) { curve.push(found); top = found.final[idx[b]] + 1; }
  }
  const A = r => r.final[idx[a]], Bv = r => r.final[idx[b]];
  const front = curve.filter(x => !curve.some(y => y !== x && A(y) >= A(x) && Bv(y) >= Bv(x) && (A(y) > A(x) || Bv(y) > Bv(x))))
    .sort((x, y) => A(y) - A(x));
  if (front.length < 2) return null;
  const mostA = front[0], mostB = front.at(-1), mid = (A(mostA) + A(mostB)) / 2;
  if (A(mostA) - A(mostB) < 5 || Bv(mostB) - Bv(mostA) < 5) return null; // too close to be a real choice
  const even = front.reduce((x, y) => Math.abs(A(y) - mid) < Math.abs(A(x) - mid) ? y : x);
  const picks = [[`Most ${name(a)}`, mostA], ['In between', even], [`Most ${name(b)}`, mostB]].filter(([, r], k, l) => l.findIndex(([, q]) => q === r) === k);
  const options = picks.map(([tag, r]) => slim(r, `${tag} (${name(a)} ${A(r)}, ${name(b)} ${Bv(r)})`));
  return { kind: 'split', pair: [a, b], position, height, dunk, options, locked: NAMES.filter((n, i) => options.every(o => o.final[i] === options[0].final[i])),
    title: `${name(a)} or ${name(b)}?`,
    intro: `A ${dunk ? 'dunking' : 'non-dunking'} ${position}. The points for ${name(a)} and ${name(b)} haven't been spent; every other rating is set and identical in all versions. These are the best ways to split them.` };
}

// Every question to ask for the positions you play, in asking order. Each (trade, position, height, dunk context) is
// asked once: positions take turns, pay and split questions alternate, and two questions in a row never share a rating
// (the old rotation repeated itself every 8 questions and kept circling close shot / passing on bigs).
export const DEFAULT_PLACES = [['PG', 75], ['SG', 78], ['SF', 80], ['PF', 82], ['C', 84]];
export const specKey = s => [s.kind, s.attr ?? s.pair?.join('+'), s.position, s.height, s.dunk ? 'dunk' : 'nodunk'].join('|');
const ratingsOf = s => s.attr ? [s.attr] : s.pair;
export function questionPlan(places, breakers) {
  const lists = places.map(([position, height]) => {
    const ask = ASKS[metaGroup(position)], out = [];
    for (const dunk of [true, false]) for (let i = 0; i < Math.max(ask.pay.length, ask.split.length); i++) {
      if (ask.pay[i]) out.push({ kind: 'pay', attr: ask.pay[i], position, height, dunk, breakers });
      if (ask.split[i]) out.push({ kind: 'split', pair: ask.split[i], position, height, dunk, breakers });
    }
    return out;
  });
  const flat = [];
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) flat.push(l[i]);
  const plan = [];
  while (flat.length) {
    const last = plan.at(-1), k = last ? flat.findIndex(s => !ratingsOf(s).some(r => ratingsOf(last).includes(r))) : 0;
    plan.push(...flat.splice(Math.max(0, k), 1));
  }
  return plan;
}
export const buildQuestion = spec => spec.kind === 'pay' ? payQuestion(spec) : splitQuestion(spec);
