// The Lab's Heights strip: for every height, whether your minimums and must-haves fit there, how much Overall is left once
// they're bought as cheaply as possible, and the frame (weight / wingspan) it takes.
import { attributes, positions } from './engine.js';
import { MAX_CAP_BREAKERS, bodiesFor, bodyRoom } from './breakpoints.js';

const optsFor = (minimums, general, category, mustHave = {}) => ({ values: { '*': 0 }, caps: {}, continuous: [], continuousWeights: {}, mustHave,
  mode: '5v5', metaRate: 1, minimums: attributes.map(a => minimums[a.name] ?? 25), maximums: attributes.map(() => 99),
  breakers: { general, future: 0, special: { category } } });
// Can any body of these positions and heights have these minimums? 'ok', 'breakers' (only with more Cap Breakers), 'body' (no
// frame has the caps) or 'budget' (doesn't fit in 99 Overall even with every Cap Breaker). Best room and body too.
function fitAt(positionList, minimums, general, heights, category, { all = false, mustHave = {} } = {}) {
  const o = optsFor(minimums, general, category, mustHave);
  const bodies = bodiesFor(positionList, heights, { frames: all ? 3 : 1, opts: o });
  if (!bodies.length) return { status: 'body' };
  let best = null;
  const fitting = [];
  for (const body of bodies) {
    const room = bodyRoom(body, { ...o, position: body.position });
    if (room == null) continue;
    fitting.push(body);
    if (!best || room > best.room) { best = { room, body }; if (!all) break; }
  }
  // The frame it takes: bodiesFor only returns frames whose caps allow the picks (all of them when nothing is picked).
  if (best) return { status: 'ok', ...best, frame: all ? frameNeed(fitting) : '' };
  const more = optsFor(minimums, MAX_CAP_BREAKERS, category, mustHave);
  return bodies.some(body => bodyRoom(body, { ...more, position: body.position }) != null) ? { status: 'breakers' } : { status: 'budget' };
}

// The heat map: every height these positions come in, whether the minimums fit there, the Overall left and the frame it takes.
// minimums: { name: rating }; mustHave: { badge: tier }; category: the specialization ('' for none).
export function heightHeat(positionList, minimums = {}, general = 8, category = '', mustHave = {}) {
  const list = positionList.length ? positionList : Object.keys(positions);
  const hs = list.flatMap(p => positions[p].map(r => r.height)), out = [];
  for (let h = Math.min(...hs); h <= Math.max(...hs); h++) {
    const f = fitAt(list, minimums, general, [h, h], category, { all: true, mustHave });
    out.push({ height: h, status: f.status, room: f.room ?? null, body: f.body ?? null, frame: f.frame ?? '' });
  }
  return out;
}

// What frame your picks need at a height, from every body that fits there: 'light' when none of the heavier third fits,
// 'short arms' when none of the longer third does, and so on. Empty when any frame works.
export function frameNeed(fitting) {
  if (!fitting.length) return '';
  const row = positions[fitting[0].position]?.find(r => r.height === fitting[0].height);
  if (!row) return '';
  const rel = (v, lo, hi) => hi > lo ? (v - lo) / (hi - lo) : 0.5;
  const ws = fitting.map(b => rel(b.weight, row.minWeight, row.maxWeight)), ss = fitting.map(b => rel(b.wingspan, row.minWingspan, row.maxWingspan));
  const side = (xs, low, high) => Math.max(...xs) <= 0.34 ? low : Math.min(...xs) >= 0.66 ? high : '';
  return [side(ws, 'light', 'heavy'), side(ss, 'short arms', 'long arms')].filter(Boolean).join(', ');
}
