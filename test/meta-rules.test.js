import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, capsFor } from '../src/engine.js';
import { metaScore, nearOf, nudgeBodies } from '../src/breakpoints.js';
import { pfGate, reboundGate } from '../src/meta.js';

const ix = n => attributes.findIndex(a => a.name === n);
const flat = v => attributes.map(() => v);

test('bigs (and tall non-handlers) are punished hard for a low defensive rebound', () => {
  assert.equal(reboundGate(90, 'C', 83, 60), 1);
  assert.ok(reboundGate(70, 'C', 83, 60) <= 0.56, '70 board on a C');
  assert.ok(reboundGate(70, 'SF', 82, 50) < 1, "6'10\" SF who doesn't handle");
  assert.equal(reboundGate(60, 'SG', 76, 50), 1, 'guards are not');
  // Centers are unchanged: a fade under 85.
  assert.equal(reboundGate(85, 'C', 83, 60), 1);
  // PF: silver Possession Closer (87) is a cliff.
  assert.equal(reboundGate(87, 'PF', 82, 50), 1);
  assert.ok(reboundGate(86, 'PF', 82, 50) <= 0.9, '86 misses silver');
  assert.ok(reboundGate(79, 'PF', 82, 52) < 0.5, '79 board on a PF');
  assert.ok(reboundGate(79, 'SF', 82, 52) > 0.8, 'only a fade on a wing');
  assert.equal(reboundGate(79, 'SF', 80, 52), 1, "6'8\" SF");
  const f = flat(80); f[ix('three_point')] = 80;
  const lo = [...f]; lo[ix('defensive_rebound')] = 70;
  assert.ok(metaScore(f, 83, 'C') > metaScore(lo, 83, 'C') * 1.4);
});

test('93 driving dunk is a cliff; 94-98 add nothing', () => {
  const f = flat(80); f[ix('vertical')] = 85;
  const at = v => { const g = [...f]; g[ix('driving_dunk')] = v; return metaScore(g, 80, 'SF'); };
  assert.ok(at(93) - at(92) > 1.5);
  assert.ok(at(95) - at(93) < 0.05);
});

test('a badge tier one Cap Breaker away counts for part of its worth, less with fewer breakers left', () => {
  const body = { position: 'C', height: 83, weight: 250, wingspan: 88 };
  const base = flat(70); base[ix('strength')] = 82; base[ix('three_point')] = 80;
  const r = { body, base, breakers: attributes.map(() => 0), playerType: null, final: base };
  const plain = metaScore(base, 83, 'C'), near = metaScore(base, 83, 'C', '5v5', nearOf(r));
  assert.ok(near > plain, 'Brick Wall silver (83 strength) is one breaker away');
  const used = { ...nearOf(r), used: 26 };
  assert.ok(metaScore(base, 83, 'C', '5v5', used) < near, 'fewer breakers left, less credit');
});

test('weight nudges open a breakpoint the build just misses', () => {
  const body = { position: 'C', height: 83, weight: 222, wingspan: 85 };
  const final = flat(70); final[ix('defensive_rebound')] = capsFor(body)[ix('defensive_rebound')];
  const out = nudgeBodies({ body, final }, 4);
  assert.ok(out.length > 0);
  for (const n of out) for (const o of n.opens) assert.ok(capsFor(n.body)[o.i] >= o.m && capsFor(body)[o.i] < o.m);
});

test('Post Fade Phenom is worth nothing at bronze', () => {
  const f = flat(60); f[ix('three_point')] = 80;
  const g = [...f]; g[ix('post_control')] = 56; // bronze needs 55 post / 60 mid
  assert.ok(Math.abs(metaScore(g, 80, 'SF') - metaScore(f, 80, 'SF')) < 0.01);
});

test('a 95 board center is far more meta than a 90 one', () => {
  const f = flat(80); f[ix('three_point')] = 80; f[ix('offensive_rebound')] = 80; f[ix('driving_dunk')] = 85;
  const at = v => { const g = [...f]; g[ix('defensive_rebound')] = v; return metaScore(g, 83, 'C'); };
  assert.ok(at(95) - at(90) > 2 * (at(90) - at(87)), `95 ${at(95)} vs 90 ${at(90)} vs 87 ${at(87)}`);
});

test('no finishing (dunk and layup both low) is a liability', () => {
  const f = flat(80); f[ix('three_point')] = 80;
  const g = [...f]; g[ix('driving_dunk')] = 72; g[ix('driving_layup')] = 70;
  assert.ok(metaScore(g, 83, 'C') < metaScore(f, 83, 'C') * 0.85);
});

test('a slow wing loses meta: 78 speed on a 6\'8" SF is below the floor', () => {
  const f = flat(80); f[ix('three_point')] = 80; f[ix('speed')] = 86;
  const slow = [...f]; slow[ix('speed')] = 78;
  assert.ok(metaScore(f, 80, 'SF') - metaScore(slow, 80, 'SF') > 1.5);
});

test('wings and guards: strength past ~76 only pays for a real dunker, and less the smaller the player', () => {
  const f = flat(80); f[ix('three_point')] = 80; f[ix('perimeter_defense')] = 86; f[ix('ball_handle')] = 86;
  const at = (strength, dunk, h = 80, pos = 'SF') => { const g = [...f]; g[ix('strength')] = strength; g[ix('driving_dunk')] = dunk; return metaScore(g, h, pos); };
  assert.ok(at(85, 80) - at(76, 80) < 0.3, 'no dunk: 85 strength is barely worth more than 76');
  assert.ok(at(85, 93) - at(76, 93) > at(85, 80) - at(76, 80), 'a 93 dunker gets something for it');
  assert.ok(at(76, 80, 74, 'PG') - at(60, 80, 74, 'PG') < at(76, 80) - at(60, 80), 'a 6\'2" guard needs less strength than a 6\'8" wing');
});

test('a big under 75 strength (no Brick Wall) loses meta; guards and wings do not', () => {
  const f = flat(80); f[ix('defensive_rebound')] = 95; f[ix('driving_dunk')] = 87;
  const at = (s, pos, h) => { const g = [...f]; g[ix('strength')] = s; return metaScore(g, h, pos); };
  assert.ok(at(75, 'C', 84) > at(71, 'C', 84) * 1.08, '71 strength center');
  assert.ok(at(76, 'C', 84) - at(75, 'C', 84) < 0.5, 'nothing special past bronze');
  assert.ok(Math.abs(at(75, 'SG', 78) - at(71, 'SG', 78)) < 1, 'guards are not punished');
});

test('an SF needs block; the same body without it is the better SG', () => {
  const f = flat(84); f[ix('driving_dunk')] = 87; f[ix('vertical')] = 80;
  const at = (b, pos) => { const g = [...f]; g[ix('block')] = b; return metaScore(g, 80, pos); };
  assert.ok(at(78, 'SF') > at(52, 'SF') + 3);
  assert.ok(Math.abs(at(82, 'SF') - at(78, 'SF')) < 0.5, 'nothing past 78');
  assert.ok(at(52, 'SG') > at(52, 'SF'));
});

test("a big's passing pays off only with the board (Break Starter) or the handle (Dimer, Versatile Visionary)", () => {
  const f = flat(75); f[ix('three_point')] = 80; f[ix('driving_dunk')] = 85; f[ix('strength')] = 75;
  const gain = (dreb, bh) => { const g = [...f]; g[ix('defensive_rebound')] = dreb; g[ix('ball_handle')] = bh;
    const hi = [...g]; hi[ix('pass_accuracy')] = 94; g[ix('pass_accuracy')] = 80; return metaScore(hi, 84, 'PF') - metaScore(g, 84, 'PF'); };
  assert.ok(gain(95, 85) > 2 * gain(70, 65), 'pass accuracy is worth much more on a rebounding, handling big');
});

test('three-point marks: 83, 89 and 91 matter; 86 (Arc Cadence silver) is minor', () => {
  const f = flat(80); f[ix('driving_dunk')] = 87; f[ix('vertical')] = 80; f[ix('block')] = 78;
  const at = v => { const g = [...f]; g[ix('three_point')] = v; return metaScore(g, 79, 'SG'); };
  const jump = v => at(v) - at(v - 1);
  assert.ok(jump(86) < jump(89) / 2, 'arc silver vs Set and Fire gold');
  assert.ok(jump(86) < jump(91) / 2, 'arc silver vs arc gold');
  assert.ok(jump(83) > jump(86), 'Limitless bronze over arc silver');
});

test("6'8\"-6'9\" bigs are PFs: the same ratings score far lower as a C", () => {
  const f = flat(84); f[ix('strength')] = 76; f[ix('defensive_rebound')] = 87; f[ix('three_point')] = 89;
  assert.ok(metaScore(f, 81, 'PF') > metaScore(f, 81, 'C') * 1.2);
  assert.ok(metaScore(f, 83, 'C') > metaScore(f, 81, 'C') * 1.25, "a 6'11\" center over a 6'9\" one");
});

test('a PF is an elite shooter or an elite rebounder', () => {
  const b = (three, dreb, oreb) => { const f = flat(80); f[ix('three_point')] = three; f[ix('defensive_rebound')] = dreb; f[ix('offensive_rebound')] = oreb; return f; };
  assert.equal(pfGate(b(89, 87, 80), 'PF'), 1, 'shooter with silver boards');
  assert.equal(pfGate(b(80, 95, 80), 'PF'), 1, 'gold defensive board');
  assert.equal(pfGate(b(80, 87, 93), 'PF'), 1, 'gold offensive board');
  assert.ok(pfGate(b(80, 87, 80), 'PF') <= 0.75, 'neither');
  assert.equal(pfGate(b(80, 87, 80), 'C'), 1, 'centers are not');
});

test('a dunk without the vertical to use it, 99 pass and a weak guard handle are not elite', async () => {
  const { metaScore, metaRating } = await import('../src/breakpoints.js');
  const { verticalGate } = await import('../src/meta.js');
  const shown = (f, h, p) => Math.round(metaRating(metaScore(f, h, p)));
  // 6'9" SF: 89 dunk, 71 vertical (no Posterizer silver, no contact dunks off two).
  const sf = [80, 90, 89, 60, 63, 87, 89, 77, 80, 80, 75, 62, 85, 80, 76, 71, 58, 86, 86, 78, 71];
  assert.ok(shown(sf, 81, 'SF') <= 90);
  assert.ok(shown(sf.map((v, i) => i === 20 ? 75 : v), 81, 'SF') > shown(sf, 81, 'SF'), '75 vertical is worth it');
  assert.equal(verticalGate(sf.map((v, i) => i === 2 ? 80 : v)), 1, 'no dunk invested, no penalty');
  // 6'8" SG: 99 pass accuracy, 75 ball handle, 91 dunk on 70 vertical.
  const sg = [70, 70, 91, 49, 55, 87, 89, 72, 99, 75, 79, 58, 89, 60, 78, 71, 59, 89, 89, 53, 70];
  assert.ok(shown(sg, 80, 'SG') < 90);
  // Pass past 85 buys nothing in the meta.
  const at85 = sg.map((v, i) => i === 8 ? 85 : v);
  assert.ok(Math.abs(metaScore(sg, 80, 'SG') - metaScore(at85, 80, 'SG')) < 1e-9);
});

test('strength is a 71 breakpoint, blocks need the board, a dunk short of 87 is no dunk, takeovers are a bonus', async () => {
  const { metaScore } = await import('../src/breakpoints.js');
  const at = (f, k, v) => f.map((x, i) => i === ix(k) ? v : x);
  const sf = [80, 70, 89, 50, 50, 80, 86, 75, 80, 86, 86, 70, 86, 90, 70, 60, 60, 88, 86, 50, 80];
  const m = f => metaScore(f, 80, 'SF');
  // 71 strength opens something; 72-74 doesn't add (75 is Brick Wall / Strong Handle bronze, small badges of their own).
  assert.ok(m(at(sf, 'strength', 71)) > m(sf));
  assert.ok(Math.abs(m(at(sf, 'strength', 74)) - m(at(sf, 'strength', 71))) < 0.01);
  // A dunk short of 87 buys next to nothing (alley-oops count for nothing in the meta: too rare): 80 ≈ 86, the cliff is 87.
  const c = [80, 70, 86, 60, 70, 70, 80, 70, 85, 70, 65, 80, 72, 60, 85, 80, 95, 76, 70, 80, 75];
  assert.ok(Math.abs(metaScore(c, 83, 'C') - metaScore(at(c, 'driving_dunk', 80), 83, 'C')) < 0.15); // 80: the finishing floor
  assert.ok(metaScore(at(c, 'driving_dunk', 87), 83, 'C') - metaScore(c, 83, 'C') > 5);
  // A blocking wing without the board gets less for the blocks.
  const blocker = at(sf, 'block', 80), boards = at(blocker, 'defensive_rebound', 80);
  assert.ok(m(boards) - m(at(boards, 'block', 60)) > m(blocker) - m(at(blocker, 'block', 60)));
  const f = flat(70), g = [...f]; g[ix('three_point')] = 91; // Zip Code
  assert.ok(metaScore(g, 80, 'SG') > metaScore(f, 80, 'SG'));
});
