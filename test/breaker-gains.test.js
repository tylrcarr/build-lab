import test from 'node:test';
import assert from 'node:assert/strict';
import { attributes, capsFor, ladder, overall } from '../src/engine.js';
import data from './breaker-gains.json' with { type: 'json' };

// ladder() (the Cap Breaker step formula) against every measured gain: the build's winning archetype decides the steps.
test(`Cap Breaker gains reproduce all ${data.count} measured applications`, () => {
  const caps = capsFor(data.body), h = data.body.height;
  let checked = 0;
  for (const [scenario, byAttr] of Object.entries(data.gains)) for (const [a, byRating] of Object.entries(byAttr)) for (const [r, gains] of Object.entries(byRating)) {
    const i = Number(a), rating = Number(r);
    const v = scenario === 'isolated' ? attributes.map(() => 25) : caps.slice();
    v[i] = rating;
    const steps = ladder(i, rating, caps[i], h, overall(v, h).playerType);
    gains.forEach((g, k) => { assert.equal(steps[k], g, `${scenario} ${attributes[i].name} from ${rating}, breaker ${k + 1}`); checked++; });
  }
  assert.equal(checked, data.count);
});
