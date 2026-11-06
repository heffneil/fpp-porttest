'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../assets/porttest-core.js');
const { buildTestStart, buildTestStop, parseChannelSet, chaseTypeFromSubMode, recognise, summarizePort } = core;

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

// 48 ports of 800 RGB pixels, 2400 channels each, from `first`.
const board = (first) => {
  const out = [];
  for (let n = 0; n < 48; n++) {
    out.push(summarizePort({
      portNumber: n,
      protocol: 'ws281x',
      virtualStrings: [{ startChannel: first - 1 + n * 2400, pixelCount: 800, groupCount: 0, colorOrder: 'RGB', description: '' }],
    }));
  }
  return out;
};
const body = (config) => ({ Status: 'OK', config });
const fill = (channelSet, rgb) => body({
  enabled: 1, mode: 'RGBFill', channelSet, channelSetType: 'channelRange',
  color1: rgb[0], color2: rgb[1], color3: rgb[2],
});

test('buildTestStart solid', () => {
  const t = buildTestStart({ pattern: 'solid', channelSet: '4801-7200', value: '#404040' });
  assert.deepEqual(t, {
    command: 'Test Start', multisyncCommand: false, multisyncHosts: '',
    args: ['1000', 'RGB Single Color', '4801-7200', '#404040'],
  });
});

test('buildTestStart chase and cycle', () => {
  assert.deepEqual(buildTestStart({ pattern: 'chase', channelSet: '4801-7200', value: 'R-G-B' }).args,
    ['1000', 'RGB Chase', '4801-7200', 'R-G-B']);
  assert.deepEqual(buildTestStart({ pattern: 'cycle', channelSet: '4801-7200', value: 'R-G-B' }).args,
    ['1000', 'RGB Cycle', '4801-7200', 'R-G-B']);
});

test('interval is clamped', () => {
  assert.equal(buildTestStart({ pattern: 'solid', channelSet: '1-3', value: '#ffffff', intervalMs: 50 }).args[0], '100');
  assert.equal(buildTestStart({ pattern: 'solid', channelSet: '1-3', value: '#ffffff', intervalMs: 99999 }).args[0], '10000');
});

test('no effect string is ever Output Specific', () => {
  for (const p of Object.keys(core.PATTERNS)) {
    assert.notEqual(core.PATTERNS[p], 'Output Specific');
    assert.notEqual(buildTestStart({ pattern: p, channelSet: '1-3', value: '#ffffff' }).args[1], 'Output Specific');
  }
});

test('buildTestStop', () => {
  assert.deepEqual(buildTestStop(), { command: 'Test Stop', multisyncCommand: false, multisyncHosts: '', args: [] });
});

test('defaults and chase types', () => {
  assert.equal(core.DEFAULT_COLOR, '#404040');
  assert.equal(core.DEFAULT_INTERVAL_MS, 1000);
  assert.equal(core.CHASE_TYPES.length, 8);
  assert.ok(core.CHASE_TYPES.includes('R-G-B-W-All-None'));
});

test('parseChannelSet', () => {
  assert.deepEqual(parseChannelSet('1-3;7;9-10'), [[1, 3], [7, 7], [9, 10]]);
  assert.deepEqual(parseChannelSet('1-3,7'), [[1, 3], [7, 7]]);
  assert.deepEqual(parseChannelSet(';;'), []);
  assert.deepEqual(parseChannelSet('abc'), []);
});

test('chaseTypeFromSubMode', () => {
  const table = {
    'RGBChase-RGB': 'R-G-B', 'RGBChase-RGBA': 'R-G-B-All', 'RGBChase-RGBN': 'R-G-B-None',
    'RGBChase-RGBAN': 'R-G-B-All-None', 'RGBChase-RGBW': 'R-G-B-W', 'RGBChase-RGBWA': 'R-G-B-W-All',
    'RGBChase-RGBWN': 'R-G-B-W-None', 'RGBChase-RGBWAN': 'R-G-B-W-All-None',
  };
  for (const [sub, type] of Object.entries(table)) assert.equal(chaseTypeFromSubMode(sub), type, sub);
  assert.equal(chaseTypeFromSubMode('RGBCycle-RGBWAN'), 'R-G-B-W-All-None');
  assert.equal(chaseTypeFromSubMode('nonsense'), 'R-G-B');
  assert.equal(chaseTypeFromSubMode(undefined), 'R-G-B');
});

test('recognise: idle', () => {
  assert.deepEqual(recognise(board(1), { Status: 'OK', config: { enabled: 0 } }), { kind: 'none' });
});

test('recognise: ours, from the captured fixture', () => {
  const r = recognise(board(204809), fixture('testing-running-fill.json'));
  assert.deepEqual(r, { kind: 'ours', ports: [1, 4], pattern: 'solid', value: '#404040' });
});

test('recognise: merged adjacent ports', () => {
  const r = recognise(board(1), fill('4801-9600', [64, 64, 64]));
  assert.equal(r.kind, 'ours');
  assert.deepEqual(r.ports, [2, 3]);
});

test('recognise: chase and cycle report the chase type', () => {
  const chase = recognise(board(1), body({
    enabled: 1, mode: 'RGBChase', subMode: 'RGBChase-RGBWAN', channelSet: '4801-7200',
  }));
  assert.deepEqual(chase, { kind: 'ours', ports: [2], pattern: 'chase', value: 'R-G-B-W-All-None' });
  const cycle = recognise(board(1), body({
    enabled: 1, mode: 'RGBCycle', subMode: 'RGBCycle-RGBA', channelSet: '4801-7200',
  }));
  assert.deepEqual(cycle, { kind: 'ours', ports: [2], pattern: 'cycle', value: 'R-G-B-All' });
});

test('recognise: solid value is lowercase #rrggbb', () => {
  const r = recognise(board(1), fill('4801-7200', [255, 0, 171]));
  assert.equal(r.value, '#ff00ab');
});

test('recognise: other, with a reason, never a crash', () => {
  const cases = {
    'partial port': fill('4801-5000', [64, 64, 64]),
    'beyond whole ports': fill('4801-7200;99999-100000', [64, 64, 64]),
    'output specific, no channelSet': body({ enabled: 1, mode: 'Outputs' }),
    'single channel chase': body({ enabled: 1, mode: 'SingleChase', channelSet: '1-2400' }),
    'no config': { Status: 'OK' },
    'null': null,
    'string': 'x',
  };
  for (const [name, input] of Object.entries(cases)) {
    const r = recognise(board(1), input);
    assert.equal(r.kind, 'other', name);
    assert.equal(typeof r.reason, 'string', name);
    assert.ok(r.reason.length > 0, name);
  }
});

test('recognise: the captured output-specific fixture is a different test', () => {
  const r = recognise(board(204809), fixture('testing-running-output-specific.json'));
  assert.equal(r.kind, 'other');
});
