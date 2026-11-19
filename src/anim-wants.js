// The 2K27 animation glossary, flat and keyed, for the Animations page and packages.
import { animationTabs } from './unlocks.js';

export const animKey = (tab, group, name) => `${tab}/${group}/${name}`;
// Every animation with a rating requirement, flat: { key, name, tab, group, sizes, or, reqs: [[attribute index, min]] }.
export const allAnimations = animationTabs.flatMap(t => t.groups.flatMap(g => g.anims.filter(a => a.reqs.length)
  .map(a => ({ key: animKey(t.name, g.name, a.name), name: a.name, tab: t.name, group: g.name, sizes: a.sizes, or: a.or, reqs: a.reqs,
    prized: a.prized, season: a.season }))));
const byKey = new Map(allAnimations.map(a => [a.key, a]));
// A glossary key, or an object (a custom jumper) passed through as-is.
export const findAnimation = key => typeof key === 'object' && key ? key : byKey.get(key);

export const SIZE_LABEL = { S: 'smalls', W: 'swings', B: 'bigs' };
export const sizesText = sizes => sizes === 'A' ? 'all sizes' : [...sizes].map(c => SIZE_LABEL[c]).filter(Boolean).join(' & ');
