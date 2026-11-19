import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeFloors } from '../src/badge-floors.js';

test('a must locks every rating its tier needs', () => {
  const { floors, either } = badgeFloors({ paint_patroller: 'silver' }, { values: {} });
  assert.deepEqual([floors.interior_defense[0].min, floors.block[0].min], [71, 84]);
  assert.equal(either.length, 0);
});

test('an "or" badge locks nothing on its own and lists its branches', () => {
  const { floors, either } = badgeFloors({ deadeye: 'silver' }, { values: {} });
  assert.equal(either.length, 1);
  assert.ok(either[0].branches.length >= 2);
  assert.ok(!floors.three_point && !floors.mid_range);
});

test('Priority reaches for the next tier past the must, up to Max tier', () => {
  const { targets } = badgeFloors({ paint_patroller: 'silver' }, { values: { paint_patroller: 2 }, caps: {} });
  assert.equal(targets.block[0].min, 93);
  assert.equal(targets.block[0].tier, 'gold');
  const capped = badgeFloors({ paint_patroller: 'silver' }, { values: { paint_patroller: 2 }, caps: { paint_patroller: 2 } });
  assert.deepEqual(capped.targets, {});
});

test('the specialization locks its base ratings, or lists its ways in', () => {
  const shoot = badgeFloors({}, { values: {} }, 'shooting');
  assert.deepEqual([shoot.floors.mid_range[0].min, shoot.floors.three_point[0].min, shoot.floors.mid_range[0].base], [60, 60, true]);
  const fin = badgeFloors({}, { values: {} }, 'finishing');
  assert.equal(fin.either.length, 1);
  assert.equal(fin.either[0].branches.length, 4);
});
