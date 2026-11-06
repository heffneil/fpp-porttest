'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizePort, findOverlaps, selectionChannelSet } = require('../assets/porttest-core.js');

const vs = (startChannel, pixelCount, description) =>
  ({ startChannel, pixelCount, groupCount: 0, colorOrder: 'RGB', description: description || '' });
const port = (portNumber, strings, extra) =>
  Object.assign({ portNumber, protocol: 'ws281x', virtualStrings: strings }, extra);

// 48 ports of 800 RGB pixels from channel 1.
const board = () => {
  const out = [];
  for (let n = 0; n < 48; n++) out.push(summarizePort(port(n, [vs(1 + n * 2400, 800)])));
  return out;
};

test('label is portNumber + 1 as a string', () => {
  assert.equal(summarizePort(port(0, [])).label, '1');
  assert.equal(summarizePort(port(47, [])).label, '48');
});

test('multi-string port', () => {
  const s = summarizePort(port(3, [vs(1, 800, ''), vs(4801, 800, 'Roof')]));
  assert.equal(s.portNumber, 3);
  assert.equal(s.startChannel, 1);
  assert.equal(s.endChannel, 7200);
  assert.equal(s.pixelCount, 1600);
  assert.equal(s.description, 'Roof');
  assert.equal(s.protocol, 'ws281x');
  assert.equal(s.hasPixels, true);
  assert.deepEqual(s.ranges, [[1, 2400], [4801, 7200]]);
});

test('no pixels', () => {
  for (const p of [port(0, []), port(0, [vs(1, 0), vs(10, 0)]), { portNumber: 0 }]) {
    const s = summarizePort(p);
    assert.equal(s.hasPixels, false);
    assert.equal(s.startChannel, null);
    assert.equal(s.endChannel, null);
    assert.equal(s.pixelCount, 0);
    assert.deepEqual(s.ranges, []);
  }
});

test('description is returned unchanged', () => {
  const nasty = '</script><img src=x onerror=alert(1)>';
  assert.equal(summarizePort(port(0, [vs(1, 10, nasty)])).description, nasty);
});

test('findOverlaps: touching ports do not overlap', () => {
  const s = [summarizePort(port(0, [vs(1, 800)])), summarizePort(port(1, [vs(2401, 800)]))];
  assert.deepEqual(findOverlaps(s), {});
});

test('findOverlaps: two overlapping ports', () => {
  const s = [summarizePort(port(0, [vs(1, 800)])), summarizePort(port(3, [vs(2000, 333)]))];
  assert.deepEqual(findOverlaps(s), { 0: [3], 3: [0] });
});

test('findOverlaps: three mutually overlapping ports each list the other two', () => {
  const s = [0, 1, 2].map((n) => summarizePort(port(n, [vs(1, 100)])));
  assert.deepEqual(findOverlaps(s), { 0: [1, 2], 1: [0, 2], 2: [0, 1] });
});

test('findOverlaps: a port with no pixels never appears', () => {
  const s = [summarizePort(port(0, [vs(1, 100)])), summarizePort(port(1, []))];
  assert.deepEqual(findOverlaps(s), {});
});

test('selectionChannelSet picks the selected ports, merged', () => {
  const s = board();
  assert.equal(selectionChannelSet(s, [2, 5]), '4801-7200;12001-14400');
  assert.equal(selectionChannelSet(s, [2, 3]), '4801-9600');
  assert.equal(selectionChannelSet(s, []), '');
});

test('selectionChannelSet: a selected port with no pixels contributes nothing', () => {
  const s = [summarizePort(port(0, [vs(1, 800)])), summarizePort(port(1, []))];
  assert.equal(selectionChannelSet(s, [0, 1]), '1-2400');
});
