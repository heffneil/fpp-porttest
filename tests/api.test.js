'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../assets/porttest-api.js');

const reply = (status, body, type) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => type || 'text/plain' },
  text: () => Promise.resolve(body),
  json: () => Promise.resolve(JSON.parse(body)),
});
const rig = (response) => {
  const calls = [];
  const api = createApi((url, init) => { calls.push({ url, init }); return Promise.resolve(response); });
  return { api, calls };
};

test('getOutput returns the first enabled output as {ports}', async () => {
  const cfg = { channelOutputs: [{ enabled: 0, outputs: [{ portNumber: 9 }] }, { enabled: 1, subType: 'K32A-B', outputs: [{ portNumber: 0 }] }] };
  const { api, calls } = rig(reply(200, JSON.stringify(cfg), 'application/json'));
  assert.deepEqual(await api.getOutput('co-bbbStrings'), { ports: [{ portNumber: 0 }], subType: 'K32A-B' });
  assert.equal(calls[0].url, '/api/channel/output/co-bbbStrings');
});

test('GETs carry no Content-Type header (FPP 404s them)', async () => {
  const { api, calls } = rig(reply(200, '{"channelOutputs":[]}'));
  await api.getOutput('co-bbbStrings');
  const headers = (calls[0].init && calls[0].init.headers) || {};
  assert.equal(Object.keys(headers).some((h) => h.toLowerCase() === 'content-type'), false);
});

test('getOutput gives null when nothing is enabled', async () => {
  assert.equal(await rig(reply(200, '{"channelOutputs":[{"enabled":0,"outputs":[]}]}')).api.getOutput('x'), null);
  assert.equal(await rig(reply(200, '{"channelOutputs":[]}')).api.getOutput('x'), null);
  assert.equal(await rig(reply(200, '{}')).api.getOutput('x'), null);
});

test('getOutput rejects on a non-2xx response or invalid JSON', async () => {
  await assert.rejects(rig(reply(500, 'boom')).api.getOutput('x'), Error);
  await assert.rejects(rig(reply(200, '<html>')).api.getOutput('x'), Error);
});

test('getTesting returns the whole body', async () => {
  const { api, calls } = rig(reply(200, '{"Status":"OK","config":{"enabled":0}}'));
  assert.deepEqual(await api.getTesting(), { Status: 'OK', config: { enabled: 0 } });
  assert.equal(calls[0].url, '/api/fppd/testing');
});

test('command POSTs the body as JSON', async () => {
  const { api, calls } = rig(reply(200, 'Test Started'));
  const body = { command: 'Test Stop', multisyncCommand: false, multisyncHosts: '', args: [] };
  await api.command(body);
  assert.equal(calls[0].url, '/api/command');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify(body));
});

test('command accepts a plain-text 200 (what FPP actually sends)', async () => {
  await assert.doesNotReject(rig(reply(200, 'Test Started')).api.command({}));
  await assert.doesNotReject(rig(reply(200, '')).api.command({}));
});

test('command rejects a non-2xx with the response text', async () => {
  await assert.rejects(rig(reply(500, 'Invalid channel set')).api.command({}), /Invalid channel set/);
  await assert.rejects(rig(reply(404, '')).api.command({}), /404/);
});

test('command rejects a JSON {Status:"Error"}', async () => {
  await assert.rejects(rig(reply(200, '{"Status":"Error","Message":"nope"}')).api.command({}), /nope/);
});

test('getRunningEffects returns the names of the effects fppd is playing', async () => {
  const { api, calls } = rig(reply(200, '{"Status":"OK","runningEffects":[{"id":0,"name":"porttest_pn_5"},{"id":2,"name":"x"}]}'));
  assert.deepEqual(await api.getRunningEffects(), ['porttest_pn_5', 'x']);
  assert.equal(calls[0].url, '/api/fppd/effects');
  assert.deepEqual(await rig(reply(200, '{"Status":"OK"}')).api.getRunningEffects(), []);
});

test('listSequences returns the sequence names', async () => {
  const { api, calls } = rig(reply(200, '["a","porttest_pn_5"]'));
  assert.deepEqual(await api.listSequences(), ['a', 'porttest_pn_5']);
  assert.equal(calls[0].url, '/api/sequence');
  assert.deepEqual(await rig(reply(200, '{"x":1}')).api.listSequences(), []);
});

test('uploadSequence POSTs the raw bytes to sequences/<name>.fseq', async () => {
  const { api, calls } = rig(reply(200, '{"status":"OK"}'));
  const bytes = new Uint8Array([1, 2, 3]);
  await api.uploadSequence('porttest_pn_5', bytes);
  assert.equal(calls[0].url, '/api/file/sequences/porttest_pn_5.fseq');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, bytes);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/octet-stream');
});

test('uploadSequence rejects when FPP says it did not write the file', async () => {
  await assert.rejects(rig(reply(500, 'disk full')).api.uploadSequence('n', new Uint8Array(1)), /disk full/);
  await assert.rejects(rig(reply(200, '{"status":"Invalid Directory"}')).api.uploadSequence('n', new Uint8Array(1)), /Invalid Directory/);
});

test('deleteSequence DELETEs sequences/<name>.fseq', async () => {
  const { api, calls } = rig(reply(200, '{"status":"OK"}'));
  await api.deleteSequence('porttest_pn_5');
  assert.equal(calls[0].url, '/api/file/sequences/porttest_pn_5.fseq');
  assert.equal(calls[0].init.method, 'DELETE');
});
