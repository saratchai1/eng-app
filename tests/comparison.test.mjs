import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBaseline, restoreBaseline, compareCalculations, comparisonMarkup } from '../src/comparison.js';

const definition = {
  id: 'test-model',
  inputGroups: [{ fields: [{ key: 'x', label: 'Load', unit: 'kN' }] }],
  calculate({ x }) {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('Invalid load');
    return { summary: [{ label: 'Load', value: x, unit: 'kN' }, { label: 'Capacity', value: x > 10 ? null : 10, unit: 'kN' }], checks: [{ label: 'Demand', pass: x <= 10 }] };
  }
};

test('a captured comparison remains independent when current input changes', () => {
  const inputs = { x: 5 };
  const baseline = captureBaseline(definition, inputs, 'A');
  inputs.x = 8;
  const result = compareCalculations(definition, baseline, inputs);
  assert.equal(baseline.inputs.x, 5);
  assert.deepEqual(result.rows[0], { label: 'Load', unit: 'kN', digits: 2, before: 5, after: 8, delta: 3, percent: 60 });
  assert.equal(result.changedInputs.length, 1);
});

test('zero, negative references and unevaluated capacities have truthful deltas', () => {
  const zero = captureBaseline(definition, { x: 0 }, 'A');
  assert.equal(compareCalculations(definition, zero, { x: 2 }).rows[0].percent, null);
  const negative = captureBaseline(definition, { x: -4 }, 'A');
  assert.equal(compareCalculations(definition, negative, { x: -2 }).rows[0].percent, 50);
  const result = compareCalculations(definition, zero, { x: 11 });
  assert.equal(result.rows[1].after, null);
  assert.equal(result.rows[1].delta, null);
  assert.equal(result.checks[0].before, true);
  assert.equal(result.checks[0].pass, false);
});

test('comparison import rejects foreign, incomplete and invalid snapshots', () => {
  const baseline = captureBaseline(definition, { x: 1 }, 'A');
  assert.equal(restoreBaseline(definition, { ...baseline, toolId: 'other' }), null);
  assert.equal(restoreBaseline(definition, { ...baseline, inputs: {} }), null);
  assert.equal(restoreBaseline(definition, { ...baseline, inputs: { x: '1' } }), null);
  assert.equal(restoreBaseline(definition, { ...baseline, capturedAt: 'bad-date' }), null);
  assert.equal(restoreBaseline(definition, baseline).inputs.x, 1);
});

test('restored comparisons recalculate results rather than trusting imported answers', () => {
  const baseline = { ...captureBaseline(definition, { x: 4 }, 'A'), result: { value: 999 } };
  assert.equal(compareCalculations(definition, baseline, { x: 6 }).rows[0].before, 4);
});

test('report comparison escapes user text and omits interactive controls', () => {
  const baseline = captureBaseline(definition, { x: 1 }, '<img src=x onerror=alert(1)>');
  const markup = comparisonMarkup(definition, baseline, { x: 2 }, { report: true });
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  assert.ok(!markup.includes('data-compare'));
  assert.ok(markup.includes('100%'));
});
