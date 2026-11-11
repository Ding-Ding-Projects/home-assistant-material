'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { composeYaml } = require('../src/backend/compose');
const { slug, uniqueSlug, freePort } = require('../src/backend/util');
const { Manager } = require('../src/backend/manager');

test('compose file has its own name, port and config folder', () => {
  const y = composeYaml({ slug: 'home-2', port: 8124, tag: '2026.11.1.64', timezone: 'America/Toronto' });
  assert.match(y, /^name: ham-home-2$/m);
  assert.match(y, /container_name: ham-home-2/);
  assert.match(y, /- "8124:8123"/);
  assert.match(y, /image: ghcr\.io\/ding-ding-projects\/home-assistant-material:2026\.11\.1\.64/);
  assert.match(y, /TZ: "America\/Toronto"/);
});

test('compose refuses unsafe names, ports and tags', () => {
  assert.throws(() => composeYaml({ slug: 'Bad Name', port: 8123 }));
  assert.throws(() => composeYaml({ slug: 'ok', port: 70000 }));
  assert.throws(() => composeYaml({ slug: 'ok', port: 8123, tag: 'x; rm -rf /' }));
});

test('names become safe and unique', () => {
  assert.equal(slug('Kitchen Hub!'), 'kitchen-hub');
  assert.equal(slug('廚房'), 'home');
  assert.equal(uniqueSlug('Home 1', ['home-1']), 'home-1-2');
});

test('free port skips taken ones', async () => {
  const p = await freePort(8123, [8123, 8124], async (x) => x !== 8125);
  assert.equal(p, 8126);
});

test('one click defaults give a new name and port each time', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-'));
  const m = new Manager(dir, { portCheck: async () => true });
  m.db.instances.push({ id: 'a', target: 'docker', port: 8123, slug: 'home-1', backups: [] });
  const d = await m.defaults('docker');
  assert.equal(d.name, 'Home 2');
  assert.equal(d.port, 8124);
  assert.equal(d.tag, 'latest');
});

test('hosts keep passwords encrypted and never hand them out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-'));
  const m = new Manager(dir, { encrypt: (s) => 'enc:' + s, decrypt: (s) => s.slice(4) });
  const id = m.saveHost({ address: '192.168.1.5', user: 'pi', password: 'secret' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'instances.json'))).hosts[0].password, 'enc:secret');
  assert.equal(m.snapshot().hosts[0].password, '(saved)');
  assert.equal(m.withSecrets({ hostId: id }).host.password, 'secret');
  m.saveHost({ id, address: '192.168.1.5', user: 'pi', password: '(saved)' });
  assert.equal(m.db.hosts[0].password, 'enc:secret');
});

test('scheduled backups run once a day at the chosen time', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-'));
  const m = new Manager(dir);
  const runs = [];
  m.run = async (id, action) => { runs.push(action); };
  m.db.instances.push({ id: 'a', target: 'docker', port: 8123, slug: 'a', backups: [], backupsOn: true, state: 'running' });
  m.setSchedule({ on: true, time: '03:00' });
  const t = new Date(); t.setHours(3, 0, 0, 0);
  await m.tick(t); await m.tick(t);
  assert.deepEqual(runs, ['backup']);
});
