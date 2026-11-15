'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');
const { BackupUploads, safeName } = require('../src/backend/backup-archive');
const { restoreHomeAssistantBackup } = require('../src/backend/backup-restore');
const { BackupJobs } = require('../src/backend/backup-jobs');
const { BridgeAuthority } = require('../src/backend/host-bridge-authority');
const { backupCompose } = require('../src/backend/backup-compose');

function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-backup-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('archive names reject traversal, Windows paths, controls and ambiguous separators', () => {
  for (const name of ['../outside', 'a/../outside', '/absolute', 'C:/data', 'a\\b', './backup.json', 'bad\u0000name']) assert.equal(safeName(name), false, name);
  assert.equal(safeName('homeassistant.tar.gz'), true);
});

test('native import preserves original bytes and returns no filesystem paths', async (t) => {
  const dir = directory(t); fs.writeFileSync(path.join(dir, 'backup.json'), '{}'); fs.writeFileSync(path.join(dir, 'homeassistant.tar.gz'), 'encrypted contents');
  const file = path.join(dir, 'source.tar'); await tar.c({ cwd: dir, file }, ['backup.json', 'homeassistant.tar.gz']);
  const uploads = new BackupUploads(path.join(dir, 'uploads')); const result = await uploads.pick(file);
  assert.deepEqual(Object.keys(result).sort(), ['expires_at', 'name', 'size', 'upload_handle']);
  assert.deepEqual(fs.readFileSync(uploads.resolve(result.upload_handle).original), fs.readFileSync(file));
  const resumed = new BackupUploads(path.join(dir, 'uploads')); assert.equal(resumed.resolve(result.upload_handle).size, result.size);
});

test('non-Home Assistant archive never becomes an upload handle', async (t) => {
  const dir = directory(t); fs.writeFileSync(path.join(dir, 'other'), 'ordinary file'); const file = path.join(dir, 'source.tar'); await tar.c({ cwd: dir, file }, ['other']);
  const uploads = new BackupUploads(path.join(dir, 'uploads')); await assert.rejects(uploads.pick(file), { code: 'backup_no_core_archive' }); assert.equal(uploads.handles.size, 0);
});

test('restore sends the official onboarding protocol without changing automations', async () => {
  const calls = []; const job = { phase: 'provisioned', update(patch) { Object.assign(this, patch); } };
  await restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8124/', file: 'private', password: 'transient', journal: job, uploadFile: async () => ({ backup_id: 'official-id' }), api: async (base, route, options) => { calls.push({ route, options }); return { backups: [], state: 'idle' }; } });
  assert.equal(job.phase, 'restore_accepted');
  assert.deepEqual(JSON.parse(calls[1].options.body), { backup_id: 'official-id', agent_id: 'hassio.local', password: 'transient', restore_database: true });
  assert.equal(JSON.stringify(job).includes('transient'), false);
});

test('uncertain restore submission is never transmitted twice', async () => {
  const job = { phase: 'restore_submitted', update() { assert.fail('No second submission'); } };
  const result = await restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8124/', journal: job, api: async () => assert.fail('No second request') });
  assert.equal(result.reconciling, true);
});

test('typed password rejection remains retryable and never persists the password', async () => {
  const job = { phase: 'uploaded', backup_id: 'id', update(patch) { Object.assign(this, patch); } };
  await assert.rejects(restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8124/', password: 'transient', journal: job, api: async (base, route) => { if (route.endsWith('/restore')) throw Object.assign(new Error('rejected'), { code: 'incorrect_password' }); return { backups: [], state: 'idle' }; } }), { code: 'incorrect_password' });
  assert.equal(job.phase, 'restore_rejected'); assert.equal(JSON.stringify(job).includes('transient'), false);
});

test('bridge authority fails closed without real secure storage', async (t) => {
  const authority = new BridgeAuthority(directory(t), { isEncryptionAvailable: () => false });
  await assert.rejects(authority.initialize(), { code: 'secure_storage_unavailable' });
});

test('native-approved pairing is once-only and credentials bind both identities', (t) => {
  const authority = new BridgeAuthority(directory(t), { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s) });
  authority.data = { version: 1, clients: [] }; authority.fingerprint = () => 'fixture-certificate';
  const input = { core_instance_id: 'source-instance', client_id: 'source-client', challenge: 'a'.repeat(43) };
  const pending = authority.begin(input);
  assert.equal(authority.poll(pending.pairing_id, input.challenge).state, 'pending_native_approval');
  assert.throws(() => authority.poll(pending.pairing_id, 'wrong'), { code: 'unauthorized' });
  authority.approve(pending.pairing_id, true);
  const paired = authority.poll(pending.pairing_id, input.challenge);
  assert.equal(authority.authenticate({ authorization: 'Bearer ' + paired.credential, 'x-core-instance': input.core_instance_id, 'x-client-id': input.client_id }), 'source-instance:source-client');
  assert.throws(() => authority.authenticate({ authorization: 'Bearer ' + paired.credential, 'x-core-instance': 'other-instance', 'x-client-id': input.client_id }), { code: 'unauthorized' });
  assert.throws(() => authority.poll(pending.pairing_id, input.challenge), { code: 'pairing_expired' });
});

test('job retry reuses its durable identity and rejects changed upload ownership', (t) => {
  const dir = directory(t); const uploads = { resolve: () => ({ owner: 'native' }), resolveBound: () => ({ owner: 'native' }) }; const manager = { dir, db: { hosts: [] } };
  const jobs = new BackupJobs(manager, uploads); jobs.launch = () => {};
  const input = { request_id: 'stable-request', upload_handle: 'one', target: 'docker' };
  const first = jobs.start(input); assert.equal(jobs.start(input).id, first.id);
  assert.throws(() => jobs.start({ ...input, upload_handle: 'two' }), { code: 'idempotency_conflict' });
  const resumed = new BackupJobs(manager, uploads); assert.equal(resumed.list().jobs[0].id, first.id); assert.equal(resumed.list().jobs[0].state, 'needs_resume');
});

test('full backup targets have independent full-mode volumes and no source mount', () => {
  const text = backupCompose({ backupHostingFull: true, slug: 'backup-one', prefix: 'ham', port: 8124, tag: 'latest', timezone: 'UTC' });
  assert.match(text, /home-assistant-material-full:latest/); assert.match(text, /name: ham-backup-one-data/); assert.match(text, /8124:80/); assert.doesNotMatch(text, /docker\.sock|\/config:/);
});
