import React, { useEffect, useMemo, useRef, useState } from 'react';
import { attributes, badgeTier, feet, inHeight, positions } from '../engine.js';
import { goals } from '../breakpoints.js';
import { tierRank } from '../solver.js';
import { DEFAULT_PLACES, questionPlan, specKey } from '../questions.js';
import { BodyLine, label } from './common.jsx';

// My Meta questions (questions.js): a few versions of one build that differ only in a trade. Each card is the whole
// build; what differs is marked. The next questions are built in the background while you answer.
const AHEAD = 2;
const GROUPS = [['finishing', 'Finishing'], ['shooting', 'Shooting'], ['playmaking', 'Playmaking'], ['defense', 'Defense'],
  ['rebounding', 'Rebounding'], ['physicals', 'Physicals']];
const TIER = ['', 'Bronze', 'Silver', 'Gold', 'HoF', 'Legend'];
const tiersOf = o => goals.filter(g => inHeight(g, o.body.height) && g.discipline !== 'animation')
  .map(g => ({ g, r: tierRank(badgeTier(g, o.final, o.body.height)) }));
const badgeName = g => (g.label ?? label(g.name)).replace(/^Takeover /, 'Takeover: ');

// Specs that couldn't be built this session (a linked rating or a cap blocks the trade on that body): not retried.
const failed = new Set();
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Which positions and heights to ask about: yours to set (nothing needs saved builds), all five by default.
function PlacePicker({ places, setPlaces }) {
  const on = new Map(places.map(([p, h]) => [p, h]));
  const set = m => setPlaces(POSITIONS.filter(p => m.has(p)).map(p => [p, m.get(p)]));
  return <div className="place-picker">
    <span className="muted small">Ask about</span>
    {POSITIONS.map(p => { const has = on.has(p), def = DEFAULT_PLACES.find(x => x[0] === p)[1];
      return <span key={p} className={'place-chip' + (has ? ' on' : '')}>
        <button onClick={() => { const m = new Map(on); if (has) { if (m.size > 1) m.delete(p); } else m.set(p, def); set(m); }}>{p}</button>
        {has && <select value={on.get(p)} onChange={e => { const m = new Map(on); m.set(p, +e.target.value); set(m); }}>
          {positions[p].map(r => <option key={r.height} value={r.height}>{feet(r.height)}</option>)}</select>}
      </span>; })}
  </div>;
}

export function QuestionPanel({ taste, setTaste, ...rest }) {
  const places = taste.places?.length ? taste.places : DEFAULT_PLACES;
  return <>
    <PlacePicker places={places} setPlaces={pl => setTaste(t => ({ ...t, places: pl }))} />
    <Asker key={JSON.stringify(places)} taste={taste} setTaste={setTaste} places={places} {...rest} />
  </>;
}

function Asker({ taste, setTaste, pool, places, breakers, notify }) {
  const [queue, setQueue] = useState([]);
  const [building, setBuilding] = useState(0);
  const [tied, setTied] = useState(() => new Set());
  const [still, setStill] = useState(false); // just answered: no hover highlight until the mouse moves
  const plan = useMemo(() => questionPlan(places, breakers), [places, JSON.stringify(breakers)]);
  const alive = useRef(true), inflight = useRef(new Set());
  useEffect(() => () => { alive.current = false; }, []);
  const queueRef = useRef(queue), tasteRef = useRef(taste);
  queueRef.current = queue; tasteRef.current = taste;
  const failKey = s => specKey(s) + JSON.stringify(breakers);
  // The next spec nobody has answered, skipped, failed, queued or started.
  const nextSpec = () => {
    const t = tasteRef.current, done = new Set([...(t.answers ?? []).map(a => a.key ?? specKey(a)), ...(t.skipped ?? [])]);
    const busy = new Set([...queueRef.current.map(q => q.key), ...inflight.current]);
    return plan.find(s => { const k = specKey(s); return !done.has(k) && !busy.has(k) && !failed.has(failKey(s)); });
  };
  const [exhausted, setExhausted] = useState(false);
  const fill = () => {
    while (inflight.current.size + queueRef.current.length < AHEAD) {
      const spec = nextSpec();
      if (!spec) { if (!inflight.current.size && !queueRef.current.length) setExhausted(true); return; }
      const key = specKey(spec);
      inflight.current.add(key); setBuilding(inflight.current.size);
      pool.runJobs([{ kind: 'question', options: spec }]).then(([r]) => {
        inflight.current.delete(key);
        if (!alive.current) return;
        setBuilding(inflight.current.size);
        if (r && !r.error) setQueue(list => [...list, { ...r, key }]);
        else { failed.add(failKey(spec)); fill(); }
      });
    }
  };
  useEffect(() => { fill(); }, [queue.length]);
  const q = queue[0];

  const done = () => { setQueue(list => list.slice(1)); setTied(new Set()); setStill(true); document.activeElement?.blur?.(); };
  // best: the version(s) you'd play; more than one = "these are about the same" (a tie between them, and each beats the rest).
  const answer = best => {
    if (!q) return;
    const rec = { key: q.key, kind: q.kind, title: q.title, intro: q.intro, locked: q.locked, attr: q.attr, pair: q.pair, position: q.position,
      height: q.height, dunk: q.dunk, options: q.options.map(o => ({ tag: o.tag, body: o.body, final: o.final })), chosen: best[0], best, at: Date.now() };
    setTaste(t => ({ ...t, answers: [...(t.answers ?? []), rec] }));
    done();
  };
  const pick = k => answer([k, ...[...tied].filter(x => x !== k)]);
  const toggleTie = k => setTied(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allSame = () => q && answer(q.options.map((_, k) => k));
  const skip = () => { if (!q) return; setTaste(t => ({ ...t, skipped: [...(t.skipped ?? []), q.key] })); done(); };
  const undo = () => {
    const last = taste.answers?.at(-1);
    if (!last) return;
    setTaste(t => ({ ...t, answers: t.answers.slice(0, -1) }));
    setQueue(list => [{ ...last, chosen: undefined, best: undefined }, ...list.filter(x => x.key !== last.key)]);
    notify('Last answer taken back: answer it again.');
  };
  useEffect(() => {
    const key = e => {
      if (e.target.closest?.('input, textarea, select') || !q) return;
      const k = +(e.code?.startsWith('Digit') ? e.code.slice(5) : e.key);
      if (k >= 1 && k <= q.options.length) e.shiftKey ? toggleTie(k - 1) : pick(k - 1);
      else if (e.key === 's') skip(); else if (e.key === 't') allSame(); else if (e.key === 'Backspace') undo(); else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (!q) return exhausted ? <div className="question-wait"><p>That's every question for these positions. Add a position or height above for more,
    or search the Lab with My Meta.</p></div> : <div className="question-wait">
    <div className="spinner" /> <p>Building a question… <span className="muted small">(each is planned exactly on the solver: about 10–20 seconds;
      the next ones build while you answer)</span></p>
  </div>;
  return <div className="question">
    <div className="question-head">
      <h3>{q.title}</h3>
      <p>{q.intro}</p>
      <p className="muted small">{q.kind === 'pay' ? 'Every version is compared with the first one: green is higher, red is lower.'
        : 'The versions are compared with each other: green is the highest of them, red the lowest. 🔒 ratings are the same in all of them.'}
        {' '}House meta is hidden: pick the build you'd actually play. Two about as good? Shift-click one, then click the other.</p>
    </div>
    <div className={'question-cards' + (still ? ' still' : '')} onMouseMove={() => still && setStill(false)}
      style={{ gridTemplateColumns: `repeat(${q.options.length}, minmax(0, 1fr))` }}>
      {q.options.map((o, k) => <Sheet key={q.key + k} n={k + 1} o={o} q={q} tied={tied.has(k)}
        onPick={e => e.shiftKey ? toggleTie(k) : pick(k)} />)}
    </div>
    <div className="match-actions">
      <button className="mini-btn" onClick={allSame} title="They're all about as good to you: that's data too (T)">All about the same</button>
      <button className="mini-btn" onClick={skip} title="No data from this one, and it won't come back (S)">Skip</button>
      <button className="mini-btn" disabled={!taste.answers?.length} onClick={undo} title="Take back the last answer (Backspace)">Undo</button>
      <span className="muted small">Keys: 1–{q.options.length} pick · Shift+number mark as tied · T all the same · S skip · Backspace undo{building ? ` · building ${building} more…` : ''}</span>
    </div>
  </div>;
}

function Sheet({ n, o, q, tied, onPick }) {
  const ref = q.kind === 'pay' ? q.options[0] : null, isRef = ref === o;
  const lo = attributes.map((_, i) => Math.min(...q.options.map(x => x.final[i]))), hi = attributes.map((_, i) => Math.max(...q.options.map(x => x.final[i])));
  const mine = useMemo(() => tiersOf(o), [o]);
  const all = useMemo(() => q.options.map(tiersOf), [q]);
  const cls = (v, i) => ref ? (v > ref.final[i] ? 'up' : v < ref.final[i] ? 'down' : '') : lo[i] === hi[i] ? '' : v === hi[i] ? 'up' : v === lo[i] ? 'down' : '';
  const delta = (v, i) => { if (ref) { const d = v - ref.final[i]; return d ? (d > 0 ? '+' : '−') + Math.abs(d) : ''; }
    return lo[i] === hi[i] ? '' : v === hi[i] ? `+${v - lo[i]}` : v === lo[i] ? `−${hi[i] - v}` : ''; };
  const badgeCls = k => { const r = mine[k].r;
    if (ref) { const w = all[0][k].r; return r > w ? 'up' : r < w ? 'down' : ''; }
    const rs = all.map(x => x[k].r), top = Math.max(...rs), bot = Math.min(...rs); return top === bot ? '' : r === top ? 'up' : r === bot ? 'down' : ''; };
  const gains = [], losses = [];
  mine.forEach(({ g, r }, k) => {
    if (isRef) return;
    if (ref) { const w = all[0][k].r; if (r > w) gains.push(`${badgeName(g)} ${TIER[w] || 'none'}→${TIER[r]}`); if (r < w) losses.push(`${badgeName(g)} ${TIER[w]}→${TIER[r] || 'none'}`); }
    else { const others = all.filter(x => x !== all[n - 1]).map(x => x[k].r), best = Math.max(...others), worst = Math.min(...others);
      if (r > best) gains.push(`${badgeName(g)} ${TIER[r]}`); if (r < worst) losses.push(`${badgeName(g)} ${TIER[r] || 'none'}`); }
  });
  const changed = attributes.map((a, i) => [a, ref ? o.final[i] - ref.final[i] : 0]).filter(([, d]) => d);
  const chips = mine.map((x, k) => ({ ...x, c: badgeCls(k) })).filter(x => x.r > 0).sort((a, b) => (!!b.c - !!a.c) || b.r - a.r);
  return <article className={'sheet' + (tied ? ' tied' : '')} onClick={onPick} onMouseDown={e => e.shiftKey && e.preventDefault()} role="button" tabIndex={-1}>
    <header><b>{n}. {o.tag}</b>{tied && <span className="tie-tag">= tied: click your other pick</span>}<BodyLine body={o.body} /></header>
    <div className="sheet-sum">
      {isRef ? <i>The build as it is. The other versions are compared with this one.</i> : <>
        {ref && <div><span className="lbl">Ratings</span>{changed.map(([a, d], k) => <span key={a.name} className={d > 0 ? 'gu' : 'gd'}>{k ? ', ' : ''}{label(a.name)} {d > 0 ? '+' : ''}{d}</span>)}</div>}
        <div><span className="lbl">Gains</span>{gains.join(', ') || '—'}</div>
        <div><span className="lbl">Gives up</span>{losses.join(', ') || '—'}</div>
      </>}
    </div>
    <div className="sheet-cols">
      {GROUPS.map(([d, title]) => <div key={d} className="sheet-sec"><b>{title}</b>
        {attributes.map((a, i) => a.discipline !== d ? null : <div key={a.name} className={'sheet-row ' + cls(o.final[i], i)}>
          <span>{label(a.name)}{q.locked?.includes(a.name) && <span className="qlock"> 🔒</span>}</span>
          <span className="v">{o.final[i]}<span className="d">{delta(o.final[i], i)}</span></span></div>)}
      </div>)}
    </div>
    <div className="sheet-sec"><b>Badges</b>
      <div className="sheet-chips">{chips.map(({ g, r, c }) => <span key={g.name} className={`bchip t${r} ${c}`}>{badgeName(g)}{g.tiers.length > 1 ? ' ' + TIER[r] : ''}</span>)}</div>
    </div>
  </article>;
}
