import React, { useMemo, useState } from 'react';
import { attributes, feet, name, playerTypeCount, typeWeights } from '../engine.js';
import { archetypesAt } from '../archetypes.js';
import { derive } from '../derive.js';
import { Archetype, SHORT, disciplineColour } from './common.jsx';
import { allAnimations, sizesText } from '../anim-wants.js';
import { SIZE_NAMES, animationGap, animationTabs, freeAnimationGroups, requirementLabel, sizeFamily } from '../unlocks.js';

// Every archetype at a height: its name, what it's built around, and a heat map of how much each rating counts toward
// Overall (darker = costs more, smaller Cap Breaker steps).
export function ArchetypesView({ build }) {
  const [height, setHeight] = useState(build.body.height);
  const d = useMemo(() => derive(build), [build]);
  const list = archetypesAt(height);
  const cols = attributes.filter(a => a.name !== 'free_throw');
  const all = Array.from({ length: playerTypeCount(height) }, (_, t) => typeWeights(height, t));
  const top = Math.max(...all.flatMap(w => cols.map(a => w[a.index])));
  return <section className="card">
    <div className="card-head"><div><h2>Archetypes</h2>
      <p className="muted">The game gives every build one of 15 archetypes at its height, picked from your base ratings (before Cap Breakers). The archetype
        sets how much each rating costs in Overall and how far each Cap Breaker goes: ratings it weighs heavily are expensive and get small breaker
        steps, light ones are cheap and get big steps. Names describe the playstyle each one is built around.</p></div>
      <label className="field compact"><span>Height</span><select value={height} onChange={e => setHeight(Number(e.target.value))}>
        {Array.from({ length: 20 }, (_, i) => 69 + i).map(h => <option key={h} value={h}>{feet(h)}</option>)}</select></label></div>
    <div className="arch-table" role="table">
      <div className="arch-row head" role="row"><span>Archetype</span>{cols.map(a => <span key={a.name} title={name(a.name)}
        style={{ color: disciplineColour(a.discipline) }}>{SHORT[a.name]}</span>)}</div>
      {list.map(x => <div key={x.type} role="row" className={'arch-row' + (height === build.body.height && x.type === d.state.playerType ? ' mine' : '')}>
        <span className="arch-name"><small className="muted">#{x.type + 1}</small> <Archetype height={height} type={x.type} />
          {height === build.body.height && x.type === d.state.playerType && <span className="chip">yours</span>}</span>
        {cols.map(a => { const w = all[x.type][a.index];
          return <span key={a.name} className="heat" title={`${name(a.name)}: weight ${w.toFixed(2)}`}
            style={{ background: `rgba(255, 138, 61, ${Math.min(1, w / top) * 0.85})` }}>{w.toFixed(1)}</span>; })}
      </div>)}
    </div>
    <p className="muted small">Numbers: how much each rating point counts toward Overall in that archetype (free throw is the same everywhere).
      Balanced archetypes weigh everything the same.</p>
  </section>;
}

// Every animation with a rating requirement, grouped like the game's animation menu (Scoring Moves, Dunks, Playmaking
// Moves → one category per equip slot), with what each needs and where your Builder build stands.
const ANIM_TABS = animationTabs.map(t => ({ name: t.name, groups: t.groups.filter(g => g.anims.some(a => a.reqs.length)).map(g => g.name) }));
export function AnimationsReference({ build }) {
  const d = useMemo(() => derive(build), [build]);
  const [tab, setTab] = useState(ANIM_TABS[0].name);
  const [group, setGroup] = useState(ANIM_TABS[0].groups[0]);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState(() => sizeFamily(build.body.height));
  const [sort, setSort] = useState('req');
  const q = query.trim().toLowerCase();
  const max = a => Math.max(...a.reqs.map(r => r[1]));
  const withGap = useMemo(() => allAnimations.map(a => ({ ...a, gap: animationGap(a, d.final, d.caps) })), [d.final, d.caps]);
  const fits = a => !size || a.sizes === 'A' || a.sizes.includes(size);
  const inTab = g => withGap.filter(a => a.group === g && fits(a));
  const list = (q ? withGap.filter(a => fits(a) && `${a.name} ${a.group}`.toLowerCase().includes(q)) : inTab(group))
    .sort((a, b) => sort === 'req' ? max(a) - max(b) || a.name.localeCompare(b.name) : sort === 'gap' ? a.gap - b.gap || max(a) - max(b) : a.name.localeCompare(b.name))
    .slice(0, 500);
  // Matches the size filter hides, so a search never looks emptier than it is.
  const hidden = size ? (q ? withGap.filter(a => !fits(a) && `${a.name} ${a.group}`.toLowerCase().includes(q)) : withGap.filter(a => a.group === group && !fits(a))).length : 0;
  const pickTab = t => { setTab(t); setGroup(ANIM_TABS.find(x => x.name === t).groups[0]); setQuery(''); };
  return <section className="card">
    <div className="card-head"><div><h2>Animations</h2>
      <p className="muted">Every 2K27 animation that needs ratings, by category like the game's animation menu. “You” compares your Builder build
        ({feet(build.body.height)}, ratings after Cap Breakers). Custom jump shots from the Jump Shot Creator aren't listed: their requirement depends on
        the blend, so check it in the game.</p></div></div>
    <div className="ar-tools">
      <div className="toggles" role="tablist">{ANIM_TABS.map(t => <button key={t.name} role="tab" aria-selected={!q && tab === t.name}
        className={!q && tab === t.name ? 'on' : ''} onClick={() => pickTab(t.name)}>{t.name}</button>)}</div>
      <label className="field compact grow"><span>Search all</span><input type="search" placeholder="A player, or a category like “layup”…" value={query}
        onChange={e => setQuery(e.target.value)} /></label>
      <label className="field compact"><span>Size</span><select value={size} onChange={e => setSize(e.target.value)}>
        <option value="">All sizes</option>{Object.entries(SIZE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}{k === sizeFamily(build.body.height) ? ' (your build)' : ''}</option>)}</select></label>
      <label className="field compact"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}>
        <option value="req">Easiest first</option><option value="gap">Closest for you</option><option value="name">A–Z</option></select></label>
    </div>
    <div className={'ar-layout' + (q ? ' searching' : '')}>
      {!q && <nav className="ar-groups" aria-label={`${tab} categories`}>{ANIM_TABS.find(t => t.name === tab).groups.map(g => {
        const all = inTab(g), have = all.filter(a => a.gap === 0).length;
        return <button key={g} className={g === group ? 'on' : ''} aria-pressed={g === group} onClick={() => setGroup(g)}>
          <span>{g}</span><small>{have}/{all.length}</small></button>; })}</nav>}
      <div className="ar-table" role="table" aria-label={q ? 'Search results' : group}>
        <div className={'ar-row head' + (q ? ' wide' : '')} role="row"><span>Animation</span>{q && <span>Category</span>}<span>Needs</span><span>Sizes</span><span>You</span></div>
        {list.map(a => <div key={a.key} role="row" className={'ar-row' + (q ? ' wide' : '') + (a.gap === 0 ? ' on' : '')}>
          <span><b>{a.name}</b>{a.prized ? <span title="Prized"> ★</span> : null}{a.season ? <small className="new-tag" title={`Season ${a.season}`}> S{a.season}</small> : null}</span>
          {q && <span className="muted small">{a.group}</span>}
          <span className="small">{requirementLabel(a, name)}</span>
          <span className="muted small">{sizesText(a.sizes)}</span>
          <span className={'small ' + (a.gap === 0 ? 'good-text' : 'muted')}>{a.gap === 0 ? '✓' : a.gap === Infinity ? 'above caps' : `+${a.gap}`}</span>
        </div>)}
        {!list.length && <p className="muted small" style={{ padding: 12 }}>Nothing matches{size ? ` for ${SIZE_NAMES[size].toLowerCase()}` : ''}.</p>}
        {hidden > 0 && <p className="muted small ar-hidden">{hidden} more for other sizes. <button className="linkish" onClick={() => setSize('')}>Show all sizes</button></p>}
      </div>
    </div>
    <p className="muted small bp-note">No rating needed: {freeAnimationGroups.map(([n, c]) => `${n} (${c})`).join(', ')}.</p>
  </section>;
}
