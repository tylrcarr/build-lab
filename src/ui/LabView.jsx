import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AttrBadges } from './AttrBadges.jsx';
import { gainsOf, gainsText, relaxations, relaxedSettings } from '../tradeoffs.js';
import HuntView from './HuntView.jsx';
const LAB_TABS = [['advanced', 'Build Search', 'Pick a preset or set every badge, rating and body rule, then find the best builds'],
  ['boost', 'Breaker Search', 'Pick the ratings you want Cap Breakers to carry and find the archetype where each breaker adds the most']];
import { HeightStrip, useWorkerJob } from './HeightStrip.jsx';
import { attributes, badgeTier, capsFor, feet, name, playerTypeCount, positions, tiers, typeWeights } from '../engine.js';
import { POTENTIAL_LATER, planScore, positionsFor, specText } from '../breakpoints.js';
import { CONTINUOUS_WEIGHTS, IMPORTANCE, MAX_CAP_BREAKERS, SPECIALIZATIONS, archetypeCandidates, archetypeScore, atBestPosition, byName, metaGrade, metaRating, nudgeBodies, pickArchetype, capOf, rankPlans, defaultPrefs, goals, heldTiers, metaScore, usesMeta, valueOf } from '../breakpoints.js';
import { META_CAPS, heightMeta, metaGroup, metaOf } from '../meta.js';
import { BROAD_VARIANTS, VARIANTS } from '../variants.js';
import { isAnimation } from '../animations.js';
import { isTakeover } from '../unlocks.js';
import { MIN_PICKS, TASTE_EVENT, fittedTaste, pairsOf, readTaste, tasteOpts } from '../taste.js';
import { tasteScore } from '../breakpoints.js';
import { requirementLabel } from '../unlocks.js';

import { ROLES, ROLE_GROUPS, applyRole } from '../roles.js';
import { derive, groups, tierShort } from '../derive.js';
import { badgeFloors } from '../badge-floors.js';
import { BreakerChartDetails } from './BreakerChart.jsx';
import { RatingReasons } from './RatingReasons.jsx';
import { Archetype, BodyLine, HeightRange, Info, MiniRatings, NumberInput, PositionToggles, Select, TierPill, disciplineColour, label,
  requirementText } from './common.jsx';

export const WIDE_POSITIONS = 3;
export const defaultLab = () => ({
  positions: [], heights: [69, 88], // see ALL_HEIGHTS
  breakers: { general: 8, future: 0, special: { category: 'shooting' } },
  mustHave: {}, thorough: false,
});

const goalLabel = g => g.label ?? label(g.name);
// Meta worth in words (best of guard / wing / big): 0 none, under 1 low, under 2 normal, under 3 high, 3+ top.
const metaWord = m => m <= 0 ? 'none' : m < 1 ? 'low' : m < 2 ? 'normal' : m < 3 ? 'high' : 'top';
const badgeGoals = goals.filter(g => !isAnimation(g));
const categories = [...new Set(badgeGoals.map(b => b.discipline))];

// Runs optimizer jobs in a worker. Returns [state, run, cancel].
export function useOptimize() {
  const worker = useRef(null);
  const [state, setState] = useState({ running: false });
  const cancel = () => { worker.current?.terminate(); worker.current = null; setState(s => ({ ...s, running: false })); };
  useEffect(() => cancel, []);
  const run = (kind, options) => {
    cancel();
    const w = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
    worker.current = w;
    const started = performance.now();
    setState({ running: true, kind });
    w.onmessage = ({ data }) => {
      if (data.progress) return setState(s => ({ ...s, progress: data.progress }));
      setState({ running: false, kind, error: data.error, result: data.result, ms: Math.round(performance.now() - started) });
      w.terminate(); worker.current = null;
    };
    w.onerror = () => setState({ running: false, error: 'The optimizer could not finish.' });
    w.postMessage({ kind, options });
  };
  return [state, run, cancel];
}

// Runs many optimizer jobs across a pool of workers (one per CPU core: the page itself only waits on them). runJobs resolves
// with results in job order; cancel() stops everything in flight.
// Workers are kept between the steps of a search (each new worker reloads the optimizer and HiGHS and starts cold, about
// a second per body), then shut down after IDLE_MS without work, when the view unmounts, or when the page is hidden for
// good. So nothing keeps running in the background once a search is done. Identical jobs within one run are answered
// from memory.
const IDLE_MS = 45000;
const workerUrl = new URL('../optimize-worker.js', import.meta.url);
export function usePool({ warm = false } = {}) {
  const idle = useRef([]), busy = useRef(new Set()), warming = useRef(new Set()), timer = useRef(null), token = useRef(0), memo = useRef(new Map());
  const size = Math.max(2, navigator.hardwareConcurrency || 4);
  const killIdle = () => { idle.current.forEach(w => w.terminate()); idle.current = []; };
  const armIdle = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (!busy.current.size) killIdle(); }, IDLE_MS); };
  const take = () => idle.current.pop() ?? new Worker(workerUrl, { type: 'module' });
  const release = w => { busy.current.delete(w); w.onmessage = null; w.onerror = null; idle.current.push(w); armIdle(); };
  // Stop what's running: busy workers are terminated (they may be mid-job); idle ones stay warm.
  const cancel = () => { busy.current.forEach(w => w.terminate()); busy.current.clear(); token.current++; memo.current.clear(); armIdle(); };
  const shutdown = () => { cancel(); killIdle(); warming.current.forEach(w => w.terminate()); warming.current.clear(); clearTimeout(timer.current); };
  useEffect(() => {
    const gone = () => shutdown();
    window.addEventListener('pagehide', gone);
    // Pre-warm: load the optimizer and HiGHS in a few workers before the first click.
    if (warm) Array.from({ length: Math.min(size, 4) }, () => {
      const w = new Worker(workerUrl, { type: 'module' }); warming.current.add(w);
      w.onmessage = () => { warming.current.delete(w); idle.current.push(w); w.onmessage = null; armIdle(); };
      w.onerror = () => { warming.current.delete(w); w.terminate(); };
      w.postMessage({ kind: 'warm' });
    });
    return () => { window.removeEventListener('pagehide', gone); shutdown(); };
  }, []);
  const runJobs = (jobs, onDone) => new Promise(resolve => {
    const results = new Array(jobs.length), mine = token.current;
    let next = 0, done = 0;
    if (!jobs.length) return resolve(results);
    const finish = (k, value) => { results[k] = value; done++; onDone?.(done, jobs.length); if (done === jobs.length) resolve(results); };
    const keyOf = job => job.kind === 'body' || job.kind === 'polish' ? JSON.stringify(job) : null;
    const feed = w => {
      if (mine !== token.current) return;
      while (next < jobs.length) {
        const k = next++, key = keyOf(jobs[k]);
        if (key && memo.current.has(key)) { finish(k, memo.current.get(key)); continue; }
        w.onmessage = ({ data }) => {
          if (data.progress) return;
          const value = data.error ? { error: data.error } : data.result;
          if (key && !data.error) memo.current.set(key, value);
          finish(k, value); feed(w);
        };
        w.onerror = () => { busy.current.delete(w); w.terminate(); finish(k, { error: 'Worker failed' }); if (next < jobs.length && mine === token.current) { const n = take(); busy.current.add(n); feed(n); } };
        w.postMessage(jobs[k]);
        return;
      }
      release(w);
    };
    for (let i = 0; i < Math.min(size, jobs.length); i++) { const w = take(); busy.current.add(w); feed(w); }
  });
  return { runJobs, cancel, token, size };
}

// Lab prefs + config → optimizer options.
export function optimizerOptions(rawPrefs, cfg) {
  // 3v3 weighting is gone from the UI (you pick the badges that matter for your mode): every search is 5v5.
  const prefs = rawPrefs;
  const minimums = attributes.map(a => Math.max(25, prefs.minimums?.[a.name] ?? 25));
  const maximums = attributes.map(a => prefs.maximums?.[a.name] ?? 99);
  const mustHave = { ...cfg.mustHave };
  // My Meta: your learned scoring instead of the house meta and your badge picks. Minimums, must-haves, positions, heights
  // and breakers still apply (they're rules, not taste).
  const taste = cfg.algorithm === 'mine' ? readTaste() : null;
  if (taste && pairsOf(taste).length >= MIN_PICKS) {
    const w = fittedTaste(taste), house = Math.max(0, w.house ?? 0);
    return { values: { '*': 0 }, caps: {}, continuous: [], notFeel: [], continuousWeights: {}, minimums, maximums,
      breakers: withPotential(cfg.breakers, cfg.breakers.potential || (cfg.breakers.future ?? 0) > 0), mustHave, mode: '5v5',
      metaRate: house > 0.02 ? house : 0, arms: null, heightPeak: null, taste: tasteOpts(w) };
  }
  return { values: prefs.values, caps: prefs.caps, continuous: prefs.continuous, notFeel: prefs.notFeel, continuousWeights: prefs.continuousWeights ?? {},
    minimums, maximums, breakers: withPotential(cfg.breakers, cfg.breakers.potential || (cfg.breakers.future ?? 0) > 0), mustHave, mode: '5v5', metaRate: rawPrefs.metaRate ?? 1, arms: rawPrefs.arms ?? null,
    heightPeak: rawPrefs.role ? rawPrefs.heightPeak ?? null : null };
}

// Search results survive reloads and tab switches (a comprehensive search takes minutes): the last run is kept, and
// each saved search keeps the results it had when saved. Stored apart from the searches list so a full storage can
// only lose results, never the searches themselves.
const RESULTS_KEY = 'build-lab.lab-results.v1', resultsKey = id => `build-lab.lab-results.${id}.v1`;
const readResults = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeResults = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const fromSaved = saved => saved?.result ? { running: false, result: saved.result, ms: saved.ms, restored: saved } : { running: false };

// useState kept in localStorage (per browser).
function useStored(key, initial) {
  const [v, setV] = useState(() => { try { const x = JSON.parse(localStorage.getItem(key)); return x ?? initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }, [v]);
  return [v, setV];
}

export default function LabView({ prefs, setPrefs, cfg, setCfg, searches, setSearches, onOpen, onCompare, onSave, notify, onStatus }) {
  const pool = usePool({ warm: true });
  const [state, setState] = useState(() => fromSaved(readResults(RESULTS_KEY)));
  // The search keeps running while you look at other tabs: the tab shows its clock.
  useEffect(() => onStatus?.(state.running ? { running: true, started: state.started } : null), [state.running]);
  const cancel = () => { pool.cancel(); setState(s => ({ ...s, running: false })); };
  // A finished run is saved as "last results" (restored ones already are).
  useEffect(() => {
    if (state.running || !state.result || state.restored) return;
    writeResults(RESULTS_KEY, { savedAt: Date.now(), thorough: !!cfg.thorough, ms: state.ms, result: state.result });
  }, [state.result, state.running]);
  // Build Search (presets + every rule) or Breaker Search. The old Quick tab is gone: a stored 'quick' opens Build Search.
  const [storedTab, setTab] = useStored('build-lab.lab-tab.v1', 'advanced');
  const tab = storedTab === 'boost' ? 'boost' : 'advanced';
  // Search with a trade-off: change that one setting (a minimum or must-have); Find builds runs it.
  const tryTradeoff = x => {
    if (x.kind === 'min') setPrefs(p => ({ ...p, minimums: { ...p.minimums, [x.attr]: x.value } }));
    else set(c => ({ mustHave: { ...c.mustHave, [x.badge]: x.tier ?? undefined } }));
    notify(`Set: ${x.title}. Find builds to search with it.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [searchName, setSearchName] = useState('');
  const [overwrite, setOverwrite] = useState(null); // name of an existing search waiting for "Overwrite?"
  const [sortBy, setSortBy] = useState('meta');
  const set = patch => setCfg(c => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  const sortMeta = r => { const m = f => metaScore(f, r.body.height, r.body.position), later = m(r.final);
    return r.future > 0 && r.today ? POTENTIAL_LATER * later + (1 - POTENTIAL_LATER) * m(r.today) : later; };
  const positionsUsed = cfg.positions.length ? cfg.positions : Object.keys(positions);
  // My Meta picks so far (re-read when the tab is shown: they're made on the My Meta tab).
  const [tasteVersion, setTasteVersion] = useState(0);
  useEffect(() => { const bump = () => setTasteVersion(v => v + 1); window.addEventListener(TASTE_EVENT, bump); return () => window.removeEventListener(TASTE_EVENT, bump); }, []);
  const tastePicks = useMemo(() => pairsOf(readTaste()).length, [tasteVersion]);
  const mineOn = cfg.algorithm === 'mine' && tastePicks >= MIN_PICKS;
  const resultTaste = state.result?.taste ?? null;
  useEffect(() => setSortBy(resultTaste ? 'mine' : 'meta'), [resultTaste]);
  const role = ROLES.find(r => r.id === prefs.role);


  // Screen bodies → optimize each kept body (natural + promising archetypes) in parallel → variations of the leaders.
  async function start() {
    pool.cancel();
    const mine = pool.token.current, started = performance.now();
    const live = () => mine === pool.token.current;
    // A wide search (three or more positions) is always comprehensive: the exact pass plans every position and height on
    // its own, so a center isn't left with whatever polish the guards didn't use (centers came out 93 in an all-positions
    // search and 95.6 when searched alone).
    const wide = positionsUsed.length >= WIDE_POSITIONS;
    const thorough = !!cfg.thorough, withExact = thorough || wide;
    // Each stage owns a slice of the overall bar ([from, to] in %), filled as its jobs finish. With the exact pass after it
    // (comprehensive), the search's stages share the first 62% (raw: a range already on the whole bar).
    const scale = (pct, raw) => withExact && !raw ? pct * 0.62 : pct;
    const progress = (label, [from, to], raw = false) => (done, total) => live() && setState(s => ({ ...s,
      progress: { label, done, total, pct: scale(from + (to - from) * (total ? done / total : 0), raw) } }));
    const stage = (label, pct) => live() && setState(s => ({ ...s, progress: { label, pct: scale(pct) } }));
    let opts = optimizerOptions(prefs, cfg);
    // The best n overall, plus the best of every position searched that isn't among them yet (each gets its own polish).
    const withEachPosition = (ranked, n) => {
      const top = ranked.slice(0, n);
      if (positionsUsed.length > 1) for (const p of positionsUsed) {
        const own = ranked.find(r => r.body.position === p);
        if (own && !top.includes(own)) top.push(own);
      }
      return top;
    };
    const where = { positions: positionsUsed, heights: cfg.heights };
    // The shortlist grows with the positions searched: a fixed 28 split five ways left about six bodies per position, so an
    // all-positions search missed elite builds a one-position search finds (Nov 2026: 11 elite of 12 across all positions,
    // while centers alone had 7 and guards alone 8). 28 for one position, 60 for all five.
    // A funnel: twice the bodies a search shows get a quick natural-archetype pass (about a second each); only the best of
    // those go on to the archetype sweep, nudges and polish. Screening alone can't tell which bodies end up most meta.
    const screen = o => pool.runJobs([{ kind: 'screen', options: { ...where, around: null, opts: o,
      keep: SHORTLIST + 8 * positionsUsed.length } }]); // a few spare: twins (same body at two positions) merge below
    setState({ running: true, started, progress: { label: 'Screening bodies', pct: 1 } });
    let [scr] = await screen(opts);
    if (!live()) return;
    if (scr.error) return setState({ running: false, error: scr.error });
    // Nothing fits with your breakers: find the version with as few extra as it takes (up to a year's worth) and show it.
    let needs = null;
    if (!scr.chosen.length) {
      setState(s => ({ ...s, progress: { label: 'Checking how many Cap Breakers it needs' } }));
      const [total] = await pool.runJobs([{ kind: 'minBreakers', options: { ...where, opts } }]);
      if (!live()) return;
      if (typeof total === 'number') {
        const have = opts.breakers.general + (opts.breakers.future ?? 0);
        opts = { ...opts, breakers: { ...opts.breakers, general: total - (opts.breakers.future ?? 0) } };
        [scr] = await screen(opts);
        if (!live()) return;
        if (scr.chosen?.length) needs = { have, total };
      }
    }
    if (!scr.chosen.length) {
      setState(s => ({ ...s, progress: { label: 'Finding what blocks the search' } }));
      const [bl] = await pool.runJobs([{ kind: 'blockers', options: { ...where, opts } }]);
      if (!live()) return;
      return setState({ running: false, ms: performance.now() - started,
        result: { results: [], screened: 0, bodies: scr.bodies, blockers: Array.isArray(bl) ? bl : [] } });
    }
    // Comprehensive: the search below plus an exact plan for every height (exactPlan: weight and wingspan picked in the same
    // solve as the ratings), merged. Measured on five setups (Nov 2026) it beats running the search below with every
    // archetype and more bodies, at about 60% of the time; on its own the exact plan misses some (a big with an 89 three
    // minimum gets nothing: its frame is picked after the caps), so it's an addition, not a replacement.
    const exactPlans = async () => {
      // Exact search: every height planned exactly with the frame as a decision (exactPlan: weight and wingspan are picked
      // in the same solve as the ratings, so there's no frame grid, nudging or separate polish), then the leaders re-planned
      // as other archetypes and, for a PF, from both ways to be meta (the shooter and the rebounder).
      const hm = ([p, h]) => heightMeta(h, p, opts.heightPeak);
      const pairs = positionsUsed.flatMap(p => (positions[p] ?? []).filter(r => r.height >= cfg.heights[0] && r.height <= cfg.heights[1]).map(r => [p, r.height]));
      const peak = Math.max(0, ...pairs.map(hm));
      const kept = pairs.filter(x => hm(x) >= peak * 0.25);
      const firsts = await pool.runJobs(kept.map(([position, height]) => ({ kind: 'exact', options: { position, height, opts } })),
        progress(`Planning every height exactly (${pool.size} at a time)`, [62, 80], true));
      if (!live()) return null;
      const plans = firsts.map(r => r && !r.error ? r : null);
      const ok = plans.filter(Boolean);
      const leaders = rankPlans(ok.map(r => atBestPosition(r, opts, positionsUsed)), opts).slice(0, 6)
        .map(x => plans.findIndex(r => r && r.final === x.final)).filter(k => k >= 0);
      // Phase 1 gives one build per height, so a narrow search (one height) would show one result: spread the second
      // phase's jobs over however many leaders there are (more archetypes each when there are few).
      const per = Math.max(2, Math.ceil(16 / Math.max(1, leaders.length)));
      const jobs = leaders.flatMap(k => [
        ...archetypeCandidates(plans[k], per).map(type => ({ k, type, from: null })),
        ...(metaGroup(plans[k].body.position) === 'big' ? [{ k, type: null, from: 'shoot' }, { k, type: null, from: 'boards' }, { k, type: null, from: 'score' }] : []),
      ]);
      const slimPlan = r => ({ body: r.body, base: r.base, manual: r.manual, breakers: r.breakers, final: r.final, playerType: r.playerType, value: r.value });
      const more = await pool.runJobs(jobs.map(({ k, type, from }) => ({ kind: 'exact', options: { position: plans[k].body.position,
        height: plans[k].body.height, opts, start: slimPlan(plans[k]), type, from } })), progress('Trying other archetypes exactly', [80, 95], true));
      if (!live()) return null;
      // Each is its own build (another archetype or way to be meta on that height); ranking and the near-twin merge below
      // sort out which ones show.
      more.forEach(x => { if (x && !x.error) plans.push({ ...x, polished: { exact: true } }); });
      return plans;
    };
    let plans;
    {
      // Two passes, both spread over every worker: each body in its natural archetype, then the same body forced into
      // other archetypes (each its own job). An archetype wins on picks + meta (see pickArchetype).
      const natural = await pool.runJobs(scr.chosen.map(c => ({ kind: 'body', options: { body: c.body, pinned: c.pinned,
        opts: { ...opts, archetypes: false } } })), progress(`Optimizing bodies (${pool.size} at a time)`, [6, 40]));
      if (!live()) return;
      stage('Trying other archetypes', 40);
      // The best of the natural pass go on, plus the best few of every role searched: a big's natural pass scores lower
      // than a guard's (the archetype sweep and polish lift bigs most), so an all-positions search used to drop every
      // center here, though 95-meta centers beat half the final list (Nov 2026).
      const ranked = rankPlans(natural.filter(r => r && !r.error).map(r => atBestPosition(r, opts, positionsUsed)), opts);
      const top = ranked.slice(0, MAX_BUILDS + 4 + 2 * (positionsUsed.length - 1));
      // Per position, not per role: PFs took every "big" slot and centers still never made it.
      if (positionsUsed.length > 1) for (const p of positionsUsed) top.push(...ranked.filter(r => r.body.position === p && !top.includes(r))
        .slice(0, Math.max(0, 3 - top.filter(r => r.body.position === p).length)));
      const finalists = new Set(top.map(r => r.manual + '|' + r.body.height + '|' + r.body.weight + '|' + r.body.wingspan));
      const isFinalist = r => finalists.has(r.manual + '|' + r.body.height + '|' + r.body.weight + '|' + r.body.wingspan);
      const alts = natural.flatMap((r, k) => !r || r.error || !isFinalist(r) ? [] : archetypeCandidates(r, 3).map(type => ({ k, type, mustHave: r.seed ? { ...opts.mustHave, [r.seed.name]: r.seed.tier } : opts.mustHave })));
      const forced = await pool.runJobs(alts.map(({ k, type, mustHave }) => ({ kind: 'body', options: { body: natural[k].body,
        // beat: the natural plan's score. A forced plan trailing it by more than the take-back pass can add skips that pass.
        opts: { ...opts, mustHave, forceType: type, archetypes: false, seeds: 0, beat: archetypeScore(natural[k], natural[k].body, opts) } } })),
        progress('Trying other archetypes on each body', [40, 66]));
      if (!live()) return;
      plans = natural.map((first, k) => {
        if (!first || first.error || !isFinalist(first)) return null;
        const mine = forced.filter((x, j) => alts[j].k === k && x && !x.error).map((x, j) => ({ ...x, forcedType: x.playerType }));
        const best = pickArchetype(first, mine, first.body, opts);
        return best === first ? first : { ...best, archetypeTrick: true, naturalValue: first.value, naturalType: first.playerType };
      });
      // Nudge the leaders' frames: a pound or an inch that opens a breakpoint they just miss (see nudgeBodies). Kept only
      // when the nudged build is really better (picks + meta, the same rule as archetypes).
      const leaders = withEachPosition(rankPlans(plans.filter(r => r && !r.error), opts), 8);
      // A preset that wants the longest arms (inside bigs) keeps them: no nudging to shorter ones.
      const nudges = leaders.flatMap(r => nudgeBodies(r, 3).map(n => ({ r, ...n })))
        .filter(n => opts.arms !== 'max' || n.body.wingspan >= n.r.body.wingspan);
      if (nudges.length) {
        // The nudged body keeps the leader's archetype as the seed: no full archetype sweep (that's 40–70% of a search for the
        // same results); the polish step below still tries other archetypes on whatever wins.
        const nudged = await pool.runJobs(nudges.map(n => ({ kind: 'body', options: { body: n.body, opts: { ...opts, archetypes: false } } })),
          progress('Nudging weight and wingspan toward breakpoints', [66, 78]));
        if (!live()) return;
        nudged.forEach((x, j) => {
          const n = nudges[j], k = plans.indexOf(n.r), cur = plans[k];
          if (!x || x.error || !cur || archetypeScore(x, n.body, opts) <= archetypeScore(cur, cur.body, opts) + 0.5) return;
          if (n.opens.every(o => x.final[o.i] < o.m)) return; // better, but not for the reason it was tried
          plans[k] = { ...x, nudged: { from: n.r.body, opens: n.opens.filter(o => x.final[o.i] >= o.m) } };
        });
      }
      // Polish the leaders: the greedy pass can stop at a worse arrangement than the best for what it reached (clicking
      // Re-optimize on a result often found a better build). Each leader is re-planned with every worthwhile tier it holds
      // kept, as its own and the likeliest other archetypes, plus an exact plan around it; the best replaces it.
      {
        const ok = plans.filter(r => r && !r.error);
        const top = withEachPosition(rankPlans(ok.map(r => atBestPosition(r, opts, positionsUsed)), opts), 8).map(x => ok.find(r => r.final === x.final));
        // 'fresh' = exact plan from scratch: every Cap Breaker off, re-placed by the solver (the greedy pass can't take back
        // a breaker it placed early on a rating that ends up between breakpoints), for the build's archetype and the likeliest
        // others (a 6'10" PF's best build was the 5th archetype on the list; the greedy pass never planned for it).
        const jobs = top.flatMap(r => {
          const types = [r.playerType, ...archetypeCandidates(r, 2)];
          const fresh = [r.playerType, ...archetypeCandidates(r, 3)].map(t => 'fresh:' + t);
          // A PF is a shooter or a rebounder (pfGate): plan the shooter version of every PF-capable leader too.
          if (positionsUsed.includes('PF') && positionsFor(r.body).includes('PF')) fresh.push('fresh-shoot:' + r.playerType, 'fresh-boards:' + r.playerType);
          return [null, 'mip', ...new Set(fresh), ...new Set(types)].map(type => ({ r, type }));
        });
        const slim = r => ({ body: r.body, base: r.base, manual: r.manual, breakers: r.breakers, final: r.final, playerType: r.playerType });
        const polished = await pool.runJobs(jobs.map(j => ({ kind: 'polish', options: { plan: slim(j.r), opts, type: j.type } })),
          progress('Polishing the leaders', [78, 92]));
        if (!live()) return;
        polished.forEach((x, j) => {
          const { r } = jobs[j], k = plans.indexOf(r), cur = plans[k];
          if (!x || x.error || !cur || archetypeScore(x, x.body, opts) <= archetypeScore(cur, cur.body, opts) + 0.05) return;
          plans[k] = { ...x, nudged: cur.nudged, polished: { from: archetypeScore(r, r.body, opts), exact: !!x.exact },
            ...(x.playerType !== r.playerType ? { archetypeTrick: true, naturalValue: r.value, naturalType: r.playerType } : {}) };
        });
      }
    }
    if (withExact) {
      const more = await exactPlans();
      if (!live() || !more) return;
      plans.push(...more);
    }
    // Same body dimensions + same ratings at different positions are one build (position only sets the name/meta group).
    // Each is shown as the legal position where it's the most meta.
    const results = [];
    for (const r of rankPlans(plans.filter(r => r && !r.error).map(r => atBestPosition(r, opts, positionsUsed)), opts)) {
      const twin = results.find(x => x.body.height === r.body.height && x.body.weight === r.body.weight && x.body.wingspan === r.body.wingspan
        && x.final.every((v, i) => v === r.final[i]));
      if (twin) twin.alsoPositions = [...(twin.alsoPositions ?? []), r.body.position];
      else results.push(r);
    }
    // Near-identical builds (same height and arms, ratings within a few points) are the same build at another weight:
    // keep the best, note the other weights.
    for (let k = results.length - 1; k > 0; k--) {
      const r = results[k];
      const twin = results.slice(0, k).find(x => x.body.height === r.body.height && x.body.wingspan === r.body.wingspan
        && x.playerType === r.playerType && x.final.reduce((s, v, i) => s + Math.abs(v - r.final[i]), 0) <= 6);
      if (twin) { twin.alsoWeights = [...(twin.alsoWeights ?? []), r.body.weight]; results.splice(k, 1); }
    }
    results.splice(thorough ? MAX_BUILDS * 2 : MAX_BUILDS);
    // Trade-offs: each of your requirements a notch lower (Elite → Good, a 93 dunk minimum → 87…), searched again on a few
    // bodies each, and kept when the points it frees buy something real. See tradeoffs.js.
    let options = [];
    const notes = [];
    // A tight search: the requirements only fit a few bodies and they all come down to a handful of builds. Say so (it looks
    // like the search gave up), and say where to look for more: the trade-offs, each one requirement a notch lower.
    if (results.length && results.length <= 3 && scr.screened >= results.length) {
      const fit = [...new Set(scr.chosen.map(c => c.body.position + ' ' + feet(c.body.height)))];
      notes.push(`Your must-haves and minimums only fit ${fit.length <= 3 ? fit.join(', ') : `${fit.length} sizes`}`
        + `, and every frame that fits comes down to ${results.length === 1 ? 'this build' : `these ${results.length} builds`}: with all of them,`
        + ` this is as far as ${opts.breakers.general + (opts.breakers.future ?? 0)} Cap Breakers go. For more speed or meta, something has to give —`
        + ' see the trade-offs below.');
    }
    const relax = results.length ? relaxations({ prefs, mustHave: cfg.mustHave }) : [];
    if (relax.length) {
      // Your own picks go through the same short search as each trade-off (a few bodies, natural archetype), so the
      // comparison is like for like: the #1 build above had the full search, and a quick pass would never beat it.
      const all = [opts, ...relax.map(x => { const st = relaxedSettings(x, { prefs, mustHave: cfg.mustHave });
        return optimizerOptions(st.prefs, { ...cfg, mustHave: st.mustHave }); })];
      const scrs = await pool.runJobs(all.map(o => ({ kind: 'screen', options: { ...where, opts: o, keep: 2 } })),
        progress('Trying trade-offs', [92, 94]));
      if (!live()) return;
      const jobs = scrs.flatMap((x, k) => (x?.chosen ?? []).slice(0, 2).map(c => ({ k, body: c.body })));
      const built = await pool.runJobs(jobs.map(j => ({ kind: 'body', options: { body: j.body, opts: { ...all[j.k], archetypes: false } } })),
        progress('Trying trade-offs', [94, 97]));
      if (!live()) return;
      const best = all.map(() => null);
      built.forEach((r, n) => { const k = jobs[n].k;
        if (r && !r.error && (!best[k] || planScore(r, all[k]) > planScore(best[k], all[k]))) best[k] = r; });
      const base = best[0] ?? results[0];
      const worth = (g, position) => Math.max(valueOf(prefs, g), usesMeta(prefs, g) ? metaOf(g, position) : 0);
      const metaOfR = r => metaScore(r.final, r.body.height, r.body.position);
      const baseMeta = metaOfR(base);
      const kept = best.slice(1).map((r, k) => {
        if (!r) return null;
        const gains = gainsOf(r, base, worth), badgeWorth = gains.badges.reduce((t, x) => t + x.w, 0), d = metaOfR(r) - baseMeta;
        // Worth showing: a better build, or about as good with real badges your picks don't get.
        if (!(d >= 1 || (d >= -1.5 && badgeWorth >= 3))) return null;
        return { r, k, tradeoff: { ...relax[k], gets: gainsText(gains), delta: d, score: d + 0.5 * badgeWorth } };
      }).filter(Boolean).sort((x, y) => y.tradeoff.score - x.tradeoff.score).slice(0, 6);
      // The ones shown get the polish the main builds had.
      const polished = await pool.runJobs(kept.map(x => ({ kind: 'polish', options: { plan: { body: x.r.body, base: x.r.base, manual: x.r.manual, breakers: x.r.breakers, final: x.r.final, playerType: x.r.playerType }, opts: all[x.k + 1], type: x.r.playerType } })),
        progress('Polishing trade-offs', [97, 100]));
      if (!live()) return;
      options = kept.map((x, n) => { const p = polished[n] && !polished[n].error && planScore(polished[n], all[x.k + 1]) > planScore(x.r, all[x.k + 1]) ? polished[n] : x.r;
        // top: the #1 build's meta, so the card says what the trade-off gains or loses next to it.
        return { ...p, tradeoff: { ...x.tradeoff, top: metaOfR(results[0]) } }; });
    }
    setState({ running: false, ms: performance.now() - started, result: { results, options, notes, screened: scr.screened, bodies: scr.bodies, needs,
      taste: opts.taste ?? null } });
  }

  function pickRole(r) {
    const { prefs: p, cfg: c } = applyRole(r);
    setPrefs(p);
    set(old => ({ positions: c.positions, heights: c.heights, mustHave: {},
      breakers: { ...old.breakers, special: { category: c.category } } }));
  }
  function reset() {
    setPrefs(defaultPrefs());
    setCfg(defaultLab());
    setSearchName(''); setOverwrite(null);
    notify('Lab reset to defaults.');
  }
  // One search per name: saving under an existing name asks first, then replaces it.
  function saveSearch(confirmed = false) {
    const title = searchName.trim() || `${role?.label ?? 'Custom'} · ${new Date().toLocaleDateString()}`;
    const clash = searches.find(x => x.title.toLowerCase() === title.toLowerCase());
    if (clash && !confirmed) { setOverwrite(title); return; }
    const entry = { id: clash?.id ?? crypto.randomUUID(), title, prefs, cfg: { ...cfg, from: null } };
    // Keep the results on screen with it (if any), so loading it shows them without running again.
    let kept = false;
    if (state.result && !state.running) {
      const saved = state.restored ?? { savedAt: Date.now(), thorough: !!cfg.thorough, ms: state.ms, result: state.result };
      kept = writeResults(resultsKey(entry.id), saved);
      if (kept) entry.hasResults = true;
    } else localStorage.removeItem(resultsKey(entry.id));
    setSearches(list => [entry, ...list.filter(x => x.id !== entry.id)].slice(0, 30));
    setSearchName(''); setOverwrite(null);
    notify((clash ? `Overwrote search “${title}”` : `Saved search “${title}”`)
      + (kept ? ' with its results.' : state.result ? ' (results too big to keep — storage is full).' : '.'));
  }

  const labTabs = <div className="toggles lab-tabs" role="tablist" aria-label="Lab mode">{LAB_TABS.map(([id, t, tip]) =>
    <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} title={tip} onClick={() => setTab(id)}>{t}</button>)}</div>;
  // Breaker Search (was Breaker Hunt, then Breaker Boost): its own search, inside the Lab.
  if (tab === 'boost') return <HuntView prefs={prefs} labCfg={cfg} notify={notify} onOpen={onOpen} onCompare={onCompare} onSave={onSave}
    header={<><h2>Build Lab</h2>{labTabs}</>} />;
  return <div className="lab">
    <section className="card">
      <div className="card-head"><div><h2>Build Lab</h2>
        {labTabs}</div>
        <div className="actions"><input type="text" placeholder="Search name (optional)" value={searchName} maxLength={60}
          onChange={e => { setSearchName(e.target.value); setOverwrite(null); }} /><button onClick={() => saveSearch()}>Save search</button>
          <button onClick={reset}>Reset</button></div></div>
      {overwrite && <div className="confirm-bar" role="alertdialog" aria-label="Overwrite search">
        <span>A search named <b>“{overwrite}”</b> already exists. Overwrite it?</span>
        <button className="primary" onClick={() => saveSearch(true)}>Overwrite</button>
        <button onClick={() => setOverwrite(null)}>Cancel</button></div>}

      {tab === 'advanced' && <>
      <div className="role-picker"><span className="eyebrow">Start from a preset</span>
        <div className="role-groups">{ROLE_GROUPS.map(([g, title]) => <div key={g} className="role-group">
          <h4>{title}</h4>
          <div className="role-list">{ROLES.filter(r => r.group === g).map(r => <button key={r.id} className={'role-card' + (prefs.role === r.id ? ' on' : '')}
            aria-pressed={prefs.role === r.id} title={r.blurb} onClick={() => pickRole(r)}>
            <span className="role-icon" aria-hidden>{r.icon}</span>
            <span className="role-text"><b>{r.label}</b><small>{r.positions.join('/')} · {feet(r.heights[0])}–{feet(r.heights[1])}{r.arms === 'max' ? ' · long arms' : ''}</small></span>
          </button>)}</div></div>)}</div>
        {role && <p className="role-blurb"><span aria-hidden>{role.icon}</span> <b>{role.label}:</b> {role.blurb} <span className="muted">Badges not listed are ∅ — adjust below.</span></p>}
      </div>
      {searches.length > 0 && <div className="saved-searches"><span className="muted small">Saved:</span>
        {searches.map(s => <span key={s.id} className="chip">
          <button className="linkish" title={s.hasResults ? 'Loads its settings and the results it was saved with' : undefined} onClick={() => {
            setPrefs(s.prefs); setCfg({ ...defaultLab(), ...s.cfg });
            const saved = s.hasResults ? readResults(resultsKey(s.id)) : null;
            if (saved) { pool.cancel(); setState(fromSaved(saved)); writeResults(RESULTS_KEY, saved); }
            notify(`Loaded “${s.title}”${saved ? ' with its results' : ''}.`);
          }}>{s.title}{s.hasResults ? ' ▤' : ''}</button>
          <button className="linkish" aria-label={`Delete ${s.title}`} onClick={() => { localStorage.removeItem(resultsKey(s.id)); setSearches(l => l.filter(x => x.id !== s.id)); }}>×</button></span>)}</div>}


      <div className="config-grid">
        <div className="config-block full filters">
          <div className="filter-tile">
            <h3>Positions</h3>
            <PositionToggles value={cfg.positions} onChange={positions => set({ positions })} />
            <p className="muted small">{cfg.positions.length ? `Searching ${cfg.positions.join(', ')}.` : 'None picked = every position.'}</p>
          </div>
          <div className="filter-tile">
            <h3>Cap Breakers</h3>
            <BreakerPlan value={cfg.breakers} onChange={breakers => set({ breakers })} />
          </div>
          <div className="filter-tile">
            <h3>Meta <Info label="About the meta">The everyday meta (rec, park, MyCareer): balanced builds, fast guards and wings, bigs who
              board. It fills whatever your picks and minimums leave. Off: only your picks count.</Info></h3>
            <div className="toggles" role="group" aria-label="Meta">{[[0, 'Off'], [1, 'On']].map(([v, t]) =>
              <button key={v} className={((prefs.metaRate ?? 1) > 0 ? 1 : 0) === v ? 'on' : ''} aria-pressed={((prefs.metaRate ?? 1) > 0 ? 1 : 0) === v}
                onClick={() => setPrefs(p => ({ ...p, metaRate: v }))}>{t}</button>)}</div>
            <p className="muted small">{(prefs.metaRate ?? 1) > 0 ? 'Fills what your picks leave with the everyday meta.' : 'Only your picks count.'}</p>
          </div>
          <div className="filter-tile filters-heights">
            <div className="fh-head"><h3>Heights</h3>
              <HeightRange value={cfg.heights} onChange={heights => set({ heights })} /></div>
            <SearchHeights positions={cfg.positions} minimums={prefs.minimums} mustHave={cfg.mustHave} breakers={cfg.breakers} value={cfg.heights} onChange={heights => set({ heights })} />
          </div>
        </div>
        <div className="config-block full">
          <AttributeRules prefs={prefs} setPrefs={setPrefs} mustHave={cfg.mustHave} category={cfg.breakers?.special?.category ?? ''} />
        </div>
        <div className="config-block full">
          <BadgeImportance prefs={prefs} setPrefs={setPrefs} mustHave={cfg.mustHave}
            setMustHave={fn => set(c => ({ mustHave: fn(c.mustHave) }))} />
        </div>
      </div>
      </>}
      {tab === 'advanced' && <div className="algo-row">
        <span className="muted small">Rank by</span>
        <div className="toggles" role="group" aria-label="Scoring">
          <button className={!mineOn ? 'on' : ''} aria-pressed={!mineOn} disabled={state.running} onClick={() => set({ algorithm: 'house' })}
            title="The Lab's own meta, plus your badge picks">House meta</button>
          <button className={mineOn ? 'on' : ''} aria-pressed={mineOn} disabled={state.running || tastePicks < MIN_PICKS} onClick={() => set({ algorithm: 'mine' })}
            title={tastePicks < MIN_PICKS ? `Make ${MIN_PICKS}+ picks in My Meta first` : 'The scoring you taught in My Meta (your badge picks are set aside; minimums and must-haves still count)'}>
            My Meta ({tastePicks} picks)</button></div>
        {mineOn && <span className="muted small">Your badge importance is set aside; minimums, must-haves and body rules still count.</span>}
      </div>}
      <div className="run-row">
        {tab === 'advanced' && <button className="primary big" disabled={state.running} onClick={start}>{state.running ? 'Optimizing…' : 'Find builds'}</button>}
        <label className="check" title="Adds an exact plan for every height (weight and wingspan solved together with the ratings) to the normal search. Takes about 1.5× as long; in tests it found a better build list on 4 of 5 setups.">
          <input type="checkbox" checked={!!cfg.thorough || positionsUsed.length >= WIDE_POSITIONS} disabled={state.running || positionsUsed.length >= WIDE_POSITIONS}
            onChange={e => set({ thorough: e.target.checked })} />Comprehensive search
          <span className="muted small">{positionsUsed.length >= WIDE_POSITIONS ? ' · always on for 3+ positions' : ' · ~1.5× longer'}</span></label>
        {state.running && <button onClick={cancel}>Cancel</button>}
        {state.running && <div className="search-progress">
          <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
            {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''} <Elapsed started={state.started} />
            <b className="pct">{Math.round(state.progress?.pct ?? 0)}%</b></p>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress?.pct ?? 0)}>
            <div className="progress-fill" style={{ width: `${Math.max(1, state.progress?.pct ?? 0)}%` }} /></div></div>}
        {!state.running && state.error && <p className="status-line warn">{state.error}</p>}
        {!state.running && state.restored && <p className="status-line muted small">Saved results from {new Date(state.restored.savedAt).toLocaleString()}
          {state.restored.thorough ? ' (comprehensive)' : ''} — run Find builds to refresh.
          <button className="mini-btn" onClick={() => { localStorage.removeItem(RESULTS_KEY); setState({ running: false }); }}>Clear</button></p>}
        {state.result && <p className="status-line">{state.result.screened} of {state.result.bodies} bodies can meet
          the must-haves and minimums{state.result.results.length < MAX_BUILDS && state.result.screened > state.result.results.length
            ? `; they come down to ${state.result.results.length} different build${state.result.results.length === 1 ? '' : 's'} (the rest are the same build at another weight)`
            : `; optimized the ${state.result.results.length} with the most room`}{state.ms ? ` in ${(state.ms / 1000).toFixed(1)} s` : ''}.
          {!state.result.results.length && ' Nothing fits.'}
          {state.result.bodies > 150 && <span className="muted small"> Searching fewer heights or positions is faster.</span>}</p>}
        {!state.running && state.result?.notes?.map(n => <p key={n} className="status-line small tight-note">{n}</p>)}
        {!state.running && state.result?.needs && <div className="needs-breakers warn small">
          Doesn't fit with your {state.result.needs.have} Cap Breakers. These builds use <b>{state.result.needs.total}</b> — the fewest that
          make it work (a year's max is about {MAX_CAP_BREAKERS}).
          <button className="mini-btn" onClick={() => { set(c => ({ breakers: { ...c.breakers, general: state.result.needs.total - (c.breakers.future ?? 0) } }));
            notify(`Lab set to ${state.result.needs.total} Cap Breakers.`); }}>Use {state.result.needs.total}</button></div>}
        {!state.running && state.result && !state.result.results.length && <Blockers list={state.result.blockers ?? []}
          apply={x => {
            for (const b of x.changes) {
              if (b.kind === 'must') set(c => ({ mustHave: { ...c.mustHave, [b.name]: b.to ?? undefined } }));
              else setPrefs(p => ({ ...p, minimums: { ...p.minimums, [b.name]: undefined } }));
            }
            notify('Changed — run Find builds again.');
          }} />}
      </div>
    </section>
    {state.result?.results?.length > 0 && <>
      {/* Potential searches rank on both ends (planScore): 60% with every breaker, 40% with the ones you have now. */}
      <h3 className="section-title">Builds <span className="muted small">the best build for each body. Open one in the Builder for a
        requirements-only template and other ways to spend the same body.</span></h3>
      <div className="sort-bar"><span className="muted small">Sort by</span>
        <div className="toggles" role="group" aria-label="Sort">{[...(resultTaste ? [['mine', 'My Meta']] : []), ['meta', 'Meta score'], ['picks', 'Your picks']].map(([id, text]) =>
          <button key={id} className={sortBy === id ? 'on' : ''} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>{text}</button>)}</div></div>
      <div className="results">{[...state.result.results].sort((a, b) => sortBy === 'mine' && resultTaste
        ? planScore(b, { taste: resultTaste }) - planScore(a, { taste: resultTaste })
        : sortBy === 'meta' ? sortMeta(b) - sortMeta(a) || b.value - a.value
        : b.value - a.value).map((r, k) =>
        <PlanCard key={k} rank={k + 1} plan={r} prefs={prefs} taste={resultTaste}
          onOpen={onOpen} onCompare={onCompare} onSave={onSave} positionsAllowed={positionsUsed} />)}</div>
      {state.result.options?.some(r => r.tradeoff) && <>
        <h3 className="section-title">Trade-offs <span className="muted small">ask a notch less for one thing and see what the
          points buy instead, next to your #1 build</span></h3>
        <div className="results">{state.result.options.filter(r => r.tradeoff).map((r, k) => <PlanCard key={k} plan={r} prefs={prefs}
          tradeoff={r.tradeoff} onTry={() => tryTradeoff(r.tradeoff)} onOpen={onOpen} onCompare={onCompare} onSave={onSave} positionsAllowed={positionsUsed} />)}</div>
      </>}
    </>}
  </div>;
}

// Options for one body (used by the Builder's recommender): Meta plus each direction, keeping only the ones that
// noticeably improve something real (their own direction, and more than a free-throw bump).
export const MAX_BUILDS = 12;
const SHORTLIST = MAX_BUILDS * 2 + 4;

export function pickOptions(meta, out, list = VARIANTS) {
  return list.map((v, k) => {
    const r = out[k];
    if (!r || r.error) return null;
    if (r.final.reduce((s, x, i) => s + Math.abs(x - meta.final[i]), 0) < 12) return null;
    if (v.id === 'most-badges') {
      const tiersOf = x => derive({ body: x.body, base: x.manual, breakers: x.breakers, category: x.category }).badgePoints;
      return tiersOf(r) >= tiersOf(meta) + 2 ? { ...r, variant: v } : null;
    }
    const gains = aspectsOf(r, meta, v).filter(d => d.good && d.text !== 'Better free throws');
    if (!gains.length || gains.reduce((s, d) => s + d.x, 0) < 8) return null;
    if (v.aspects && !gains.some(d => v.aspects.includes(d.text))) return null;
    return { ...r, variant: v };
  }).filter(Boolean);
}
export const META_OPTION = { id: 'meta', label: 'Meta', blurb: 'Your picks first, then meta badges and mobility for what’s left.' };

// Requirements only: musts, minimums and the specialization at their cheapest, with what's left to spend.
export function TemplateCard({ plan: p, prefs, mustHave, onOpen, openLabel = 'Open in Builder' }) {
  const t = p.template;
  // Breakers tried on the card, as on PlanCard: null = the template's own.
  const [tried, setTried] = useState(null);
  useEffect(() => setTried(null), [p]);
  const build = { body: p.body, base: t.manual, breakers: tried ?? t.breakers, budget: p.budget, category: p.category, specialCount: p.specialCount };
  const d = useMemo(() => derive(build), [p, tried]);
  const onStep = (i, count) => setTried(x => { const next = (x ?? t.breakers).map((n, j) => j === i ? count : n);
    return next.every((n, j) => n === t.breakers[j]) ? null : next; });
  const [chartOpen, setChartOpen] = useState(false), [focus, setFocus] = useState(null);
  const left = 99 - t.ovr;
  const musts = Object.entries(mustHave ?? {}).filter(([, x]) => x);
  return <article className="result plan is-template">
    <div className="variant-head"><b>Requirements only</b> <span className="muted small">{t.needsBreakers
      ? 'Your musts, minimums and specialization don’t fit under 99 without Cap Breakers, so this one uses them.'
      : 'Just your musts, minimums and the specialization from base ratings, no Cap Breakers — what every option below starts from.'}</span></div>
    <div className="template-left"><b>{left.toFixed(1)}</b> Overall left to spend <span className="muted small">(uses {t.ovr.toFixed(1)} of 99)</span></div>
    <MiniRatings final={d.final} caps={d.caps} breakers={d.applied} base={d.ratings} height={d.height}
      onPick={i => { if (chartOpen && focus === i) setChartOpen(false); else { setFocus(i); setChartOpen(true); } }} picked={chartOpen ? focus : null} />
    {chartOpen && focus != null && <AttrBadges d={d} i={focus} />}
    {musts.length > 0 && <div className="plan-badges"><h4>Musts</h4><div className="chips">{musts.map(([k, tier]) =>
      <span key={k} className="chip">{byName[k].tiers.length > 1 && <TierPill tier={tier} small />} {goalLabel(byName[k])}</span>)}</div></div>}
    <BreakerChartDetails d={d} open={chartOpen} onToggle={setChartOpen} focus={focus} onStep={onStep} edited={!!tried} onReset={() => setTried(null)} />
    <footer><button onClick={() => onOpen({ ...build, manual: t.manual })}
      title="Below 99 Overall: spend the rest yourself in the Builder">{openLabel}</button></footer>
  </article>;
}

// Suggestions when nothing fits: the single change that opens up the most bodies.
function Blockers({ list, apply }) {
  if (!list.length) return <p className="muted small">No single change fixes it — try a wider height range or more positions.</p>;
  const what = b => b.kind === 'must'
    ? (b.to ? <>Lower <b>{goalLabel(byName[b.name])}</b> must to {label(b.to)}</> : <>Drop the <b>{goalLabel(byName[b.name])}</b> must</>)
    : <>Remove the <b>{name(b.name)}</b> minimum ({b.from})</>;
  return <div className="blockers"><h4>What’s blocking it</h4>
    <ul className="offers">{list.map((x, k) => <li key={k}><span>{x.changes.map((b, j) => <React.Fragment key={j}>{j > 0 && ' + '}{what(b)}</React.Fragment>)}</span>
      <small>{x.count} bod{x.count === 1 ? 'y' : 'ies'} could work</small>
      <button className="mini-btn" onClick={() => apply(x)}>Apply</button></li>)}</ul></div>;
}

// [better, worse, attributes, points of change that count]
const ASPECTS = [
  ['Faster', 'Slower', ['speed', 'agility'], 5],
  ['Better handle', 'Worse handle', ['ball_handle', 'speed_with_ball'], 5],
  ['Better passing', 'Worse passing', ['pass_accuracy'], 4],
  ['Better shooting', 'Worse shooting', ['three_point', 'mid_range'], 5],
  ['Better free throws', 'Worse free throws', ['free_throw'], 6],
  ['Better dunking', 'Worse dunking', ['driving_dunk'], 4],
  ['Better layups', 'Worse layups', ['driving_layup', 'close_shot'], 6],
  ['Better standing dunk', 'Worse standing dunk', ['standing_dunk'], 6],
  ['Better post game', 'Worse post game', ['post_control'], 6],
  ['Better perimeter D', 'Worse perimeter D', ['perimeter_defense', 'steal'], 5],
  ['Better rim protection', 'Worse rim protection', ['interior_defense', 'block'], 5],
  ['Better rebounding', 'Worse rebounding', ['offensive_rebound', 'defensive_rebound'], 5],
  ['More athletic', 'Less athletic', ['vertical', 'strength'], 5],
];
// What a plan changes against another, in plain words: each aspect sums its attributes' change. The variation's own
// direction (variant.aspects) leads, then gains, then costs.
function aspectsOf(p, ref, variant) {
  const at = n => { const i = attributes.findIndex(a => a.name === n); return p.final[i] - ref.final[i]; };
  const out = [];
  for (const [better, worse, names, step] of ASPECTS) {
    const x = names.reduce((s, n) => s + at(n), 0);
    if (x >= step) out.push({ text: better, good: true, x });
    else if (x <= -step) out.push({ text: worse, good: false, x });
  }
  const own = d => !!variant?.aspects?.includes(d.text);
  return out.sort((a, b) => own(b) - own(a) || b.good - a.good || Math.abs(b.x) - Math.abs(a.x));
}

// The heat map for Build Search: where your minimums fit, by height, for the positions you picked.
const ALL_HEIGHTS = [69, 88];
function SearchHeights({ positions: list, minimums, mustHave, breakers, value, onChange }) {
  // Must-have badges count like minimums (each tier's cheapest way in): Paint Patroller Silver rules out heights too.
  const musts = Object.fromEntries(Object.entries(mustHave ?? {}).filter(([, t]) => t));
  const [rows, busy] = useWorkerJob('heightHeat', { positions: list, minimums, mustHave: musts, general: breakers.general + (breakers.future ?? 0),
    category: breakers.special?.category ?? '' }, 300);
  const all = value[0] <= ALL_HEIGHTS[0] && value[1] >= ALL_HEIGHTS[1];
  return <HeightStrip rows={rows} busy={busy} value={value} onChange={onChange} onAll={all ? null : () => onChange(ALL_HEIGHTS)} allLabel="Clear (all heights)" />;
}

// "Future potential": instead of guessing how many Cap Breakers you'll get, plan for a few more than you have (the next
// handful you'll realistically earn, not a season's 22) and keep the build playable now: results rank on both
// (POTENTIAL_LATER), each card shows the meta now and what the extra breakers unlock, and the breaker order says which of
// yours to apply first.
export const FUTURE_EXTRA = 4;
export const withPotential = (b, on = b.potential) => ({ ...b, potential: !!on, future: on ? FUTURE_EXTRA : 0 });
export function BreakerPlan({ value, onChange }) {
  const category = value.special?.category ?? '';
  const potential = !!value.potential || (value.future ?? 0) > 0;
  return <>
    <div className="breaker-settings">
      <label className="field compact"><span>Have now</span><NumberInput title="General Cap Breakers now" value={value.general} min={0} max={60}
        onChange={v => onChange(withPotential({ ...value, general: v }, potential))} /></label>
      <Select compact title="Specialization (+2)" value={category}
        options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => onChange({ ...value, special: { category: v } })} />
    </div>
    <label className="check small" title={`Plan for ${FUTURE_EXTRA} more Cap Breakers than you have: a build that works now and shows what the next few add.`}>
      <input type="checkbox" checked={potential}
        onChange={e => onChange(withPotential(value, e.target.checked))} />Optimize for future potential (+{FUTURE_EXTRA} Cap Breakers)</label>
    {category && <p className="muted small">{specText(category)
      ? `Needs ${specText(category)} base — kept automatically.`
      : 'No rating requirement for this specialization.'}</p>}
    {potential && <p className="muted small">Planned for {value.general + FUTURE_EXTRA} breakers; results show what the
      {' '}{FUTURE_EXTRA} extra unlock, and the breaker order says which {value.general} to apply first.</p>}
  </>;
}

// Feel weights and hard minimums in one table.
// A lock's source: a badge tier, or the specialization (its floors are base ratings, before Cap Breakers).
const srcText = x => x.spec ? `${name(x.spec)} specialization (base rating)` : `${goalLabel(x.goal)} ${label(x.tier)}`;
const srcShort = x => x.spec ? `${name(x.spec)} spec` : `${goalLabel(x.goal)} ${tierShort(x.tier)}`;
const srcKey = x => x.spec ? 'spec:' + x.spec : x.goal.name;

function AttributeRules({ prefs, setPrefs, mustHave, category = '' }) {
  const cw = prefs.continuousWeights ?? {}, mins = prefs.minimums ?? {}, maxs = prefs.maximums ?? {};
  const { floors, either, targets } = useMemo(() => badgeFloors(mustHave, prefs, category), [mustHave, prefs.values, prefs.caps, category]);
  const locked = key => Math.max(25, ...(floors[key] ?? []).map(x => x.min));
  const rows = attributes.filter(a => prefs.continuous.includes(a.name) || (mins[a.name] ?? 25) > 25 || (maxs[a.name] ?? 99) < 99
    || floors[a.name] || targets[a.name]);
  const setP = fn => setPrefs(p => ({ ...p, ...fn(p) }));
  const setWeight = (key, w) => setP(p => ({
    continuous: w ? [...new Set([...p.continuous, key])] : p.continuous.filter(k => k !== key),
    continuousWeights: { ...p.continuousWeights, [key]: w || undefined } }));
  // A minimum at or under what the badges already lock isn't yours: it's dropped (the lock shows instead).
  const setMin = (key, v) => setP(p => ({ minimums: { ...p.minimums, [key]: v > locked(key) ? v : undefined } }));
  const own = key => prefs.continuous.includes(key) || (mins[key] ?? 25) > 25 || (maxs[key] ?? 99) < 99;
  const remove = key => setP(p => ({ continuous: p.continuous.filter(k => k !== key), minimums: { ...p.minimums, [key]: undefined },
    maximums: { ...p.maximums, [key]: undefined } }));
  return <>
    <h3>Attributes</h3>
    <p className="muted small"><b>Feel</b> = worth raising for its own sake (10 points at Normal ≈ one badge tier). <b>Min</b> = hard floor
      (bodies that can’t reach it are skipped). <b>Max</b> = never pay past this, e.g. driving layup when you dunk everything.
      🔒 = the floor a must-have badge sets (orange edge on Min: type a higher number to raise it); ▸ = what a badge's Priority
      reaches for if there's room.</p>
    <div className="rules-table">
      <div className="rules-row head"><span>Attribute</span><span>Feel</span><span>Min</span><span>Max</span><span /></div>
      {rows.map(a => {
        const lock = locked(a.name), mine = mins[a.name] ?? 25, min = Math.max(lock, mine), max = maxs[a.name] ?? 99;
        const from = floors[a.name] ?? [], next = (targets[a.name] ?? []).filter(x => x.min > min);
        return <div key={a.name} className="rules-row">
          <span className="rule-name"><span><i style={{ background: disciplineColour(a.discipline) }} />{name(a.name)}</span>
            {from.map(x => <span key={srcKey(x)} className={'rule-src ' + (x.spec ? 'spec' : x.tier)} title={`${srcText(x)} needs ${name(a.name)} ${x.min}`}>
              🔒 {srcShort(x)} <b>{x.min}</b></span>)}
            {next.map(x => <span key={x.goal.name} className="rule-src soft" title={`${srcText(x)} needs ${name(a.name)} ${x.min} (your Priority: bought if there's room)`}>
              ▸ {goalLabel(x.goal)} {tierShort(x.tier)} <b>{x.min}</b></span>)}
            {max < min && <span className="rule-src bad" title="Your Max is under the minimum: nothing can fit">Max {max} is under {min}</span>}</span>
          <select aria-label={`${name(a.name)} feel weight`} value={prefs.continuous.includes(a.name) ? cw[a.name] ?? 1 : 0}
            onChange={e => setWeight(a.name, Number(e.target.value))}>
            <option value={0}>—</option>{CONTINUOUS_WEIGHTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          <NumberInput title={mine > lock ? `${name(a.name)} minimum (yours)` : lock > 25 ? `Locked at ${lock} by ${from.filter(x => x.min === lock).map(srcText).join(', ')}; type a higher number to raise it`
            : `${name(a.name)} minimum`} className={mine > lock ? 'set' : lock > 25 ? 'locked' : ''} value={min} min={lock}
            onChange={v => setMin(a.name, v)} />
          <NumberInput title={`${name(a.name)} maximum`} className={max < 99 ? 'set' : ''} value={max}
            onChange={v => setP(p => ({ maximums: { ...p.maximums, [a.name]: v } }))} />
          {own(a.name) ? <button className="mini-btn" aria-label={`Remove your rules on ${name(a.name)}`} title="Remove your rules (badge locks stay)"
            onClick={() => remove(a.name)}>×</button> : <span />}
        </div>; })}
    </div>
    {either.length > 0 && <div className="rule-either small">{either.map(x => <div key={srcKey(x)}>
      <span className={'rule-src ' + (x.spec ? 'spec' : x.tier)}>🔒 {srcShort(x)}</span> needs {x.branches.map(b =>
        b.map(([k, v]) => `${name(k)} ${v}`).join(' + ')).join(' or ')}{x.base ? ' base (before Cap Breakers)' : ''}
      <span className="muted"> · the search takes the cheaper one</span></div>)}</div>}
    <select aria-label="Add attribute rule" value="" onChange={e => e.target.value && setWeight(e.target.value, 1)}>
      <option value="">+ Add attribute…</option>
      {attributes.filter(a => !rows.includes(a)).map(a => <option key={a.name} value={a.name}>{name(a.name)}</option>)}
    </select>
  </>;
}

function BadgeImportance({ prefs, setPrefs, mustHave, setMustHave }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [onlyValued, setOnlyValued] = useState(false);
  const shown = badgeGoals.filter(b => (!category || b.discipline === category) && (!onlyValued || valueOf(prefs, b) > 0 || !!mustHave[b.name]) &&
    (!query || goalLabel(b).toLowerCase().includes(query.toLowerCase())));
  const must = Object.values(mustHave).filter(Boolean).length;
  const picked = b => !!mustHave[b.name] || valueOf(prefs, b) > 0;
  const sections = [['Your picks', shown.filter(picked)],
    ...categories.map(c => [categoryName(c), shown.filter(b => b.discipline === c && !picked(b))])].filter(([, list]) => list.length);
  const row = b => <GoalRow key={b.badge} goal={b} prefs={prefs} setPrefs={setPrefs} mustHave={mustHave} setMustHave={setMustHave} />;
  return <>
    <h3>Badges</h3>
    <div className="picker-tools">
      <input type="search" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
      <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
        <option value="">All categories</option>{categories.map(d => <option key={d} value={d}>{categoryName(d)}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={onlyValued} onChange={e => setOnlyValued(e.target.checked)} />Only my picks</label>
      {must > 0 && <button onClick={() => setMustHave(() => ({}))}>Clear {must} must</button>}
    </div>
    <div className="pick-head">{[0, 1].map(k => <div key={k} className="pick-cols">
      <span>Badge <span className="muted">· click for requirements</span></span>
      <span>Must have <Info label="Must have">Every result has at least this tier. Bodies that can't get it are skipped.</Info></span>
      <span>Priority <Info label="Priority">How much it's worth paying for on top of any Must: Skip, Low, Medium, High, Top. Auto lets the meta
        decide with whatever's left (the word after it is how much the meta likes this badge).</Info></span>
      <span>Max tier <Info end label="Max tier">The highest tier worth paying for, Musts included. Example: Break Starter gold saves 8 pass
        accuracy over HoF. On Auto it stops where the meta says the badge stops paying.</Info></span></div>)}</div>
    <div className="picker-list grouped">{sections.map(([title, list]) => <div key={title} className="pick-section">
      <h4>{title} <span className="muted small">{list.length}</span></h4>
      <div className="pick-grid">{list.map(row)}</div>
    </div>)}</div>
  </>;
}

const categoryName = c => c === 'takeover' ? 'Takeovers' : name(c);

// One badge or animation: Must (tier buttons), importance dropdown, "Up to" tier cap. Click the name to expand
// the per-tier requirements (accordion).
function GoalRow({ goal: b, prefs, setPrefs, mustHave, setMustHave }) {
  const [open, setOpen] = useState(false);
  const v = valueOf(prefs, b), cap = capOf(prefs, b), oneTier = b.tiers.length === 1, m = mustHave[b.name] ?? '';
  const options = oneTier ? [['', '–'], ['bronze', '✓']] : [['', '–'], ...tiers.map(t => [t, tierShort(t)])];
  const auto = usesMeta(prefs, b) || ((isAnimation(b) || isTakeover(b)) && prefs.values?.[b.name] === undefined);
  const setValue = x => setPrefs(p => { const values = { ...p.values }; if (x === 'auto') delete values[b.name]; else values[b.name] = x;
    return { ...p, role: undefined, values }; });
  const metaText = `Auto · meta ${metaWord(Math.max(metaOf(b, 'PG'), metaOf(b, 'SF'), metaOf(b, 'C')))}`;
  const setCap = x => setPrefs(p => ({ ...p, caps: { ...p.caps, [b.name]: x || undefined } }));
  return <div className={'pick-row' + (m ? ' on' : '') + (open ? ' open' : '')}>
    <div className="pick-main">
      <button className="pick-name linkish" aria-expanded={open} onClick={() => setOpen(!open)}
        title="Show requirements"><i style={{ background: disciplineColour(b.discipline) }} />{goalLabel(b)}
        {(b.height_inches[0] > 69 || b.height_inches[1] < 88) && <small>{feet(b.height_inches[0])}–{feet(b.height_inches[1])}</small>}
        <span className="caret">{open ? '▾' : '▸'}</span></button>
      <div className="tier-buttons">
        <span className="must-tbs">{options.map(([t, text]) => <button key={t || 'none'} className={'tb must-tb' + (m === t ? ' on' : '') + (t ? ' ' + t : ' none')}
          aria-pressed={m === t} title={t ? `Every result must have ${label(t)}` : 'Not required'}
          onClick={() => setMustHave(x => ({ ...x, [b.name]: t || undefined }))}>{text}</button>)}</span>
        <select className={'mini-select' + (!auto && v > 0 ? ' on' : '')} aria-label={`${goalLabel(b)} importance`} value={auto ? 'auto' : v}
          title={`How much it's worth paying for beyond any Must. Auto = the meta decides (leftover points/breakers only).` +
            ` Meta: guard ${metaOf(b, 'PG')} · wing ${metaOf(b, 'SF')} · big ${metaOf(b, 'C')} (of 3).`}
          onChange={e => setValue(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
          <option value="auto">{metaText}</option>
          {IMPORTANCE.map(([iv, t]) => <option key={iv} value={iv}>{t}</option>)}</select>
        {oneTier && <span className="muted small max-none">–</span>}
        {!oneTier && <select className="mini-select" aria-label={`${goalLabel(b)} highest tier worth buying`}
          value={prefs.caps?.[b.name] ?? 0}
          title="Highest tier worth paying for (applies to Musts too). Any: no limit on your picks; on Auto the meta stops where
it says the badge stops paying." onChange={e => setCap(Number(e.target.value))}>
          <option value={0}>{auto && META_CAPS[b.name] ? `${label(tiers[META_CAPS[b.name] - 1])} (meta)` : 'Any'}</option>
          {[1, 2, 3, 4].map(r => <option key={r} value={r}>{label(tiers[r - 1])}</option>)}</select>}
      </div>
    </div>
    {open && <div className="pick-detail">
      {b.tiers.map(t => <div key={t.tier} className="req-line">{!oneTier && <TierPill tier={t.tier} small />}
        <span>{requirementText(b, t.tier)}</span></div>)}
      {b.note && <p className="muted small">{b.note}</p>}
    </div>}
  </div>;
}

// Seconds since start, ticking.
export function Elapsed({ started }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  return started ? <b className="elapsed">{Math.floor((performance.now() - started) / 1000)}s</b> : null;
}

// One optimized plan: ratings, badges today vs. with future breakers, and the breaker order.
// positionsAllowed (optional): only list these as other positions (the ones the search covered).
// The meta score in words: how good the build is for everyday play, next to what the best builds at a position score.
export { metaGrade };
const shown = raw => Math.round(metaRating(raw));
export const META_HELP = 'Meta score (0–100): how good this build is for everyday play (rec, park, MyCareer), from the badges it unlocks and how'
  + ' much each is worth at its position, times its size, speed, shooting and rebounding. 90+ elite, 80+ great, 70+ good, 60+ normal,'
  + ' 50 or under bad.';
export function PlanCard({ plan: p, rank, prefs, current, onOpen, onCompare, onSave, variant, compareTo, mode = '5v5', openLabel = 'Open in Builder', positionsAllowed = null, showPicks = true, tradeoff = null, onTry, taste = null }) {
  // Breakers tried on the card (see BreakerChart onStep): null = the plan's own.
  const [tried, setTried] = useState(null);
  useEffect(() => setTried(null), [p]);
  const build = { body: p.body, base: p.manual, breakers: tried ?? p.breakers, budget: p.budget, category: p.category, specialCount: p.specialCount };
  const d = useMemo(() => derive(build), [p, tried]);
  const onStep = (i, count) => setTried(t => { const next = (t ?? p.breakers).map((n, j) => j === i ? count : n);
    return next.every((n, j) => n === p.breakers[j]) ? null : next; });
  const [chartOpen, setChartOpen] = useState(false), [focus, setFocus] = useState(null);
  const nowCount = (p.now ?? p.budget) + (p.specialCount ?? 0);
  const today = useMemo(() => p.today ? new Map(goals.map(b => [b.name, badgeTier(b, p.today, p.body.height)])) : null, [p]);
  const continuous = prefs.continuous.map(k => attributes.find(a => a.name === k).index);
  const reached = goals.map(g => ({ goal: g, tier: badgeTier(g, d.final, p.body.height) }))
    .filter(x => x.tier && (valueOf(prefs, x.goal) > 0 || (usesMeta(prefs, x.goal) && metaOf(x.goal, p.body.position) > 0)));
  const meta = metaScore(d.final, p.body.height, p.body.position, mode);
  // Every other position this exact body is legal at (caps don't depend on position, so it's the same build), with its
  // meta score there: a 6'7" SF can be the better SG.
  const others = [...new Set([...positionsFor(p.body), ...(p.alsoPositions ?? [])])]
    .filter(x => x !== p.body.position && (!positionsAllowed || positionsAllowed.includes(x)))
    .map(position => ({ position, meta: metaScore(d.final, p.body.height, position, mode) }))
    .sort((a, b) => b.meta - a.meta);
  const key = reached.filter(x => valueOf(prefs, x.goal) >= 2);
  const other = reached.filter(x => valueOf(prefs, x.goal) < 2);
  const chip = ({ goal, tier }) => {
    const now = today?.get(goal.name);
    const later = now !== tier;
    return <span key={goal.name} className={'chip' + (later ? ' later' : '')}
      title={(later ? `${now ? label(now) : 'Locked'} until the later breakers. ` : '') + (goal.note ?? requirementText(goal, tier))}>
      {goal.tiers.length > 1 && <TierPill tier={tier} small />} {goalLabel(goal)}{later && ' ⏳'}</span>;
  };
  const diff = useMemo(() => compareTo ? aspectsOf(p, compareTo, variant) : null, [p, compareTo, variant]);
  // Future potential: what the later breakers unlock (badge tiers, takeovers, contact dunks) and the ratings they raise.
  const laterGains = useMemo(() => !today ? [] : goals.map(goal => ({ goal, from: today.get(goal.name), to: badgeTier(goal, p.final, p.body.height) }))
    .filter(x => x.to && x.from !== x.to && (isTakeover(x.goal) || metaOf(x.goal, p.body.position) > 0 || valueOf(prefs, x.goal) > 0))
    .sort((a, b) => metaOf(b.goal, p.body.position) - metaOf(a.goal, p.body.position)), [p, today]);
  const laterRatings = !p.today ? [] : p.final.map((v, i) => ({ i, from: p.today[i], to: v })).filter(x => x.to > x.from);
  return <article className={'result plan' + (current ? ' is-current' : '') + (variant || tradeoff ? ' is-variant' : '')}>
    {tradeoff && <div className="variant-head tradeoff-head"><b>{tradeoff.title}</b>
      <span className="small">{tradeoff.gets ? <>Gets {tradeoff.gets}</> : 'Same badges, a better build overall'}
        {tradeoff.top != null && (() => { const dm = shown(meta) - shown(tradeoff.top);
          return dm !== 0 && <> · meta {dm > 0 ? '+' : ''}{dm} vs #1</>; })()}</span>
      {onTry && <button className="mini-btn" onClick={onTry}>Search with this</button>}</div>}
    {variant && <div className="variant-head"><b>{variant.label}</b> <span className="muted small">{variant.blurb}</span>
      {diff?.length > 0 && <div className="aspect-chips">{diff.map(d => <span key={d.text} className={'aspect ' + (d.good ? 'up' : 'down')}
        title={`${d.x > 0 ? '+' : ''}${d.x} rating points vs #1`}>{d.good ? '▲' : '▼'} {d.text}</span>)}</div>}</div>}
    <header>
      {!variant && !tradeoff && <div className="rank">{rank}</div>}
      <div><h3>{d.finalName ?? 'Unnamed build'}{current && <span className="chip">starting body</span>}
</h3><BodyLine body={p.body} others={others.map(o => o.position)} />
        {others.length > 0 && <div className="small muted also-pos" title={`Optimized as ${p.body.position} (meta ${shown(meta)}). The same body is legal at these positions too; meta score if you play it there.`}>
          As {others.map(o => <span key={o.position}><b>{o.position}</b> {shown(o.meta)}{shown(o.meta) > shown(meta) ? ' ▲' : ''}</span>).reduce((a, x) => [...a, ' · ', x], []).slice(1)} meta</div>}
        {p.alsoWeights?.length > 0 && <div className="small muted" title="The same build (within a few rating points) also works at these weights">Also {[...new Set(p.alsoWeights)].sort((x, y) => x - y).join(', ')} lb</div>}</div>
      <div className="result-stats">
        {p.future > 0 && p.today && !tried
          ? (() => { const m = shown(metaScore(p.today, p.body.height, p.body.position, mode));
            return <span title={`Meta now, with your ${nowCount} Cap Breakers. What the next ${p.future} add is listed under the ratings. ${META_HELP}`}>
              <b className={'meta-' + metaGrade(m)}>{m}</b><small>meta now</small></span>; })()
          : <span title={`${label(metaGrade(shown(meta)))}. ${META_HELP}`}><b className={'meta-' + metaGrade(shown(meta))}>{shown(meta)}</b><small>meta</small></span>}
        {taste && <span title="Your My Meta score (meta points on your own scale: compare between cards, not with the house number)">
          <b>{tasteScore(d.final, p.body.height, p.body.position, taste).toFixed(1)}</b><small>my meta</small></span>}
        {showPicks && !taste && <span title={tried ? 'Your picks score of the plan as optimized (the breakers you are trying change the other numbers)' : 'Your picks: your importance × tier + feel + meta for badges left on Auto'}
          className={tried ? 'stale' : ''}>{p.value.toFixed(1)}<small>picks</small></span>}
        <span title="Badge tiers unlocked">{d.unlocked.length}<small>badges</small></span>
        <span title="Cap Breakers planned">{d.breakerCount}<small>breakers</small></span>
      </div>
    </header>
    <MiniRatings final={d.final} highlight={continuous} caps={d.caps} breakers={d.applied} base={d.ratings} height={d.height}
      onPick={i => { if (chartOpen && focus === i) setChartOpen(false); else { setFocus(i); setChartOpen(true); } }} picked={chartOpen ? focus : null} />
    {chartOpen && focus != null && <AttrBadges d={d} i={focus} />}
    {p.future > 0 && p.today && !tried && <div className="plan-badges potential-gains"><h4>With {p.future} more Cap Breakers</h4>
      {laterGains.length ? <div className="chips">{laterGains.map(({ goal, from, to }) => <span key={goal.name} className="chip later"
        title={`${from ? label(from) : 'Locked'} now → ${label(to)} with the later breakers. ${goal.note ?? requirementText(goal, to)}`}>
        {goal.tiers.length > 1 && <TierPill tier={to} small />} {isTakeover(goal) ? 'Takeover: ' : ''}{goalLabel(goal)}</span>)}</div>
        : <p className="muted small">Nothing new unlocks: the extra breakers only add rating points.</p>}
      {laterRatings.length > 0 && <p className="muted small">{laterRatings.map(x => `${name(attributes[x.i].name)} ${x.from}→${x.to}`).join(' · ')}</p>}</div>}
    {key.length > 0 && <div className="plan-badges"><h4>Your top badges</h4><div className="chips">{key.map(chip)}</div></div>}
    {d.unlocked.length > key.length && <details className="plan-badges"><summary>All badges ({d.unlocked.length})</summary>
      <div className="chips">{[...other, ...d.unlocked.filter(u => !reached.some(x => x.goal.name === u.badge.name)).map(u => ({ goal: u.badge, tier: u.tier }))].map(chip)}</div></details>}
    {p.schedule?.length > 0 && <details className="plan-badges">
      <summary>Cap Breaker order ({p.schedule.length})</summary>
      <ol className="schedule">{p.schedule.map((s, k) => <React.Fragment key={k}>
        {k === nowCount && <li className="divider">Later ({p.schedule.length - nowCount})</li>}
        <li className={k >= nowCount ? 'later' : ''}><b>{name(attributes[s.attribute].name)}</b> {s.from}→{s.to}
          {s.specialized && <span className="chip">spec</span>}
          {s.gained.length > 0 && <small> {s.gained.map(g => `${goalLabel(goals.find(x => x.name === g.badge))}${goals.find(x => x.name === g.badge).tiers.length > 1 ? ' ' + tierShort(g.tier) : ''}`).join(', ')}</small>}</li>
      </React.Fragment>)}</ol>
    </details>}
    <BreakerChartDetails d={d} open={chartOpen} onToggle={setChartOpen} focus={focus} onStep={onStep} edited={!!tried} onReset={() => setTried(null)} />
    <RatingReasons d={d} prefs={prefs} />
    <footer>
      <button className="primary" onClick={() => onOpen({ ...build, manual: p.manual })}>{openLabel}</button>
      {onCompare && <button onClick={() => onCompare({ ...build, manual: p.manual })}>Compare</button>}
      {onSave && <button onClick={() => onSave({ ...build, manual: p.manual })}>Save</button>}

    </footer>
  </article>;
}
