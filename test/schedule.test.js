import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, capsFor } from '../src/engine.js';
import { breakerSchedule } from '../src/breakpoints.js';

const ix = n => attributes.findIndex(a => a.name === n);
const body = { position: 'SF', height: 80, weight: 215, wingspan: 82 };
const ctx = { body, h: body.height, caps: capsFor(body) };
const opts = { values: {}, continuous: [], continuousWeights: {}, mode: '5v5', position: 'SF', metaRate: 1 };

test('Cap Breaker order: specialized breakers come first, then the run that buys the most per breaker', () => {
  const base = attributes.map(() => 70);
  base[ix('driving_dunk')] = 85; base[ix('vertical')] = 82; base[ix('three_point')] = 80;
  const breakers = attributes.map(() => 0);
  breakers[ix('agility')] = 1; breakers[ix('driving_dunk')] = 3; breakers[ix('three_point')] = 2;
  const plan = { base, breakers, category: 'shooting', specialCount: 2, body };
  const steps = breakerSchedule(plan, ctx, opts, []);
  assert.equal(steps.length, 6);
  assert.deepEqual(steps.slice(0, 2).map(s => s.attribute), [ix('three_point'), ix('three_point')], 'specialized (three) first');
  assert.ok(steps.slice(0, 2).every(s => s.specialized));
  // Then the dunk run (gold Posterizer) before the lone agility breaker.
  assert.equal(steps[2].attribute, ix('driving_dunk'));
});
