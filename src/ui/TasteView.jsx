import React, { useEffect, useMemo, useState } from 'react';
import { attributes, feet, positions } from '../engine.js';
import { derive } from '../derive.js';
import { bodiesFor, goals, metaRating, metaScore } from '../breakpoints.js';
import { heightMeta, metaOf } from '../meta.js';
import { MIN_PICKS, PRIOR, TASTE_EVENT, TASTE_KEY, agreement, differences, emptyTaste, fittedTaste, learned, nextPair, pairsOf, poolId, scoreOf } from '../taste.js';
import { usePool } from './LabView.jsx';
import { BodyLine, MiniRatings } from './common.jsx';
import { QuestionPanel } from './Questions.jsx';

// My Meta: teach the Lab your own idea of a better build, one matchup at a time, then search with it (Lab → My Meta).
// The house meta stays the default; this is a second scoring that starts from it (or from scratch) and moves with you.
const MAX_POOL = 150;
const useTaste = () => {
  const [taste, setTaste] = useState(() => { try { return { ...emptyTaste(), ...JSON.parse(localStorage.getItem(TASTE_KEY)) }; } catch { return emptyTaste(); } });
  useEffect(() => { try { localStorage.setItem(TASTE_KEY, JSON.stringify(taste)); } catch { /* storage full */ } window.dispatchEvent(new Event(TASTE_EVENT)); }, [taste]);
  return [taste, setTaste];
};
const slim = (body, final, src) => ({ id: poolId(body, final), body: { position: body.position, height: body.height, weight: body.weight, wingspan: body.wingspan }, final: [...final], src });
const shownMeta = x => Math.round(metaRating(metaScore(x.final, x.body.height, x.body.position)));

export default function TasteView({ library = [], labCfg, setLab, onGoLab, notify }) {
  const [taste, setTaste] = useTaste();
  const pool = usePool();
  const [busy, setBusy] = useState(null);
  const [showHouse, setShowHouse] = useState(false);
  const [mode, setMode] = useState('questions');
  const breakers = { general: labCfg?.breakers?.general ?? 8, future: 0, special: { category: labCfg?.breakers?.special?.category ?? '' } };
  const w = useMemo(() => fittedTaste(taste), [taste]);
  const pairs = useMemo(() => pairsOf(taste), [taste]);
  const [pair, setPair] = useState(null);
  const pickNext = (t = taste, wt = w) => setPair(nextPair(t.pool, t.picks, wt));
  useEffect(() => { if (!pair || !taste.pool.some(x => x.id === pair[0].id) || !taste.pool.some(x => x.id === pair[1].id)) pickNext(); }, [taste.pool.length]);
  const [stats, setStats] = useState(null);
  useEffect(() => { const t = setTimeout(() => setStats(agreement(pairs, taste.settings, taste.manual)), 300); return () => clearTimeout(t); }, [pairs.length, taste.settings, taste.manual]);

  const addToPool = (items, what) => {
    let added = 0;
    setTaste(t => {
      const have = new Set(t.pool.map(x => x.id)), fresh = items.filter(x => !have.has(x.id) && (have.add(x.id), true));
      added = fresh.length;
      // Full: the oldest builds you never compared make room.
      const asked = new Set(t.picks.flatMap(p => [p.a, p.b]));
      let next = [...t.pool, ...fresh];
      while (next.length > MAX_POOL) { const k = next.findIndex(x => !asked.has(x.id)); if (k < 0) break; next.splice(k, 1); }
      return { ...t, pool: next };
    });
    setTimeout(() => notify(added ? `Added ${added} ${what}.` : `No new ${what} to add.`), 0);
  };
  const fromLab = () => {
    const items = [];
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (!key?.startsWith('build-lab.lab-results.')) continue;
      try { const r = JSON.parse(localStorage.getItem(key))?.result;
        for (const p of [...(r?.results ?? []), ...(r?.options ?? [])]) if (p?.final && p?.body) items.push(slim(p.body, p.final, 'lab')); } catch { /* skip */ }
    }
    addToPool(items, 'Lab results');
  };
  const fromSaved = () => addToPool(library.map(b => { try { const d = derive(b); return slim(b.body, d.final, 'saved'); } catch { return null; } }).filter(Boolean), 'saved builds');
  // New builds: random positions and heights (weighted toward the meta heights), each optimized for the meta plus a few
  // random badges you'd value, so the pool covers styles the house meta alone wouldn't build.
  async function generate(n = 12) {
    setBusy('Building 12 new builds…');
    const P = Object.keys(positions), jobs = [];
    for (let tries = 0; jobs.length < n && tries < n * 10; tries++) {
      const pos = P[Math.floor(Math.random() * P.length)];
      const hs = positions[pos].map(r => r.height).filter(h => Math.random() < heightMeta(h, pos));
      if (!hs.length) continue;
      const h = hs[Math.floor(Math.random() * hs.length)];
      const frames = bodiesFor([pos], [h, h], { frames: 3 });
      const body = frames[Math.floor(Math.random() * frames.length)];
      if (!body) continue;
      const picks = goals.filter(g => metaOf(g, pos) > 0.5).sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3));
      const opts = { values: { '*': 0, ...Object.fromEntries(picks.map(g => [g.name, 1 + Math.floor(Math.random() * 3)])) }, caps: {}, continuous: [],
        continuousWeights: {}, notFeel: [], minimums: attributes.map(() => 25), maximums: attributes.map(() => 99),
        breakers: { general: labCfg?.breakers?.general ?? 8, future: 0, special: { category: '' } }, mustHave: {}, mode: '5v5', metaRate: 1, archetypes: false };
      jobs.push({ kind: 'body', options: { body, opts } });
    }
    const out = await pool.runJobs(jobs, (done, total) => setBusy(`Building new builds… ${done}/${total}`));
    setBusy(null);
    addToPool(out.filter(r => r && !r.error && r.final).map(r => slim(r.body, r.final, 'generated')), 'new builds');
  }

  const choose = y => {
    if (!pair) return;
    const t = { ...taste, picks: [...taste.picks, { a: pair[0].id, b: pair[1].id, y, at: Date.now() }] };
    setTaste(t);
    pickNext(t, fittedTaste(t));
  };
  const undo = () => { if (!taste.picks.length) return; const last = taste.picks.at(-1), byId = new Map(taste.pool.map(x => [x.id, x]));
    setTaste(t => ({ ...t, picks: t.picks.slice(0, -1) })); if (byId.get(last.a) && byId.get(last.b)) setPair([byId.get(last.a), byId.get(last.b)]); };
  useEffect(() => {
    const key = e => {
      if (mode !== 'matchups' || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') choose(1); else if (e.key === 'ArrowRight') choose(0); else if (e.key === 'ArrowDown') choose(0.5);
      else if (e.key === 's') pickNext(); else if (e.key === 'Backspace') undo(); else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const setSetting = patch => setTaste(t => ({ ...t, settings: { ...t.settings, ...patch } }));
  const nudge = (k, by) => setTaste(t => { const v = (t.manual[k] ?? 0) + by, manual = { ...t.manual, [k]: v };
    if (Math.abs(v) < 1e-9) delete manual[k]; return { ...t, manual }; });
  const moved = useMemo(() => learned(w, pairs, taste.settings), [w, pairs, taste.settings]);
  const ranked = useMemo(() => {
    const house = [...taste.pool].sort((a, b) => metaScore(b.final, b.body.height, b.body.position) - metaScore(a.final, a.body.height, a.body.position));
    const at = new Map(house.map((x, k) => [x.id, k + 1]));
    return [...taste.pool].map(x => ({ x, s: scoreOf(x, w) })).sort((a, b) => b.s - a.s).slice(0, 10).map(r => ({ ...r, house: at.get(r.x.id) }));
  }, [taste.pool, w]);
  const exportPicks = () => {
    const blob = new Blob([JSON.stringify(taste, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'build-lab-my-meta.json' });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const importPicks = file => file?.text().then(txt => { const x = JSON.parse(txt);
    if (!Array.isArray(x?.pool) || !Array.isArray(x?.picks)) throw new Error('bad');
    setTaste({ ...emptyTaste(), ...x }); notify(`Loaded ${x.picks.length} picks.`); }).catch(() => notify('That file isn’t a My Meta export.'));
  const diff = pair ? differences(pair[0], pair[1]) : null;
  const ready = pairs.length >= MIN_PICKS;

  return <section className="taste">
    <div className="taste-head">
      <div><h2>My Meta</h2>
        <p className="muted">Answer questions about trades: which area pays for more passing, how to split points between two ratings.
          Each answer teaches a second scoring of your own: it starts from the house meta{taste.settings.fromHouse === false ? ' (off: you start from scratch)' : ''} and
          moves wherever you disagree with it, separately for each kind of build where your answers differ (a dunking big vs. one who
          doesn't). Then search the Lab with it.</p></div>
      <div className="taste-stats">
        <span><b>{taste.answers?.length ?? 0}</b><small>answers</small></span>
        {taste.picks.length > 0 && <span><b>{taste.picks.length}</b><small>matchups</small></span>}
        {stats?.mine != null && <span title="Picks predicted right by a model that never saw them (5-fold), decided picks only"><b>{Math.round(100 * stats.mine)}%</b><small>mine predicts you</small></span>}
        {stats && <span title="Picks where the house meta score agrees with you"><b>{Math.round(100 * stats.house)}%</b><small>house agrees</small></span>}
      </div>
    </div>

    <div className="seg-row" role="tablist">
      <button className={mode === 'questions' ? 'on' : ''} onClick={() => setMode('questions')}>Questions</button>
      <button className={mode === 'matchups' ? 'on' : ''} onClick={() => setMode('matchups')}>Matchups (two whole builds)</button>
    </div>
    {mode === 'questions' && <QuestionPanel taste={taste} setTaste={setTaste} pool={pool} breakers={breakers} notify={notify} />}
    {mode === 'matchups' && taste.pool.length < 2 ? <div className="taste-empty">
      <p>First, some builds to compare.</p>
      <PoolButtons busy={busy} fromLab={fromLab} fromSaved={fromSaved} generate={generate} library={library} />
    </div> : <>
      {mode === 'matchups' && <div className="matchup">
        {pair ? <>
          {[0, 1].map(s => <MatchCard key={s} x={pair[s]} only={s ? diff.onlyB : diff.onlyA} ratings={diff.ratings.map(r => r.i)} showHouse={showHouse}
            onPick={() => choose(s ? 0 : 1)} side={s ? 'right' : 'left'} />)}
          <div className="match-actions">
            <button className="primary" onClick={() => choose(1)}>◀ Left is better</button>
            <button onClick={() => choose(0.5)}>About the same</button>
            <button className="primary" onClick={() => choose(0)}>Right is better ▶</button>
            <button className="mini-btn" onClick={() => pickNext()} title="Can't judge this one (S)">Skip</button>
            <button className="mini-btn" disabled={!taste.picks.length} onClick={undo} title="Undo the last pick (Backspace)">Undo</button>
            <label className="check small"><input type="checkbox" checked={showHouse} onChange={e => setShowHouse(e.target.checked)} />Show house meta</label>
            <span className="muted small">Keys: ← → ↓ · S skip · Backspace undo</span>
          </div>
        </> : <p className="muted">You've compared every pair worth asking about: add more builds.</p>}
      </div>}

      <div className="taste-grid">
        <div className="config-block">
          <h3>What it learned</h3>
          {!moved.length ? <p className="muted small">Nothing yet: it's still the {taste.settings.fromHouse === false ? 'blank slate' : 'house meta'}.</p>
            : <table className="learned"><tbody>{moved.slice(0, 18).map(x => <tr key={x.key}>
              <td>{x.label}</td>
              <td className={x.delta > 0 ? 'up' : 'down'}>{x.key === 'house' ? `×${x.weight.toFixed(2)}` : `${x.delta > 0 ? '+' : ''}${x.delta.toFixed(1)}`}</td>
              <td className="muted small">{x.picks ? `${x.picks} picks` : 'set by you'}{taste.manual[x.key] ? ' · nudged' : ''}</td>
              <td className="nudge"><button className="mini-btn" title="Worth less" onClick={() => nudge(x.key, -0.1)}>−</button>
                <button className="mini-btn" title="Worth more" onClick={() => nudge(x.key, 0.1)}>+</button>
                {taste.manual[x.key] != null && <button className="mini-btn" title="Drop your nudge" onClick={() => nudge(x.key, -taste.manual[x.key])}>↺</button>}</td>
            </tr>)}</tbody></table>}
          <p className="muted small">In meta points: +3 means a build with it scores 3 more than the {taste.settings.fromHouse === false ? 'start' : 'house'} would
            give it. − / + nudge a weight by 1 point on top of what your picks say.</p>
        </div>

        <div className="config-block">
          <h3>Tuning</h3>
          <label className="check"><input type="checkbox" checked={taste.settings.fromHouse !== false}
            onChange={e => setSetting({ fromHouse: e.target.checked })} />Start from the house meta</label>
          <p className="muted small">Off: only your picks count (badges, takeovers, contact dunks, position, height, speed and agility). Needs many more picks
            to be any good.</p>
          <label className="field"><span>How hard the start holds</span>
            <input type="range" min={-2} max={2} step={0.5} value={Math.log2(taste.settings.trust ?? 1)}
              onChange={e => setSetting({ trust: 2 ** +e.target.value })} /></label>
          <p className="muted small">{(taste.settings.trust ?? 1) < 1 ? 'Loose: each pick moves it more (more noise too).' : (taste.settings.trust ?? 1) > 1
            ? 'Stiff: it takes many picks to move a weight.' : `Normal: a badge tier moves about ${(PRIOR.tier[1] * 10).toFixed(1)} meta points before it takes much evidence.`}</p>
          <button className="primary" disabled={!ready} onClick={() => { setLab(c => ({ ...c, algorithm: 'mine' })); onGoLab(); notify('Lab set to My Meta. Find builds to search with it.'); }}>
            Search the Lab with My Meta</button>
          {!ready && <p className="muted small">A few more answers first ({pairs.length}/{MIN_PICKS} comparisons; a question counts as one per version you didn't pick).</p>}
          <h4>Builds to compare</h4>
          <PoolButtons busy={busy} fromLab={fromLab} fromSaved={fromSaved} generate={generate} library={library} />
          <div className="row-buttons">
            <button className="mini-btn" onClick={exportPicks}>Export</button>
            <label className="mini-btn file-btn">Import<input type="file" accept="application/json" hidden onChange={e => importPicks(e.target.files[0])} /></label>
            <button className="mini-btn" disabled={!taste.picks.length && !taste.answers?.length && !Object.keys(taste.manual).length}
              onClick={() => { setTaste(t => ({ ...t, picks: [], answers: [], skipped: [], manual: {} })); notify('Answers, picks and nudges cleared (builds kept).'); }}>Clear answers</button>
          </div>
        </div>
      </div>

      {ranked.length > 0 && <div className="config-block full">
        <h3>Your top 10 of these builds</h3>
        <ol className="taste-top">{ranked.map(({ x, s, house }) => <li key={x.id}>
          <b>{x.body.position} {feet(x.body.height)}</b> <span className="muted small">{x.body.weight} lb</span> · mine {s.toFixed(1)}
          <span className="muted small"> · house #{house} ({shownMeta(x)} meta){house > 10 ? ' ▲' : ''}</span></li>)}</ol>
      </div>}
    </>}
  </section>;
}

function PoolButtons({ busy, fromLab, fromSaved, generate, library }) {
  return <div className="row-buttons">
    <button onClick={fromLab}>Add Lab results</button>
    <button onClick={fromSaved} disabled={!library.length}>Add saved builds</button>
    <button onClick={() => generate()} disabled={!!busy}>{busy ?? 'Generate 12 builds'}</button>
  </div>;
}

function MatchCard({ x, only, ratings, showHouse, onPick, side }) {
  return <article className={'match-card ' + side} onClick={e => { if (!e.target.closest('button')) onPick(); }}>
    <header><BodyLine body={x.body} />{showHouse && <span className="muted small">house {shownMeta(x)}</span>}</header>
    <MiniRatings final={x.final} highlight={ratings} height={x.body.height} />
    <div className="chips">{only.length ? only.map(g => <span key={g.name} className="chip" title={g.from ? `Other build: tier ${g.from}` : 'Other build: none'}>{g.label}</span>)
      : <span className="muted small">No badge the other doesn't have</span>}</div>
  </article>;
}
