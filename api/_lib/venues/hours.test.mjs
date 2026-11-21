import test from 'node:test';
import assert from 'node:assert/strict';
import { openState, formatMinute, viennaNow } from './hours.mjs';
const barber = [null, [540,1140],[540,1140],[540,1140],[540,1140],[540,1140],[540,1080]];
const kebab  = [[600,120],[600,120],[600,120],[600,120],[600,120],[600,240],[600,240]];

test('open inside the range, closed outside', () => {
  assert.deepEqual(openState(barber, 1, 600), { open: true, until: 1140, opensAt: null });
  assert.equal(openState(barber, 1, 539).open, false);
  assert.equal(openState(barber, 1, 1140).open, false);
});
test('before opening points to today', () => {
  assert.deepEqual(openState(barber, 1, 500).opensAt, { day: 1, minute: 540 });
});
test('closed day points to the next opening', () => {
  assert.deepEqual(openState(barber, 0, 720), { open: false, until: null, opensAt: { day: 1, minute: 540 } });
});
test('after closing points to tomorrow, Saturday evening skips Sunday', () => {
  assert.deepEqual(openState(barber, 6, 1100).opensAt, { day: 1, minute: 540 });
});
test('past-midnight range is open after midnight on the next day', () => {
  assert.deepEqual(openState(kebab, 2, 60), { open: true, until: 120, opensAt: null });
  assert.equal(openState(kebab, 2, 121).open, false);
  assert.equal(openState(kebab, 2, 700).until, 120);
});
test('no hours at all', () => {
  assert.deepEqual(openState(undefined, 1, 600), { open: false, until: null, opensAt: null });
  assert.deepEqual(openState(Array(7).fill(null), 1, 600), { open: false, until: null, opensAt: null });
});
test('formatMinute and viennaNow', () => {
  assert.equal(formatMinute(540), '09:00');
  assert.equal(formatMinute(1560), '02:00');
  assert.deepEqual(viennaNow(new Date('2026-11-21T10:30:00Z')), { day: 6, minute: 690 });
  assert.deepEqual(viennaNow(new Date('2026-07-01T22:30:00Z')), { day: 4, minute: 30 });
});
