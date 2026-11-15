'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BackupJobs } = require('../src/backend/backup-jobs');
const { Manager } = require('../src/backend/manager');

function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-backup-options-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function uploads() { return { resolve: () => ({ owner: 'native' }), resolveBound: () => ({ owner: 'native' }), handles: new Map([['upload', { file: 'unused' }]]) }; }
function finish(jobs) { return new Promise((resolve) => jobs.on('changed', (job) => { if (job.state === 'needs_attention') resolve(job); })); }

for (const target of ['docker', 'ssh', 'virtualbox']) {
  test('explicit selections reach allocation unchanged for ' + target, async (t) => {
    const instances = []; let received;
    const manager = { dir: directory(t), db: { hosts: [{ id: 'host' }], instances }, check: async () => ({ ok: true }), target: () => ({ status: async () => 'stopped' }), allocate: async (options, identity) => { received = options; instances.push({ id: identity.id, hostingJobId: identity.hostingJobId }); }, get: (id) => instances.find((instance) => instance.id === id), withSecrets: (instance) => instance };
    const jobs = new BackupJobs(manager, uploads()); const done = finish(jobs);
    const options = { port: 18123, ...(target === 'ssh' ? { hostId: 'host' } : {}), ...(target !== 'virtualbox' ? { tag: '2026.11.1.451' } : {}) };
    jobs.start({ request_id: 'explicit-' + target, upload_handle: 'upload', target, options }); await done;
    assert.equal(received.port, 18123); assert.equal(received.tag, options.tag); assert.equal(jobs.jobs[0].options.port, 18123);
  });
}

test('explicit conflicting local port is rejected without allocating another instance', async (t) => {
  const manager = new Manager(directory(t), { portCheck: async () => true });
  manager.db.instances.push({ id: 'existing', name: 'Existing', slug: 'existing', target: 'docker', port: 18123, backups: [] });
  manager.target = () => ({ check: async () => ({ ok: true }), status: async () => 'stopped' });
  const jobs = new BackupJobs(manager, uploads()); const done = finish(jobs);
  jobs.start({ request_id: 'explicit-conflict', upload_handle: 'upload', target: 'docker', options: { port: 18123, tag: 'stable' } });
  const result = await done; assert.equal(result.error_code, 'port_in_use'); assert.equal(manager.db.instances.length, 1);
});

test('absent port and tag retain allocation defaults', async (t) => {
  const manager = new Manager(directory(t), { portCheck: async () => true }); manager.target = () => ({ check: async () => ({ ok: true }), status: async () => 'stopped' });
  const jobs = new BackupJobs(manager, uploads()); const done = finish(jobs);
  jobs.start({ request_id: 'default-options', upload_handle: 'upload', target: 'docker' }); await done;
  assert.equal(manager.db.instances[0].port, 8123); assert.equal(manager.db.instances[0].tag, 'latest');
});

for (const [port, label] of [[0, 'zero'], [-1, 'negative'], [65536, 'overflow'], [8123.5, 'fraction'], ['8123', 'string'], [null, 'null']]) {
  test('invalid explicit port is rejected before admission: ' + label, (t) => {
    const jobs = new BackupJobs({ dir: directory(t), db: { hosts: [] } }, uploads()); jobs.launch = () => assert.fail('Invalid options must not launch');
    assert.throws(() => jobs.start({ request_id: 'invalid-port', upload_handle: 'upload', target: 'docker', options: { port } }), { code: 'invalid_port' }); assert.equal(jobs.jobs.length, 0);
  });
}

for (const tag of ['', 'tag with spaces', 'x;command', 'a'.repeat(129), 451, null]) {
  test('invalid explicit image tag is rejected: ' + String(tag).slice(0, 20), (t) => {
    const jobs = new BackupJobs({ dir: directory(t), db: { hosts: [] } }, uploads()); jobs.launch = () => assert.fail('Invalid options must not launch');
    assert.throws(() => jobs.start({ request_id: 'invalid-image', upload_handle: 'upload', target: 'docker', options: { tag } }), { code: 'invalid_tag' }); assert.equal(jobs.jobs.length, 0);
  });
}

test('same request retains selections and rejects explicit port or image changes', (t) => {
  const jobs = new BackupJobs({ dir: directory(t), db: { hosts: [] } }, uploads()); jobs.launch = () => {};
  const request = { request_id: 'stable-options', upload_handle: 'upload', target: 'docker', options: { port: 18123, tag: '2026.11.1.451' } };
  const first = jobs.start(request); assert.equal(jobs.start({ ...request, options: undefined }).id, first.id);
  assert.throws(() => jobs.start({ ...request, options: { port: 18124 } }), { code: 'idempotency_conflict' });
  assert.throws(() => jobs.start({ ...request, options: { tag: 'latest' } }), { code: 'idempotency_conflict' });
  assert.throws(() => jobs.start({ ...request, options: { port: 0 } }), { code: 'invalid_port' });
});

test('appliance targets never claim container image selections', (t) => {
  const jobs = new BackupJobs({ dir: directory(t), db: { hosts: [] } }, uploads()); jobs.launch = () => assert.fail('Unsupported options must not launch');
  assert.throws(() => jobs.start({ request_id: 'vmware-tag', upload_handle: 'upload', target: 'vmware', options: { tag: 'latest' } }), { code: 'unsupported_option' });
  assert.throws(() => jobs.start({ request_id: 'vmware-port', upload_handle: 'upload', target: 'vmware', options: { port: 8123 } }), { code: 'unsupported_option' });
});
