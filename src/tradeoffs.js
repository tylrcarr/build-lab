// Trade-offs: what you'd get for asking a little less. Each one lowers one of your own requirements a notch (an Elite pick to
// Good, a 93 driving dunk minimum to the next badge breakpoint down, a gold must-have to silver), and the Lab finds the best
// build with that change. The ones worth showing buy something real with the points they free: "Driving Dunk 87 instead of
// 93 → gold Post Powerhouse, silver Hook Specialist". Nothing here is tied to the top builds: the search runs again.
import { attributes, badgeTier, name, tiers } from './engine.js';
import { goals } from './breakpoints.js';
import { metaOf } from './meta.js';

const tierWord = t => t === 'hall_of_fame' ? 'Hall of Fame' : name(t);

// The badge breakpoints for an attribute (every tier's minimum on it), high to low.
const breakpointsOf = attr => [...new Set(goals.flatMap(g => g.tiers.flatMap(t => t.requirements.filter(r => r.name === attr).map(r => r.minimum))))]
  .sort((a, b) => b - a);

// The notch-lower versions of what you asked for. A relaxation is plain data (it's saved with the results):
// { id, title, kind: 'min', attr, value } | { kind: 'must', badge, tier }.
export function relaxations({ prefs, mustHave = {}, limit = 8 }) {
  const out = [];
  for (const [attr, min] of Object.entries(prefs.minimums ?? {})) {
    if (!(min > 40)) continue;
    // The next breakpoint at least 3 below (the points have to buy something), or 6 below when there's none.
    const value = breakpointsOf(attr).find(v => v <= min - 3) ?? min - 6;
    out.push({ id: `m-${attr}`, kind: 'min', attr, value, title: `${name(attr)} ${value} instead of ${min}` });
  }
  for (const [badge, tier] of Object.entries(mustHave)) {
    if (!tier) continue;
    const k = tiers.indexOf(tier), g = goals.find(x => x.name === badge);
    if (!g) continue;
    const lower = g.tiers.length > 1 && k > 0 ? tiers[k - 1] : null;
    out.push({ id: `b-${badge}`, kind: 'must', badge, tier: lower,
      title: lower ? `${g.label ?? name(badge)} ${tierWord(lower)} instead of ${tierWord(tier)}` : `No ${g.label ?? name(badge)} required` });
  }
  return out.slice(0, limit);
}

// The settings a relaxation searches with: { prefs, mustHave }.
export function relaxedSettings(x, { prefs, mustHave = {} }) {
  if (x.kind === 'min') return { prefs: { ...prefs, minimums: { ...prefs.minimums, [x.attr]: x.value } }, mustHave };
  return { prefs, mustHave: { ...mustHave, [x.badge]: x.tier ?? undefined } };
}

// What the relaxed build gets over the build it's compared with: badge tiers gained (the ones that are worth something:
// your picks or the meta's, not a bronze Glove nobody wanted), the biggest rating gains, and the meta change. Badges worth nothing to anyone aren't news.
export function gainsOf(r, base, worth) {
  const h = r.body.height, hb = base.body.height;
  const badges = [];
  for (const g of goals) {
    const now = tiers.indexOf(badgeTier(g, r.final, h)), was = tiers.indexOf(badgeTier(g, base.final, hb));
    if (now > was && worth(g, r.body.position) >= 0.75) badges.push({ g, tier: tiers[now], new: was < 0, w: worth(g, r.body.position) * (now - was) });
  }
  badges.sort((a, b) => b.w - a.w);
  const ratings = attributes.map((a, i) => ({ attr: a.name, d: r.final[i] - base.final[i], to: r.final[i] })).filter(x => x.d >= 5).sort((a, b) => b.d - a.d);
  return { badges, ratings };
}

// One line: "gold Post Powerhouse, silver Hook Specialist · Strength 84 (+9)".
export function gainsText({ badges, ratings }, n = 3) {
  const b = badges.slice(0, n).map(x => `${tierWord(x.tier).toLowerCase()} ${x.g.label ?? name(x.g.name)}`);
  const more = badges.length > n ? ` +${badges.length - n} more` : '';
  const r = ratings.slice(0, 2).map(x => `${name(x.attr)} ${x.to} (+${x.d})`);
  return [b.join(', ') + more, r.join(', ')].filter(Boolean).join(' · ');
}

export const metaWorthOf = (g, position) => metaOf(g, position);
