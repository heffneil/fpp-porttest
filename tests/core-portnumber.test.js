'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../assets/porttest-core.js');
const { summarizePort, portNumberChannelSet, buildTestStart, recognise } = core;

const vs = (startChannel, pixelCount, extra) =>
  Object.assign({ startChannel: startChannel - 1, pixelCount, groupCount: 0, colorOrder: 'RGB', description: '' }, extra);
const board = () => {
  const out = [];
  for (let n = 0; n < 48; n++) out.push(summarizePort({ portNumber: n, protocol: 'ws2811', virtualStrings: [vs(1 + n * 2400, 800)] }));
  return out;
};

test('port N lights its first N pixels', () => {
  // port 5 (portNumber 4) starts at 9601: 5 pixels = 15 channels
  assert.equal(portNumberChannelSet(board(), [4]), '9601-9615');
});

test('several ports, each with its own count; adjacent results stay separate', () => {
  assert.equal(portNumberChannelSet(board(), [0, 2]), '1-3;4801-4809');
});

test('length is capped at the first string', () => {
  const s = [summarizePort({ portNumber: 9, virtualStrings: [vs(1, 4)] })]; // port 10 wants 10 pixels, has 4
  assert.equal(portNumberChannelSet(s, [9]), '1-12');
});

test('RGBW uses four channels per pixel', () => {
  const s = [summarizePort({ portNumber: 2, virtualStrings: [vs(101, 50, { colorOrder: 'RGBW' })] })];
  assert.equal(portNumberChannelSet(s, [2]), '101-112'); // port 3 = 3 px x 4
});

test('uses the lowest-start string; ports with no pixels and unselected ports add nothing', () => {
  const s = [
    summarizePort({ portNumber: 0, virtualStrings: [vs(500, 10), vs(100, 10)] }),
    summarizePort({ portNumber: 1, virtualStrings: [] }),
    summarizePort({ portNumber: 2, virtualStrings: [vs(1000, 10)] }),
  ];
  assert.equal(portNumberChannelSet(s, [0, 1]), '100-102');
  assert.equal(portNumberChannelSet(s, []), '');
});

test('buildTestStart portnumber is a plain RGB Single Color command', () => {
  const t = buildTestStart({ pattern: 'portnumber', channelSet: '1-3', value: '#404040' });
  assert.deepEqual(t.args, ['1000', 'RGB Single Color', '1-3', '#404040']);
});

test('recognise: a port-number test restores as portnumber', () => {
  const set = portNumberChannelSet(board(), [1, 4]);
  const r = recognise(board(), { Status: 'OK', config: { enabled: 1, mode: 'RGBFill', channelSet: set, color1: 64, color2: 64, color3: 64 } });
  assert.deepEqual(r, { kind: 'ours', ports: [1, 4], pattern: 'portnumber', value: '#404040' });
});

test('recognise: a whole-port solid test is still solid', () => {
  const r = recognise(board(), { Status: 'OK', config: { enabled: 1, mode: 'RGBFill', channelSet: '2401-4800', color1: 64, color2: 64, color3: 64 } });
  assert.equal(r.pattern, 'solid');
});

test('recognise: a partial range that is not a port-number set is other', () => {
  const r = recognise(board(), { Status: 'OK', config: { enabled: 1, mode: 'RGBFill', channelSet: '2401-2410', color1: 1, color2: 1, color3: 1 } });
  assert.equal(r.kind, 'other');
});
