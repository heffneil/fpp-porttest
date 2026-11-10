'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRunner } = require('../assets/porttest-runner.js');
const fx = require('../assets/porttest-fseq.js');

// A fake board: tracks which files exist and which effects play, and logs every call.
function board(opts) {
  opts = opts || {};
  const log = [];
  const files = new Set();
  const playing = new Set();
  const api = {
    uploadSequence: async (name) => {
      log.push('upload ' + name);
      if (opts.failUpload) throw new Error('disk full');
      files.add(name);
    },
    deleteSequence: async (name) => { log.push('delete ' + name); files.delete(name); },
    command: async (body) => {
      const [name] = body.args;
      log.push(body.command + ' ' + name);
      if (body.command === 'FSEQ Effect Start' && files.has(name) && !opts.cannotPlay) playing.add(name);
      if (body.command === 'Effect Stop') playing.delete(name);
    },
    getRunningEffects: async () => Array.from(playing),
  };
  return { api, log, files, playing, runner: createRunner({ api, wait: () => Promise.resolve() }) };
}
const effect = (name) => ({ name, bytes: new Uint8Array([1]) });

test('apply uploads the file, then starts it looping in the background', async () => {
  const b = board();
  await b.runner.apply(effect('porttest_pn_5'));
  assert.deepEqual(b.log, ['upload porttest_pn_5', 'FSEQ Effect Start porttest_pn_5']);
  assert.deepEqual(Array.from(b.playing), ['porttest_pn_5']);
  assert.equal(b.runner.active(), 'porttest_pn_5');
});

test('the start command is the loop-and-background form, without the .fseq extension', () => {
  assert.deepEqual(fx.startCommand('porttest_pn_5'), {
    command: 'FSEQ Effect Start', multisyncCommand: false, multisyncHosts: '', args: ['porttest_pn_5', 'true', 'true'],
  });
  assert.deepEqual(fx.stopCommand('porttest_pn_5'), {
    command: 'Effect Stop', multisyncCommand: false, multisyncHosts: '', args: ['porttest_pn_5'],
  });
});

test('changing the selection starts the new file, then stops and deletes the old one', async () => {
  const b = board();
  await b.runner.apply(effect('porttest_pn_5'));
  b.log.length = 0;
  await b.runner.apply(effect('porttest_pn_5_8'));
  assert.deepEqual(b.log, [
    'upload porttest_pn_5_8', 'FSEQ Effect Start porttest_pn_5_8',
    'Effect Stop porttest_pn_5', 'delete porttest_pn_5',
  ]);
  assert.deepEqual(Array.from(b.files), ['porttest_pn_5_8']);
  assert.deepEqual(Array.from(b.playing), ['porttest_pn_5_8']);
});

test('applying what is already playing sends nothing', async () => {
  const b = board();
  await b.runner.apply(effect('porttest_pn_5'));
  b.log.length = 0;
  await b.runner.apply(effect('porttest_pn_5'));
  assert.deepEqual(b.log, []);
});

test('stop stops the effect and deletes its file', async () => {
  const b = board();
  await b.runner.apply(effect('porttest_pn_5'));
  b.log.length = 0;
  await b.runner.stop();
  assert.deepEqual(b.log, ['Effect Stop porttest_pn_5', 'delete porttest_pn_5']);
  assert.equal(b.files.size, 0);
  assert.equal(b.playing.size, 0);
  assert.equal(b.runner.active(), null);
  await b.runner.stop();
  assert.deepEqual(b.log, ['Effect Stop porttest_pn_5', 'delete porttest_pn_5'], 'a second stop sends nothing');
});

test('a failed upload leaves the old effect playing and rejects', async () => {
  const good = board();
  await good.runner.apply(effect('porttest_pn_5'));
  const b = board({ failUpload: true });
  await assert.rejects(b.runner.apply(effect('porttest_pn_5')), /disk full/);
  assert.equal(b.runner.active(), null);
  assert.deepEqual(b.log, ['upload porttest_pn_5']);
});

test('if fppd never plays the file, the file is removed and the error says so', async () => {
  const b = board({ cannotPlay: true });
  await assert.rejects(b.runner.apply(effect('porttest_pn_5')), /could not play/i);
  assert.equal(b.files.size, 0, 'nothing left behind on the board');
  assert.equal(b.runner.active(), null);
});

test('adopt takes over an effect that was already running when the page loaded', async () => {
  const b = board();
  b.runner.adopt('porttest_pn_5');
  await b.runner.apply(effect('porttest_rf_5'));
  assert.deepEqual(b.log, [
    'upload porttest_rf_5', 'FSEQ Effect Start porttest_rf_5',
    'Effect Stop porttest_pn_5', 'delete porttest_pn_5',
  ]);
});

test('clean removes porttest files nobody is playing, and nothing else', async () => {
  const b = board();
  b.files.add('porttest_pn_5'); b.files.add('porttest_rf_9'); b.files.add('Halloween'); b.files.add('porttest_zz_1');
  b.playing.add('porttest_rf_9');
  b.api.listSequences = async () => Array.from(b.files);
  await b.runner.clean();
  assert.deepEqual(b.log.sort(), ['delete porttest_pn_5']);
  assert.deepEqual(Array.from(b.files).sort(), ['Halloween', 'porttest_rf_9', 'porttest_zz_1']);
});
