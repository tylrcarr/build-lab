import React, { useState } from 'react';
import { badges, inHeight, tiers } from '../engine.js';
import { groups } from '../derive.js';
import { tokenCost, tokenStep } from './BadgesView.jsx';
import { TierPill, disciplineColour, label, requirementText } from './common.jsx';

// The badge chart: every badge this build has, by category, with what each tier costs in tokens at this height and what
// the next tier costs on top of the one you have (tokens, and the ratings it needs).
export default function BadgePreview({ build, d }) {
  const [showLocked, setShowLocked] = useState(false);
  const h = build.body.height;
  const unlockedBy = Object.fromEntries(d.unlocked.map(u => [u.badge.name, u.tier]));
  const eligible = badges.filter(b => inHeight(b, h));
  const total = d.unlocked.reduce((s, u) => s + (tokenCost(u.badge.badge, u.tier, h) ?? 0), 0);

  const row = b => {
    const tier = unlockedBy[b.name] ?? null, k = tier ? tiers.indexOf(tier) : -1;
    const next = b.tiers.length > k + 1 ? tiers[k + 1] : null, step = next ? tokenStep(b.badge, next, h) : null;
    return <div key={b.badge} className={'bp-row' + (tier ? '' : ' locked')}
      title={tiers.map(t => `${label(t)}: ${requirementText(b, t)} · ${tokenCost(b.badge, t, h) ?? '–'} tokens`).join('\n')}>
      <span className="bp-name">{label(b.name)}</span>
      <TierPill tier={tier} small />
      <span className="bp-steps" aria-label="Tokens to equip at Bronze, Silver, Gold, Hall of Fame">{tiers.map((t, j) =>
        <i key={t} className={(j <= k ? t : '') + (j === k ? ' cur' : '')}>{tokenCost(b.badge, t, h) ?? '–'}</i>)}</span>
      <span className="bp-next" title={next ? `${label(next)} needs ${requirementText(b, next)}` : undefined}>
        {next && step != null ? <>+{step} <TierPill tier={next} small /></> : tier ? <span className="muted">max</span> : null}</span>
    </div>;
  };

  return <section className="card badge-preview">
    <div className="row-head">
      <h3>Badges <span className="muted">{d.unlocked.length}</span></h3>
      <div className="bp-stats">
        <span><b>{total}</b> tokens to equip them all</span>
        <label className="check"><input type="checkbox" checked={showLocked} onChange={e => setShowLocked(e.target.checked)} /> Show locked</label>
      </div>
    </div>
    <div className="bp-grid">{groups.map(g => {
      const list = eligible.filter(b => b.discipline === g && (showLocked || unlockedBy[b.name]));
      return <div key={g} className="bp-group">
        <h4 style={{ '--accent': disciplineColour(g) }}>{label(g)} <span className="muted">{eligible.filter(b => b.discipline === g && unlockedBy[b.name]).length}</span></h4>
        {list.length ? list.map(row) : <p className="muted small">None unlocked.</p>}
      </div>;
    })}</div>
    <p className="muted small bp-note">The four numbers are the tokens to equip each badge at Bronze, Silver, Gold and Hall of Fame at your height
      (yours is outlined). <b>+n</b> is what the next tier costs on top of yours; hover a badge for the ratings each tier needs.</p>
  </section>;
}
