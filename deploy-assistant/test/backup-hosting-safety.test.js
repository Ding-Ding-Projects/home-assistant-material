'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once, EventEmitter } = require('node:events');
const { UploadCapacity } = require('../src/backend/backup-capacity');
const { BackupJobs, JOB_LIMITS } = require('../src/backend/backup-jobs');
const { BackupUploads } = require('../src/backend/backup-archive');
const { targetUrl } = require('../src/backend/backup-restore');
const { Manager } = require('../src/backend/manager');
const ssh = require('../src/backend/ssh');

function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-backup-safety-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('upload slots and aggregate space are reserved atomically before streaming', () => {
  const capacity = new UploadCapacity('unused', { statfs: () => ({ bavail: 1024 ** 4, bsize: 1 }), maximumBytes: 3 * 1024 * 1024 });
  const first = capacity.reserve('owner-a', 1000);
  assert.throws(() => capacity.reserve('owner-a', 1000), { code: 'upload_capacity' });
  const second = capacity.reserve('owner-b', 1000);
  assert.throws(() => capacity.reserve('owner-c', 1000), { code: 'upload_capacity' });
  first.release(); first.release(); second.release(); assert.equal(capacity.reservations.size, 0);
  assert.throws(() => capacity.reserve('owner-a', 100000), { code: 'insufficient_storage' });
});

test('failed imports remove only their private copy and retain the selected original', async (t) => {
  const dir = directory(t); const selected = path.join(dir, 'selected.tar'); fs.writeFileSync(selected, 'not a tar');
  const uploads = new BackupUploads(path.join(dir, 'uploads'));
  await assert.rejects(uploads.pick(selected));
  assert.equal(fs.readFileSync(selected, 'utf8'), 'not a tar'); assert.deepEqual(fs.readdirSync(uploads.dir), []); assert.equal(uploads.capacity.reservations.size, 0);
});

test('expired imports referenced by unfinished jobs remain available for recovery', (t) => {
  const dir = directory(t); const uploads = new BackupUploads(dir, { now: () => 2000 });
  const handle = '12345678-1234-1234-1234-123456789abc'; fs.mkdirSync(path.join(dir, handle)); fs.writeFileSync(path.join(dir, handle, 'original'), 'retained');
  uploads.handles.set(handle, { expires_at: new Date(1000).toISOString() }); uploads.references = () => new Set([handle]); uploads.cleanupExpired();
  assert.equal(fs.readFileSync(path.join(dir, handle, 'original'), 'utf8'), 'retained');
  uploads.references = () => new Set(); uploads.cleanupExpired(); assert.equal(fs.existsSync(path.join(dir, handle)), false);
});

test('ordinary deployments share atomic local port allocation', async (t) => {
  const manager = new Manager(directory(t), { portCheck: async () => true }); manager.run = async () => {};
  const ids = await Promise.all([manager.deploy({ target: 'docker' }), manager.deploy({ target: 'docker' })]);
  assert.notEqual(manager.get(ids[0]).port, manager.get(ids[1]).port);
  await assert.rejects(manager.allocate({ target: 'virtualbox', port: manager.get(ids[0]).port }, { id: 'backup-owned', hostingJobId: 'job' }), { code: 'port_in_use' });
});

test('job owner and queue bounds are enforced before launch', (t) => {
  const uploads = { resolve: () => ({ owner: 'source-a' }), resolveBound: () => ({ owner: 'source-a' }), handles: new Map() }; const manager = { dir: directory(t), db: { hosts: [] } };
  const jobs = new BackupJobs(manager, uploads); jobs.launch = () => {};
  const input = { request_id: 'request-000', upload_handle: 'upload-000', target: 'docker' };
  const first = jobs.start(input, { owner: 'source-a' }); assert.equal(jobs.jobs[0].owner, 'source-a');
  assert.throws(() => jobs.start({ ...input, request_id: 'request-001' }, { owner: 'source-a' }), { code: 'upload_job_exists' });
  assert.throws(() => jobs.start(input, { owner: 'source-b' }), { code: 'unauthorized' });
  for (let i = 1; i < JOB_LIMITS.outstandingPerOwner; i++) jobs.start({ ...input, request_id: 'request-' + i, upload_handle: 'upload-' + i }, { owner: 'source-a' });
  assert.throws(() => jobs.start({ ...input, request_id: 'request-over', upload_handle: 'upload-over' }, { owner: 'source-a' }), { code: 'job_capacity' });
  assert.equal(jobs.public(jobs.jobs[0]).id, first.id);
});

test('cancellation while status is pending cannot begin provisioning later', async (t) => {
  let resolveStatus; let statusEntered;
  const entered = new Promise((resolve) => { statusEntered = resolve; });
  const status = new Promise((resolve) => { resolveStatus = resolve; });
  let provisions = 0; const instances = [];
  const manager = { dir: directory(t), db: { hosts: [], instances }, check: async () => ({ ok: true }), target: () => ({ status: () => { statusEntered(); return status; }, deploy: () => { provisions++; } }), allocate: async (options, meta) => { instances.push({ id: meta.id, hostingJobId: meta.hostingJobId }); }, get: (id) => instances.find((instance) => instance.id === id), withSecrets: (instance) => instance };
  const jobs = new BackupJobs(manager, { resolve: () => ({ owner: 'native' }), resolveBound: () => ({ owner: 'native' }), handles: new Map([['upload', { file: 'unused' }]]) });
  const job = jobs.start({ request_id: 'cancel-request', upload_handle: 'upload', target: 'docker' }); await entered;
  assert.equal(jobs.cancel(job.id).state, 'cancelling');
  const changed = once(jobs, 'changed'); resolveStatus('missing'); await changed;
  assert.equal(jobs.jobs[0].state, 'cancelled'); assert.equal(provisions, 0);
});

test('restore transport rejects plaintext LAN and unpinned HTTPS', () => {
  assert.throws(() => targetUrl('http://192.168.1.10/'), { code: 'encrypted_restore_transport_required' });
  assert.throws(() => targetUrl('https://192.168.1.10/'), { code: 'verified_tls_pin_required' });
  assert.equal(targetUrl('http://localhost:8123/').hostname, '127.0.0.1');
  assert.equal(targetUrl('https://192.168.1.10/', { certificate_fingerprint: 'a'.repeat(64) }).protocol, 'https:');
});

test('host-key discovery offers no authentication material and never approves a key', async () => {
  let configuration;
  class ProbeClient extends EventEmitter {
    connect(options) { configuration = options; assert.equal(options.hostVerifier('a'.repeat(64)), false); }
    end() {}
  }
  const key = await ssh.probeHostKey({ address: 'host.example', port: 22, user: 'operator', password: 'never-sent' }, { ClientType: ProbeClient });
  assert.equal(key.fingerprint, 'a'.repeat(64));
  for (const field of ['password', 'privateKey', 'passphrase', 'agent']) assert.equal(configuration[field], undefined);
});

test('missing or changed SSH host keys prevent authentication', async () => {
  await assert.rejects(ssh.connect({ address: 'host.example', user: 'operator' }), { code: 'host_key_approval_required' });
  class ChangedClient extends EventEmitter {
    connect(options) { assert.equal(options.hostVerifier('b'.repeat(64)), false); this.emit('error', new Error('verification failed')); }
  }
  await assert.rejects(ssh.connect({ address: 'host.example', port: 22, user: 'operator', hostKeyPin: 'a'.repeat(64), hostKeyPinHost: 'host.example:22' }, { ClientType: ChangedClient }), { code: 'host_key_changed' });
});

test('authentication-required links carry verification only after the actual LAN manifest probe', async (t) => {
  const instance = { id: 'owned', hostingJobId: 'job', url: 'http://127.0.0.1:8124/', lanUrl: 'http://192.168.1.20:8124/' };
  const manager = { dir: directory(t), db: { hosts: [] }, target: () => ({}), get: () => instance, withSecrets: (value) => value };
  const routes = [];
  const jobs = new BackupJobs(manager, { handles: new Map([['upload', { file: 'unused' }]]) }, { restore: async () => {}, probe: async (base, route) => {
    routes.push({ base, route });
    if (route.endsWith('/info')) throw Object.assign(new Error('authentication needed'), { code: 'authentication_needed' });
    return { name: 'Home Assistant', short_name: 'Home Assistant', start_url: '/?homescreen=1', id: '/?homescreen=1', icons: [{}] };
  } });
  const job = { id: 'job', target: 'docker', instance_id: 'owned', upload_handle: 'upload', phase: 'restore_accepted' }; jobs.jobs.push(job);
  await jobs.execute(job, undefined, new AbortController().signal);
  assert.equal(job.state, 'authentication_needed'); assert.equal(job.lan_url_verified, true); assert.equal(Number.isNaN(Date.parse(job.lan_url_verified_at)), false);
  assert.deepEqual(routes[1], { base: 'http://192.168.1.20:8124/', route: '/manifest.json' }); assert.notEqual(job.state, 'ready');
});
