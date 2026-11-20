import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { attributes } from '../src/engine.js';
import { tasteCtx, tasteScore } from '../src/breakpoints.js';
import { setMipSolver } from '../src/mip.js';
import { fitTaste, pairsOf, scoreOf, tasteOpts, emptyTaste } from '../src/taste.js';
import { payQuestion } from '../src/questions.js';

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));
// A 7'0" center; dunk (87 = dunker) and the close shot / passing split set per case.
const center = (dunk, close, pass) => {
  const f = attributes.map(() => 70);
  Object.assign(f, { [idx.driving_dunk]: dunk, [idx.close_shot]: close, [idx.pass_accuracy]: pass, [idx.post_control]: 75, [idx.block]: 84,
    [idx.defensive_rebound]: 92, [idx.offensive_rebound]: 90, [idx.strength]: 84, [idx.vertical]: 75 });
  return { body: { position: 'C', height: 84, weight: 240, wingspan: 88 }, final: f };
};
// One answer: the first version beat each of the others.
const answer = (...options) => ({ options, chosen: 0 });

test('folding families and context into tier weights is exact: the optimizer scores what the model scores', () => {
  const t = { ...emptyTaste(), answers: [answer(center(87, 78, 89), center(87, 94, 62)), answer(center(80, 88, 71), center(80, 74, 89))] };
  const w = fitTaste(pairsOf(t));
  const opts = tasteOpts(w);
  for (const x of [center(87, 78, 89), center(80, 82, 85), center(93, 90, 80)])
    assert.ok(Math.abs(scoreOf(x, w) - tasteScore(x.final, 84, 'C', opts)) < 1e-6, tasteCtx('C', x.final));
});

test('a lesson on dunking bigs carries to a new dunking big, and a disagreeing answer splits off post bigs', () => {
  // Three answers on dunking centers: passing over close shot, each time on different values (different badge tiers).
  const hi = [answer(center(87, 78, 89), center(87, 94, 62), center(87, 86, 82)), answer(center(90, 76, 90), center(90, 90, 74)),
    answer(center(88, 80, 86), center(88, 92, 66))];
  const prefersPass = (w, dunk) => scoreOf(center(dunk, 77, 88), w) - scoreOf(center(dunk, 92, 66), w);
  const w1 = fitTaste(pairsOf({ ...emptyTaste(), answers: hi }));
  assert.ok(prefersPass(w1, 89) > 0, 'carries to a fresh dunking center');
  // Before any post-big answer the lesson carries there too (weaker); one answer saying otherwise flips it there only.
  assert.ok(prefersPass(w1, 78) > 0);
  const lo = [answer(center(78, 90, 72), center(78, 76, 88))];
  const w2 = fitTaste(pairsOf({ ...emptyTaste(), answers: [...hi, ...lo] }));
  assert.ok(prefersPass(w2, 78) < 0, 'one answer flips post bigs');
  assert.ok(prefersPass(w2, 89) > 0, 'dunking centers keep their lesson');
});

test('a "pay for it" question changes only the asked rating and the one area that pays', async () => {
  await createRequire(import.meta.url)('highs')().then(setMipSolver);
  const q = payQuestion({ position: 'C', height: 84, dunk: true, attr: 'pass_accuracy', breakers: { general: 8, future: 0, special: { category: 'shooting' } } });
  assert.ok(q && q.options.length >= 3);
  const start = q.options[0];
  assert.ok(start.final[idx.pass_accuracy] < q.target);
  const areas = { inside: ['close_shot', 'post_control', 'driving_layup'], dunking: ['driving_dunk', 'standing_dunk'], shooting: ['mid_range', 'three_point', 'free_throw'],
    playmaking: ['ball_handle', 'speed_with_ball'], defense: ['interior_defense', 'perimeter_defense', 'steal', 'block'],
    rebounding: ['offensive_rebound', 'defensive_rebound'], athleticism: ['speed', 'agility', 'strength', 'vertical'] };
  for (const o of q.options.slice(1)) {
    assert.ok(o.final[idx.pass_accuracy] >= q.target);
    attributes.forEach((a, i) => {
      if (a.name === 'pass_accuracy') return;
      if (areas[o.area].includes(a.name)) assert.ok(o.final[i] <= start.final[i], `${o.tag}: ${a.name} only goes down`);
      else assert.equal(o.final[i], start.final[i], `${o.tag}: ${a.name} unchanged`);
    });
  }
});

test('the question plan never repeats a question and rarely asks about the same rating twice in a row (only among the last leftovers)', async () => {
  const { questionPlan, specKey, DEFAULT_PLACES } = await import('../src/questions.js');
  for (const places of [DEFAULT_PLACES, [['C', 84]], [['SG', 78], ['C', 84]]]) {
    const plan = questionPlan(places, {});
    assert.equal(new Set(plan.map(specKey)).size, plan.length);
    const r = s => s.attr ? [s.attr] : s.pair;
    const clashes = plan.slice(1).filter((s, i) => r(s).some(x => r(plan[i]).includes(x))).length;
    assert.ok(clashes <= Math.ceil(plan.length / 20), `${places}: ${clashes} back-to-back repeats of a rating`);
  }
});

test('"about the same" answers count as ties between the tied versions, and each still beats the rest', () => {
  const t = { ...emptyTaste(), answers: [{ options: [center(87, 78, 89), center(87, 94, 62), center(87, 86, 82)], chosen: 0, best: [0, 2] }] };
  const ys = pairsOf(t).map(p => p.y).sort();
  assert.deepEqual(ys, [0.5, 1, 1]);
});
