'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = () => JSON.parse(read('pluginInfo.json'));

test('identity', () => {
  const m = manifest();
  assert.equal(m.repoName, 'fpp-porttest');
  assert.equal(m.name, 'Port Test');
  assert.equal(m.author, 'heffneil');
  assert.equal(m.srcURL, 'https://github.com/heffneil/fpp-porttest.git');
});

test('versions', () => {
  assert.deepEqual(manifest().versions, [
    { minFPPVersion: '10.0', maxFPPVersion: '0', branch: 'main', sha: '' },
  ]);
});

test('privacy', () => {
  const p = manifest().privacy;
  assert.deepEqual(Object.keys(p).sort(), [
    'closedCode', 'collects', 'other', 'remoteAccess', 'sends', 'sensors', 'summary', 'systemChanges',
  ]);
  for (const key of ['sends', 'collects', 'sensors', 'systemChanges']) {
    assert.deepEqual(p[key], [], key + ' must be empty');
  }
  assert.equal(p.remoteAccess, 'none');
  assert.equal(p.closedCode, false);
  assert.ok(p.summary.length <= 200, 'summary is ' + p.summary.length + ' characters');
});

test('menu', () => {
  const menu = read('menu.inc');
  assert.equal((menu.match(/'type'\s*=>\s*'status'/g) || []).length, 1);
  assert.equal((menu.match(/'type'\s*=>\s*'help'/g) || []).length, 1);
  assert.match(menu, /'page'\s*=>\s*'status\.php'/);
  assert.match(menu, /'page'\s*=>\s*'about\.php'/);
});

test('pages', () => {
  for (const file of ['status.php', 'about.php']) {
    const source = read(file);
    assert.doesNotMatch(source, /<html/i, file + ' must not emit <html');
    assert.doesNotMatch(source, /<head/i, file + ' must not emit <head');
  }
  const status = read('status.php');
  const reads = status.match(/readfile\([^)]*\)/g) || [];
  assert.ok(reads.length >= 1, 'status.php should inline assets with readfile');
  for (const call of reads) {
    assert.match(call, /\/assets\//, call + ' must read from assets/');
  }
  assert.doesNotMatch(status, /<script[^>]+\ssrc=/i, 'scripts are inlined, never linked');
  assert.doesNotMatch(status, /<link[^>]+rel=["']stylesheet/i, 'styles are inlined, never linked');
});

test('install', () => {
  for (const file of ['scripts/fpp_install.sh', 'scripts/fpp_uninstall.sh']) {
    const source = read(file);
    assert.ok(source.startsWith('#!/bin/bash'), file + ' must start with a bash shebang');
    assert.match(source, /^exit 0$/m, file + ' must exit 0');
    const syntax = spawnSync('bash', ['-n', path.join(root, file)]);
    assert.equal(syntax.status, 0, file + ' has a syntax error: ' + syntax.stderr);
  }
});
