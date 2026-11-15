'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');
const { Readable } = require('node:stream');
const { BackupUploads } = require('../src/backend/backup-archive');
const { BackupJobs } = require('../src/backend/backup-jobs');
const { HostBridge } = require('../src/backend/host-bridge');

async function setup(t, owner = 'native') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-retained-upload-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'backup.json'), '{}'); fs.writeFileSync(path.join(dir, 'homeassistant.tar.gz'), 'fixture');
  const source = path.join(dir, 'source.tar'); await tar.c({ cwd: dir, file: source }, ['backup.json', 'homeassistant.tar.gz']);
  let clock = 1000; const uploads = new BackupUploads(path.join(dir, 'uploads'), { now: () => clock }); const selected = await uploads.pick(source, { owner });
  const manager = { dir, db: { hosts: [] } }; const jobs = new BackupJobs(manager, uploads); let launches = 0; jobs.launch = () => { launches++; };
  const input = { request_id: 'existing-request', upload_handle: selected.upload_handle, target: 'docker', options: { port: 18137, tag: '439' } };
  const first = jobs.start(input, { owner }); const job = jobs.jobs[0]; jobs.update(job, { state: 'needs_resume', phase: 'provisioned' });
  const originalExpiry = selected.expires_at;
  return { dir, source, manager, uploads, jobs, input, job, first, originalExpiry, launches: () => launches, expire: () => { clock = Date.parse(originalExpiry) + 1; } };
}

test('the same authenticated unfinished job resumes a retained expired upload without extending expiry', async (t) => {
  const f = await setup(t); f.expire(); assert.throws(() => f.uploads.resolve(f.input.upload_handle), { code: 'upload_expired' });
  const before = fs.readFileSync(f.source); const result = f.jobs.start({ ...f.input, options: undefined });
  assert.equal(result.id, f.first.id); assert.equal(f.jobs.jobs.length, 1); assert.equal(f.launches(), 2);
  assert.equal(f.uploads.handles.get(f.input.upload_handle).expires_at, f.originalExpiry); assert.deepEqual(fs.readFileSync(f.source), before);
});

test('a new request cannot reuse expired input or opt into expiry relaxation', async (t) => {
  const f = await setup(t); f.expire();
  assert.throws(() => f.jobs.start({ ...f.input, request_id: 'new-request', allowExpired: true, job: f.job }), { code: 'upload_expired' });
  assert.equal(f.jobs.jobs.length, 1); assert.equal(f.launches(), 1);
});

test('cross-owner resume and cross-owner fresh use remain rejected', async (t) => {
  const f = await setup(t); f.expire();
  assert.throws(() => f.jobs.start(f.input, { owner: 'another-instance:client' }), { code: 'unauthorized' });
  assert.throws(() => f.jobs.start({ ...f.input, request_id: 'another-request' }, { owner: 'another-instance:client' }), { code: 'upload_expired' });
});

test('changed request identity or selected options fail before retained access is allowed', async (t) => {
  const f = await setup(t); f.expire();
  for (const changed of [{ target: 'ssh' }, { upload_handle: '00000000-0000-4000-8000-000000000000' }, { options: { port: 18138 } }, { options: { tag: 'latest' } }]) assert.throws(() => f.jobs.start({ ...f.input, ...changed }), { code: 'idempotency_conflict' });
  assert.equal(f.launches(), 1);
});

for (const state of ['ready', 'cancelled']) {
  test('expired input does not grant a terminal job a new start: ' + state, async (t) => {
    const f = await setup(t); f.jobs.update(f.job, { state }); f.expire(); assert.throws(() => f.jobs.start(f.input), { code: 'upload_expired' }); assert.equal(f.launches(), 1);
  });
}

test('terminal jobs retain their existing no-op behavior while their input is valid', async (t) => {
  const f = await setup(t); f.jobs.update(f.job, { state: 'ready' }); assert.equal(f.jobs.start(f.input).state, 'ready'); assert.equal(f.launches(), 1);
});

test('retired and deleted inputs cannot be revived by a bound job', async (t) => {
  const f = await setup(t); f.expire(); const item = f.uploads.handles.get(f.input.upload_handle);
  fs.unlinkSync(item.file); assert.throws(() => f.jobs.start(f.input), { code: 'upload_unavailable' });
  f.uploads.handles.delete(f.input.upload_handle); assert.throws(() => f.jobs.start(f.input), { code: 'upload_expired' });
});

test('retained payloads must be regular files inside the exact upload folder', async (t) => {
  const f = await setup(t); f.expire(); const item = f.uploads.handles.get(f.input.upload_handle);
  const original = item.file; item.file = f.source; assert.throws(() => f.jobs.start(f.input), { code: 'upload_unavailable' }); item.file = original;
  fs.unlinkSync(original); fs.mkdirSync(original); assert.throws(() => f.jobs.start(f.input), { code: 'upload_unavailable' });
});

test('expiry cleanup retains only the unfinished job reference needed for resume', async (t) => {
  const f = await setup(t); f.expire(); f.uploads.cleanupExpired(); assert.equal(fs.existsSync(f.uploads.handles.get(f.input.upload_handle).file), true);
  f.jobs.update(f.job, { state: 'cancelled' }); f.uploads.cleanupExpired(); assert.equal(f.uploads.handles.has(f.input.upload_handle), false); assert.equal(fs.existsSync(f.source), true);
});

test('authenticated bridge start uses the same owner-bound resume validation', async (t) => {
  const owner = 'instance-one:client-one'; const f = await setup(t, owner); f.expire();
  const bridge = new HostBridge(f.manager, f.uploads, f.jobs, { isEncryptionAvailable: () => false }); bridge.bind = 'https://192.168.1.20:48321'; bridge.authority.authenticate = () => owner;
  const req = Readable.from([Buffer.from(JSON.stringify({ ...f.input, options: undefined }))]); req.method = 'POST'; req.url = '/v1/jobs'; req.headers = { 'content-type': 'application/json' };
  let response; bridge.reply = (res, status, value) => { response = { status, value }; };
  await bridge.route(req, {}); assert.equal(response.status, 202); assert.equal(response.value.id, f.first.id); assert.equal(f.jobs.jobs.length, 1); assert.equal(f.launches(), 2);
});
