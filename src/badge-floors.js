// Must-have badges and Priority → what they ask of each rating (shown in the Lab's Attributes table).
import { alternatives, attributes, tiers } from './engine.js';
import { SPECIALIZATIONS, byName, capOf, goals } from './breakpoints.js';

// What your badges ask of each rating, worked out from the badge settings (nothing is copied into your minimums, so changing
// a badge can't leave a stale floor behind). floors: a Must's tier, as locked minimums (a rating every way into the tier needs;
// with an "or", its lowest branch). either: a Must's "or" part (Mid Range 70 or Three Point 70), which the optimizer picks.
// targets: badges you gave a Priority, their next tier past any Must, up to your Max tier (soft: bought if there's room).
// category (optional): the specialization. Its unlock needs base ratings (before Cap Breakers): one way in locks them
// ({ spec, base: true } entries); several (Finishing: any one of four ratings at 60) is an "either".
export function badgeFloors(mustHave, prefs, category = '') {
  const floors = {}, either = [], targets = {};
  const add = (map, key, x) => (map[key] ??= []).push(x);
  const split = t => {
    const alts = alternatives(t), lo = attributes.map(a => Math.min(...alts.map(x => x[a.index])));
    const branches = alts.length > 1 ? alts.map(x => attributes.filter(a => x[a.index] > lo[a.index]).map(a => [a.name, x[a.index]])) : [];
    return { lo, branches: branches.every(b => b.length) ? branches : [] };
  };
  for (const [gname, tier] of Object.entries(mustHave ?? {})) {
    const g = byName[gname], t = tier && g?.tiers.find(x => x.tier === tier);
    if (!t) continue;
    const { lo, branches } = split(t);
    attributes.forEach(a => { if (lo[a.index] > 25) add(floors, a.name, { min: lo[a.index], goal: g, tier }); });
    if (branches.length) either.push({ goal: g, tier, branches });
  }
  const ways = SPECIALIZATIONS[category]?.any?.filter(w => Object.keys(w).length) ?? [];
  if (ways.length === 1) for (const [k, v] of Object.entries(ways[0])) add(floors, k, { min: v, spec: category, base: true });
  else if (ways.length > 1) either.push({ spec: category, base: true, branches: ways.map(w => Object.entries(w)) });
  for (const g of goals) {
    if (!(prefs.values?.[g.name] > 0) || g.tiers.length < 2) continue;
    const rank = mustHave?.[g.name] ? tiers.indexOf(mustHave[g.name]) + 1 : 0;
    if (rank >= capOf(prefs, g) || rank >= g.tiers.length) continue;
    const t = g.tiers[rank], { lo } = split(t);
    attributes.forEach(a => { if (lo[a.index] > 25) add(targets, a.name, { min: lo[a.index], goal: g, tier: t.tier }); });
  }
  return { floors, either, targets };
}
