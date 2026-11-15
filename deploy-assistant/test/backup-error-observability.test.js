'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { BackupJobs } = require('../src/backend/backup-jobs');
const { upload, restoreHomeAssistantBackup, waitForFreshOnboarding, safeHttpStatus, safeErrorStage } = require('../src/backend/backup-restore');
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-upload-observe-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function journal() { return { phase: 'provisioned', update(patch) { Object.assign(this, patch); } }; }
function timing(timeoutMs = 10) { let time = 0; return { timeoutMs, intervalMs: 1, now: () => time, sleep: async (ms) => { time += ms; } }; }

test('only integer HTTP statuses and fixed diagnostic stages survive validation', () => {
  for (const value of [100, 200, 400, 500, 599]) assert.equal(safeHttpStatus(value), value);
  for (const value of [0, 99, 600, 500.5, '500', null, undefined, true, {}, [500], Infinity, NaN]) assert.equal(safeHttpStatus(value), undefined);
  for (const value of ['startup', 'upload', 'restore']) assert.equal(safeErrorStage(value), value);
  for (const value of ['UPLOAD', 'upload\nbody', 'http://host/', '', null, {}, 500]) assert.equal(safeErrorStage(value), undefined);
});

test('real upload rejection retains numeric status and fixed stage without its response payload', async (t) => {
  const file = path.join(directory(t), 'fixture.tar'); fs.writeFileSync(file, '{}'); let posts = 0;
  const server = http.createServer((req, res) => { posts++; req.resume(); res.writeHead(500, { 'Content-Type': 'application/json', 'X-Private-Fixture': 'never-retain' }); res.end(JSON.stringify({ message: 'never-retain', body: 'never-retain' })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(upload('http://127.0.0.1:' + server.address().port + '/', file, 'hassio.local'), (error) => {
    assert.equal(error.code, 'target_request_failed'); assert.equal(error.statusCode, 500); assert.equal(error.stage, 'upload');
    assert.equal(error.message, 'target_request_failed'); assert.equal(error.body, undefined); assert.equal(error.headers, undefined); assert.equal(error.query, undefined); return true;
  }); assert.equal(posts, 1);
});

test('the job journal and public DTO retain only safe failure details', async (t) => {
  const dir = directory(t); const jobs = new BackupJobs({ dir, db: { hosts: [] } }, { handles: new Map() });
  const job = { id: 'owned', owner: 'native', request_id: 'request', upload_handle: 'opaque', options: {}, state: 'running' }; jobs.jobs.push(job);
  jobs.execute = async () => { throw Object.assign(new Error('never-retain'), { code: 'target_request_failed', statusCode: 500, stage: 'upload', body: 'never-retain', headers: { Authorization: 'never-retain' }, query: 'never-retain' }); };
  const done = new Promise((resolve) => jobs.on('changed', (value) => { if (value.state === 'needs_attention') resolve(value); })); jobs.launch(job); const result = await done;
  assert.equal(result.error_http_status, 500); assert.equal(result.error_stage, 'upload'); assert.equal(result.owner, undefined);
  const persisted = fs.readFileSync(jobs.file, 'utf8'); assert.equal(persisted.includes('never-retain'), false); assert.equal(persisted.includes('Authorization'), false);
  assert.equal(JSON.parse(persisted).jobs[0].error_http_status, 500);
});

test('untrusted stored and updated diagnostic properties are rejected', (t) => {
  const dir = directory(t); fs.writeFileSync(path.join(dir, 'backup-host-jobs.json'), JSON.stringify({ version: 1, jobs: [{ id: 'owned', state: 'ready', error_http_status: '500', error_stage: 'upload\nnever-retain' }] }));
  const jobs = new BackupJobs({ dir, db: { hosts: [] } }, { handles: new Map() }); const job = jobs.jobs[0];
  assert.equal(jobs.public(job).error_http_status, undefined); assert.equal(jobs.public(job).error_stage, undefined);
  jobs.update(job, { error_http_status: { value: 'never-retain' }, error_stage: ['upload'] });
  assert.equal(fs.readFileSync(jobs.file, 'utf8').includes('never-retain'), false);
});

test('new attempt and successful restore clear stale diagnostic details', (t) => {
  const jobs = new BackupJobs({ dir: directory(t), db: { hosts: [] } }, { handles: new Map() }); const job = { id: 'owned', owner: 'native', options: {}, state: 'needs_attention', error_http_status: 500, error_stage: 'upload' }; jobs.jobs.push(job); jobs.drain = () => {};
  jobs.enqueue(job, 'transient-fixture'); assert.equal(job.error_http_status, undefined); assert.equal(job.error_stage, undefined);
  jobs.update(job, { error_http_status: 400, error_stage: 'restore' }); jobs.update(job, { phase: 'restore_accepted' });
  assert.equal(job.error_http_status, undefined); assert.equal(job.error_stage, undefined); assert.equal(fs.readFileSync(jobs.file, 'utf8').includes('transient-fixture'), false);
});

test('warmup waits through busy, blocked, missing and invalid manager state before any upload', async () => {
  const states = ['receive_backup', 'blocked', undefined, 'unexpected', 'idle']; let reads = 0; let uploads = 0;
  await restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8123/', journal: journal(), readiness: timing(), uploadFile: async () => { assert.equal(reads, 5); uploads++; return { backup_id: 'owned' }; }, api: async (base, route, options) => { if (options.method === 'GET') { assert.equal(route, '/api/onboarding/backup/info'); return { backups: [], state: states[reads++] }; } return {}; } });
  assert.equal(uploads, 1);
});

test('a permanently busy manager expires without upload', async () => {
  let uploads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8123/', journal: journal(), readiness: timing(3), uploadFile: async () => { uploads++; }, api: async () => ({ backups: [], state: 'create_backup' }) }), { code: 'onboarding_not_ready', stage: 'startup' }); assert.equal(uploads, 0);
});

test('upload and restore stage errors are not confused or automatically retried', async () => {
  let uploads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8123/', journal: journal(), api: async () => ({ backups: [], state: 'idle' }), uploadFile: async () => { uploads++; throw Object.assign(new Error('not-retained'), { code: 'target_request_failed', statusCode: 413, stage: 'restore' }); } }), { code: 'target_request_failed', statusCode: 413, stage: 'upload' }); assert.equal(uploads, 1);
  let posts = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base: 'http://127.0.0.1:8123/', journal: journal(), uploadFile: async () => ({ backup_id: 'owned' }), api: async (base, route, options) => { if (options.method === 'GET') return { backups: [], state: 'idle' }; posts++; throw Object.assign(new Error('not-retained'), { code: 'target_request_failed', statusCode: 500, stage: 'upload' }); } }), { code: 'target_request_failed', statusCode: 500, stage: 'restore' }); assert.equal(posts, 1);
});
