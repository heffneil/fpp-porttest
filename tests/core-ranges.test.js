'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { stringRange, mergeRanges, portRanges, formatChannelSet } = require('../assets/porttest-core.js');

const vs = (startChannel, pixelCount, extra) => Object.assign({ startChannel: startChannel - 1, pixelCount, groupCount: 0, colorOrder: 'RGB' }, extra);

test('800 RGB pixels at 204809', () => {
  assert.deepEqual(stringRange(vs(204809, 800)), [204809, 207208]);
});

test('groupCount 0 and 1 mean no grouping', () => {
  assert.deepEqual(stringRange(vs(1, 100, { groupCount: 0 })), [1, 300]);
  assert.deepEqual(stringRange(vs(1, 100, { groupCount: 1 })), [1, 300]);
});

test('groupCount 2', () => {
  assert.deepEqual(stringRange(vs(1, 800, { groupCount: 2 })), [1, 1200]);
});

test('uneven groups round up', () => {
  assert.deepEqual(stringRange(vs(1, 10, { groupCount: 3 })), [1, 12]);
});

test('RGBW uses four channels', () => {
  assert.deepEqual(stringRange(vs(1, 100, { colorOrder: 'RGBW' })), [1, 400]);
});

test('missing colorOrder defaults to RGB', () => {
  assert.deepEqual(stringRange({ startChannel: 0, pixelCount: 100 }), [1, 300]);
});

test('zero or negative pixelCount gives null', () => {
  assert.equal(stringRange(vs(1, 0)), null);
  assert.equal(stringRange(vs(1, -5)), null);
});

test('portRanges merges adjacent strings', () => {
  assert.deepEqual(portRanges({ virtualStrings: [vs(1, 800), vs(2401, 400)] }), [[1, 3600]]);
});

test('portRanges keeps a gap', () => {
  assert.deepEqual(portRanges({ virtualStrings: [vs(1, 800), vs(4801, 800)] }), [[1, 2400], [4801, 7200]]);
});

test('portRanges skips zero-pixel strings', () => {
  assert.deepEqual(portRanges({ virtualStrings: [vs(1, 800), vs(2401, 0), vs(4801, 100)] }), [[1, 2400], [4801, 5100]]);
  assert.deepEqual(portRanges({ virtualStrings: [vs(1, 0), vs(10, 0)] }), []);
});

test('portRanges sorts strings given out of order', () => {
  assert.deepEqual(portRanges({ virtualStrings: [vs(4801, 800), vs(1, 800)] }), [[1, 2400], [4801, 7200]]);
});

test('mergeRanges merges overlapping and adjacent, keeps gaps', () => {
  assert.deepEqual(mergeRanges([[10, 20], [1, 5], [6, 9], [15, 30]]), [[1, 30]]);
  assert.deepEqual(mergeRanges([[1, 5], [8, 9]]), [[1, 5], [8, 9]]);
});

test('formatChannelSet joins with semicolons, never commas', () => {
  const out = formatChannelSet([[4801, 7200], [9601, 12000]]);
  assert.equal(out, '4801-7200;9601-12000');
  assert.ok(!out.includes(','));
  assert.equal(formatChannelSet([]), '');
});

test('config startChannel is 0-based: 0 is channel 1, as FPP shows it (+1) on the Pixel Strings page', () => {
  assert.deepEqual(stringRange({ startChannel: 0, pixelCount: 800, colorOrder: 'RGB' }), [1, 2400]);
  assert.deepEqual(stringRange({ startChannel: 2427, pixelCount: 809, colorOrder: 'RGB' }), [2428, 4854]);
});
