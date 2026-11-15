'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { waitForFreshOnboarding, restoreHomeAssistantBackup } = require('../src/backend/backup-restore');
const { BackupJobs } = require('../src/backend/backup-jobs');
const failure = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });
function timing(timeoutMs = 20) { let time = 0; return { timeoutMs, intervalMs: 1, now: () => time, sleep: async (ms, signal) => { if (signal?.aborted) throw failure('cancelled'); time += ms; } }; }
function journal(phase = 'provisioned') { return { phase, updates: [], update(patch) { this.updates.push(patch); Object.assign(this, patch); } }; }
const base = 'http://127.0.0.1:8123/';
const manifest = { name: 'Home Assistant', short_name: 'Home Assistant', start_url: '/?homescreen=1', id: '/?homescreen=1', icons: [{}] };

test('real HTTP 401 then 404 then valid 200 stays GET-only until upload is safe', async (t) => {
  const calls = []; let infoCalls = 0; let posts = 0; let uploads = 0;
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, route: req.url });
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.method === 'GET' && req.url === '/api/onboarding/backup/info') { infoCalls++; send(infoCalls === 1 ? 401 : infoCalls === 2 ? 404 : 200, infoCalls < 3 ? {} : { backups: [], state: 'idle' }); return; }
    if (req.method === 'POST') { posts++; assert.equal(infoCalls, 3); req.resume(); send(200, {}); return; }
    send(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const log = journal();
  await restoreHomeAssistantBackup({ base: 'http://127.0.0.1:' + server.address().port + '/', journal: log, readiness: { timeoutMs: 3000, intervalMs: 1 }, uploadFile: async () => { assert.equal(infoCalls, 3); uploads++; return { backup_id: 'owned-backup' }; } });
  assert.equal(uploads, 1); assert.equal(posts, 1); assert.equal(log.phase, 'restore_accepted');
  assert.equal(log.updates.filter((row) => row.phase === 'waiting_for_onboarding').length, 3);
  assert.equal(log.updates.find((row) => row.phase === 'waiting_for_onboarding').state, 'running');
  assert.deepEqual(calls.slice(0, -1).map((call) => call.method), Array(calls.length - 1).fill('GET'));
});

test('malformed preparation responses and startup network failures can warm up', async () => {
  let attempts = 0; const methods = [];
  const info = await waitForFreshOnboarding({ base, ...timing(), api: async (origin, route, options) => {
    methods.push(options.method);
    if (route !== '/api/onboarding/backup/info') throw failure('target_request_failed', 404);
    attempts++; if (attempts === 1) throw failure('ECONNREFUSED'); if (attempts === 2) throw failure('invalid_target_response'); if (attempts === 3) return { preparation: true }; return { backups: [], state: 'idle' };
  } });
  assert.deepEqual(info.backups, []); assert.equal(attempts, 4); assert.equal(methods.every((method) => method === 'GET'), true);
});

test('configured target is rejected without any upload', async () => {
  let uploads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: journal(), readiness: timing(), uploadFile: async () => { uploads++; }, api: async (origin, route) => {
    if (route === '/api/onboarding/backup/info') throw failure('authentication_needed', 401); return [{ step: 'user', done: true }];
  } }), { code: 'target_already_configured' }); assert.equal(uploads, 0);
});

test('configured target with removed onboarding routes is rejected by its Core manifest', async () => {
  await assert.rejects(waitForFreshOnboarding({ base, ...timing(), api: async (origin, route) => { if (route === '/manifest.json') return manifest; throw failure('target_request_failed', 404); } }), { code: 'target_already_configured' });
});

test('known unfinished user setup does not become configured merely because its manifest works', async () => {
  let attempts = 0;
  await waitForFreshOnboarding({ base, ...timing(), api: async (origin, route) => { if (route === '/api/onboarding') return [{ step: 'user', done: false }]; assert.notEqual(route, '/manifest.json'); if (++attempts === 1) throw failure('authentication_needed', 401); return { backups: [], state: 'idle' }; } });
  assert.equal(attempts, 2);
});

test('deadline expires truthfully without upload or restore', async () => {
  let uploads = 0; const log = journal();
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: log, readiness: timing(3), uploadFile: async () => { uploads++; }, api: async () => { throw failure('target_request_failed', 503); } }), { code: 'onboarding_not_ready' });
  assert.equal(uploads, 0); assert.equal(log.phase, 'waiting_for_onboarding');
});

test('late successful response cannot cross the overall deadline', async () => {
  let time = 0;
  await assert.rejects(waitForFreshOnboarding({ base, timeoutMs: 5, now: () => time, api: async () => { time = 6; return { backups: [], state: 'idle' }; } }), { code: 'onboarding_not_ready' });
});

test('cancellation while waiting prevents further reads and all uploads', async () => {
  const controller = new AbortController(); let uploads = 0; let reads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: journal(), signal: controller.signal, readiness: { ...timing(), sleep: async () => controller.abort() }, uploadFile: async () => { uploads++; }, api: async () => { reads++; throw failure('target_request_failed', 503); } }), { code: 'cancelled' });
  assert.equal(reads, 3); assert.equal(uploads, 0);
});

test('invalid certificate fails immediately without retries or an upload', async () => {
  let reads = 0; let sleeps = 0;
  await assert.rejects(waitForFreshOnboarding({ base: 'https://192.168.1.20:8123/', transport: { certificate_fingerprint: 'a'.repeat(64) }, ...timing(), sleep: async () => { sleeps++; }, api: async () => { reads++; throw failure('ERR_TLS_CERT_ALTNAME_INVALID'); } }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  assert.equal(reads, 1); assert.equal(sleeps, 0);
});

test('warmup cannot weaken the loopback or pin requirement', async () => {
  const api = async () => assert.fail('No request over unapproved transport');
  await assert.rejects(waitForFreshOnboarding({ base: 'http://192.168.1.20/', api }), { code: 'encrypted_restore_transport_required' });
  await assert.rejects(waitForFreshOnboarding({ base: 'https://192.168.1.20/', api }), { code: 'verified_tls_pin_required' });
});

test('the same transport identity stays pinned through waiting, upload and restore', async () => {
  const transport = { certificate_fingerprint: 'a'.repeat(64), ca: 'original public certificate' }; let attempts = 0;
  const readiness = { ...timing(), sleep: async () => { transport.certificate_fingerprint = 'b'.repeat(64); transport.ca = 'changed'; } };
  await restoreHomeAssistantBackup({ base: 'https://192.168.1.20:8123/', transport, journal: journal(), readiness, uploadFile: async (origin, file, agent, signal, identity) => { assert.equal(identity.certificate_fingerprint, 'a'.repeat(64)); assert.equal(identity.ca, 'original public certificate'); return { backup_id: 'owned' }; }, api: async (origin, route, options) => {
    assert.equal(options.transport.certificate_fingerprint, 'a'.repeat(64)); assert.equal(options.transport.ca, 'original public certificate');
    if (options.method === 'POST') return {};
    if (route !== '/api/onboarding/backup/info') throw failure('target_request_failed', 404);
    if (++attempts === 1) throw failure('target_request_failed', 503); return { backups: [], state: 'idle' };
  } }); assert.equal(attempts, 2);
});

test('forbidden and unexpected server errors are not startup retries', async () => {
  for (const statusCode of [403, 500]) {
    let reads = 0;
    await assert.rejects(waitForFreshOnboarding({ base, ...timing(), api: async () => { reads++; throw failure('target_request_failed', statusCode); } }), { code: 'target_request_failed' });
    assert.equal(reads, 1);
  }
});

test('cancellation after the ready GET still prevents upload', async () => {
  const controller = new AbortController(); let uploads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: journal(), signal: controller.signal, readiness: timing(), api: async () => { controller.abort(); return { backups: [], state: 'idle' }; }, uploadFile: async () => { uploads++; } }), { code: 'cancelled' });
  assert.equal(uploads, 0);
});

for (const phase of ['restore_submitted', 'restore_accepted']) {
  test('reconciliation never warms up or replays POST for ' + phase, async () => {
    const result = await restoreHomeAssistantBackup({ base, journal: journal(phase), api: async () => assert.fail('No request'), uploadFile: async () => assert.fail('No upload') }); assert.deepEqual(result, { reconciling: true });
  });
}

test('uncertain upload and restore POST failures are not retried by warmup', async () => {
  let uploads = 0;
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: journal(), api: async () => ({ backups: [], state: 'idle' }), uploadFile: async () => { uploads++; throw failure('ECONNRESET'); } }), { code: 'ECONNRESET' }); assert.equal(uploads, 1);
  let posts = 0; const log = journal();
  await assert.rejects(restoreHomeAssistantBackup({ base, journal: log, uploadFile: async () => ({ backup_id: 'owned' }), api: async (origin, route, options) => { if (options.method === 'GET') return { backups: [], state: 'idle' }; posts++; throw failure('ECONNRESET'); } }), { code: 'ECONNRESET' });
  assert.equal(posts, 1); assert.equal(log.phase, 'restore_submitted');
});

test('native resume capability never relabels another interface owner', () => {
  const view = BackupJobs.prototype.public;
  assert.equal(view.call({}, { owner: 'native', state: 'needs_attention' }).can_resume, true);
  assert.equal(view.call({}, { owner: 'core-instance:client', state: 'needs_attention' }).can_resume, false);
  assert.equal(view.call({}, { owner: 'native', state: 'running' }).can_resume, false);
  assert.equal('owner' in view.call({}, { owner: 'native', state: 'needs_resume' }), false);
});
