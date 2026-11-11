'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Manager } = require('../src/backend/manager');
const { Extensions, readManifest } = require('../src/backend/extensions');

test('built-in extensions load, need consent, run with only what they may see', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-ext-'));
  const m = new Manager(dir);
  m.db.instances.push({ id: 'a', name: 'Home', target: 'docker', url: 'http://localhost:8123', state: 'running', port: 8123, backups: [{ at: new Date().toISOString(), kind: 'file', size: 10 }] });
  m.db.hosts.push({ id: 'h', name: 'Pi', address: '1.2.3.4', user: 'pi', password: 'enc:secret' });
  const ext = new Extensions(m, path.join(__dirname, '..', 'src', 'extensions'));
  const list = ext.list();
  assert.deepEqual(list.map((x) => x.id).sort(), ['health-report', 'link-sheet']);
  assert.ok(list.every((x) => !x.enabled));
  assert.throws(() => ext.run('link-sheet', 'sheet'));
  ext.setEnabled('link-sheet', true);
  const r = await ext.run('link-sheet', 'sheet');
  assert.match(r.text, /http:\/\/localhost:8123/);
  assert.doesNotMatch(JSON.stringify(r), /secret/);
});

test('a changed permission turns the extension off until agreed again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-ext-'));
  const m = new Manager(dir);
  const ext = new Extensions(m, path.join(__dirname, '..', 'src', 'extensions'));
  ext.setEnabled('link-sheet', true);
  const mf = path.join(ext.dir, 'link-sheet', 'manifest.json');
  const j = JSON.parse(fs.readFileSync(mf)); j.permissions.push('notify'); fs.writeFileSync(mf, JSON.stringify(j));
  const x = ext.list().find((e) => e.id === 'link-sheet');
  assert.equal(x.enabled, false);
  assert.equal(x.needsConsent, true);
});

test('manifests with unsafe paths or unknown permissions are refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-mf-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifestVersion: 1, id: 'x1', name: 'X', version: '1', main: '../evil.js', commands: [{ id: 'a', title: 'A' }] }));
  assert.throws(() => readManifest(dir), /inside the extension folder/);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifestVersion: 1, id: 'x1', name: 'X', version: '1', main: 'a.js', permissions: ['hosts:passwords'], commands: [{ id: 'a', title: 'A' }] }));
  assert.throws(() => readManifest(dir), /unknown permissions/);
});

test('the update feed is read line by line and bad lines are skipped', () => {
  const { parseReleases, newer } = require('../src/backend/updates');
  const r = parseReleases('﻿A94A8FE5CCB19BA61C4C0873D391E987982FBBD3 ham_deploy_assistant-1.1.4-full.nupkg 123\r\nnot a line\n');
  assert.equal(r.length, 1);
  assert.equal(r[0].sha1, 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3');
  assert.equal(r[0].size, 123);
  assert.ok(newer('1.1.10', '1.1.9'));
  assert.ok(!newer('1.1.4', '1.1.4'));
});

test('record history is append-only and a restore adds a revision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-hist-'));
  const m = new Manager(dir);
  m.save();
  m.db.hosts.push({ id: 'h1', name: 'Pi', address: '10.0.0.2', user: 'pi', port: 22, password: 'enc:x' });
  m.save();
  m.db.hosts[0].name = 'Garage Pi';
  m.save();
  const h = m.history();
  assert.deepEqual(h.map((r) => r.action), ['started', 'created', 'updated']);
  assert.doesNotMatch(JSON.stringify(h), /enc:x/);
  const r = m.restoreRevision(2);
  assert.equal(m.db.hosts[0].name, 'Pi');
  assert.equal(m.db.hosts[0].password, 'enc:x');
  assert.equal(r.action, 'restored');
  assert.equal(m.history().length, 4);
});

test('Home Assistant addresses must be HTTPS or this computer', () => {
  const { checkBase, entityState } = require('../src/backend/ha');
  assert.ok(checkBase('https://ha.example.com:8123'));
  assert.ok(checkBase('http://localhost:8123'));
  assert.throws(() => checkBase('http://192.168.1.5:8123'), /https/);
  assert.throws(() => checkBase('https://user:pw@ha.example.com'), /user name/);
  assert.throws(() => entityState('https://ha.example.com', 't', 'light.kitchen'), /binary_sensor or input_boolean/);
});
