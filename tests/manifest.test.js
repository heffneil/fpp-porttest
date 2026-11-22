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
  assert.equal((menu.match(/'type'\s*=>\s*'output'/g) || []).length, 1, 'listed under Input/Output Setup too');
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

// What FPP does for each menu (www/menu.inc list_plugin_entries): sets $plugin and
// $menu, includes the plugin's menu.inc, and shows whatever it prints. A file that
// only defines $menuEntries prints nothing and the plugin is in no menu at all.
function menuHtml(menuType) {
  const code = `$plugin = 'fpp-porttest'; $menu = ${JSON.stringify(menuType)}; include ${JSON.stringify(path.join(root, 'menu.inc'))};`;
  const r = spawnSync('php', ['-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('menu.inc prints a link for Status/Control, Input/Output Setup and Help, and none for Content Setup', () => {
  const link = (page, text) => new RegExp(`<li><a href='plugin\\.php\\?plugin=fpp-porttest&page=${page}'>${text}</a></li>`);
  assert.match(menuHtml('status'), link('status\\.php', 'Port Test'));
  assert.match(menuHtml('output'), link('status\\.php', 'Port Test'));
  assert.match(menuHtml('help'), link('about\\.php', 'Port Test - Help'));
  assert.equal(menuHtml('content').trim(), '', 'nothing under Content Setup');
  assert.equal((menuHtml('output').match(/<li>/g) || []).length, 1, 'one entry per menu');
});


// ---- runtime log ------------------------------------------------------------
const os = require('node:os');

function logWrite(dirs, event, detail) {
  const code = `require ${JSON.stringify(path.join(root, 'lib/log.inc'))}; ` +
    `echo json_encode(porttest_log_write(${JSON.stringify(dirs.logs)}, ${JSON.stringify(dirs.media)}, ${JSON.stringify(event)}, ${JSON.stringify(detail)}));`;
  const r = spawnSync('php', ['-r', code.replace('require ', 'require_once ')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
function tmpDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'porttest-'));
  fs.mkdirSync(path.join(base, 'logs'));
  fs.mkdirSync(path.join(base, 'media', 'config'), { recursive: true });
  return { logs: path.join(base, 'logs'), media: path.join(base, 'media') };
}

test('log.inc appends one dated line per event to plugin-fpp-porttest.log', () => {
  const d = tmpDirs();
  assert.equal(logWrite(d, 'test_start', 'Port Number, ports 1,2'), true);
  logWrite(d, 'test_stop', '');
  const lines = fs.readFileSync(path.join(d.logs, 'plugin-fpp-porttest.log'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d test_start Port Number, ports 1,2$/);
  assert.match(lines[1], / test_stop$/);
});

test('log.inc rejects odd event names and flattens control characters and long detail', () => {
  const d = tmpDirs();
  assert.equal(logWrite(d, '../x', 'a'), false);
  assert.equal(logWrite(d, '', 'a'), false);
  assert.equal(fs.existsSync(path.join(d.logs, 'plugin-fpp-porttest.log')), false);
  logWrite(d, 'note', 'a\nb\r\tc' + 'z'.repeat(500));
  const text = fs.readFileSync(path.join(d.logs, 'plugin-fpp-porttest.log'), 'utf8');
  assert.equal(text.trim().split('\n').length, 1);
  assert.ok(text.length < 260);
});

test('log.inc keeps the log from growing without bound', () => {
  const d = tmpDirs();
  const file = path.join(d.logs, 'plugin-fpp-porttest.log');
  fs.writeFileSync(file, 'x'.repeat(300 * 1024));
  logWrite(d, 'note', 'fresh');
  assert.ok(fs.statSync(file).size < 1024);
  assert.ok(fs.existsSync(file + '.1'));
});

test('channel_test_on and channel_test_off set and clear the marker the uninstall script reads', () => {
  const d = tmpDirs();
  const marker = path.join(d.media, 'config', 'plugin.fpp-porttest.channeltest');
  logWrite(d, 'channel_test_on', 'Solid color');
  assert.equal(fs.existsSync(marker), true);
  logWrite(d, 'channel_test_off', '');
  assert.equal(fs.existsSync(marker), false);
});

test('uninstall only sends Test Stop when the marker says our channel test is on', () => {
  const sh = read('scripts/fpp_uninstall.sh');
  assert.match(sh, /plugin\.fpp-porttest\.channeltest/);
  const marker = sh.indexOf('plugin.fpp-porttest.channeltest');
  const guard = sh.indexOf('if [ -f "${MARKER}" ]');
  const stop = sh.indexOf('Test Stop');
  assert.ok(marker !== -1 && marker < guard && guard < stop, 'Test Stop must sit inside the marker check');
});
