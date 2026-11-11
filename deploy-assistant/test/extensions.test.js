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
