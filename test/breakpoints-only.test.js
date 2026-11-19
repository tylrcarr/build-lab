import test from 'node:test';
import assert from 'node:assert/strict';
import { attributes } from '../src/engine.js';
import { metaScore, snapRating } from '../src/breakpoints.js';
import { fitTaste, scoreOf } from '../src/taste.js';

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));
const base = () => { const f = attributes.map(() => 75); f[idx.three_point] = 85; f[idx.driving_dunk] = 87; f[idx.defensive_rebound] = 90; f[idx.speed] = 82; return f; };

test('meta ratings count at breakpoints only: no creep between them, speed stays smooth', () => {
  // Block on a big: 81 and 83 open nothing past 80 (Rim Guardian), so they score the same; 84 (Paint Patroller silver) is more.
  const at = v => { const f = base(); f[idx.block] = v; return metaScore(f, 83, 'C'); };
  assert.equal(at(81), at(83));
  assert.ok(at(84) > at(83));
  assert.equal(snapRating(idx.block, 83, 83, 84, 75, 84), 80);
  const spd = v => { const f = base(); f[idx.speed] = v; return metaScore(f, 83, 'C'); };
  assert.ok(spd(79) > spd(78));
});

test('My Meta learns a preference the house meta does not have', () => {
  const mk = (id, dunk) => { const f = base(); f[idx.driving_dunk] = dunk; f[idx.vertical] = 80; return { id, body: { position: 'SF', height: 80 }, final: f }; };
  const pairs = Array.from({ length: 12 }, (_, k) => ({ a: mk('d' + k, 87 + (k % 3)), b: mk('n' + k, 80 - (k % 3)), y: 1 }));
  const before = scoreOf(pairs[0].a, fitTaste([])) - scoreOf(pairs[0].b, fitTaste([]));
  const w = fitTaste(pairs);
  assert.ok(scoreOf(pairs[0].a, w) - scoreOf(pairs[0].b, w) > before + 2);
});
