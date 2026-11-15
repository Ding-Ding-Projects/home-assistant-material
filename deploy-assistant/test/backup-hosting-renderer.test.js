'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/parts/backup-hosting.js'), 'utf8');
const pending = (overrides = {}) => ({
  id: 'job-1', request_id: 'request-1', target: 'ssh', state: 'needs_attention',
  error_code: 'host_key_approval_required', host_id: 'saved-host-1',
  upload_handle: 'opaque-upload-1', ...overrides,
});

function view(approval = { approved: true, host_id: 'saved-host-1' }) {
  const calls = [];
  const context = {
    W: {}, R: { deploy() {}, backups() {} }, render() {},
    document: { addEventListener() {} }, window: { addEventListener() {} },
    DEMO: false, st: { active: 'none' }, soon() {},
    clearTimeout() {}, setTimeout() { return 1; },
    API: {
      async sshHostKeyApprove(hostId) { calls.push(['approve', hostId]); return approval; },
      async backupHostStart(request) { calls.push(['start', JSON.parse(JSON.stringify(request))]); },
      async backupHostJobs() { return { jobs: [] }; },
    },
  };
  context.L = (key) => context.W[key]?.[0] || key;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls };
}

test('SSH approval requires the exact host-key state and job-owned handles', () => {
  const { context, calls } = view();
  assert.deepEqual(calls, [], 'loading the renderer must not request approval');
  assert.equal(context.backupHostCanApproveSsh(pending()), true);
  assert.equal(context.backupHostCanApproveSsh(pending({ state: 'needs_resume', error_code: 'host_key_changed' })), true);
  for (const overrides of [{ target: 'docker' }, { state: 'running' },
    { error_code: 'incorrect_password' }, { host_id: '' }, { upload_handle: '' }]) {
    assert.equal(context.backupHostCanApproveSsh(pending(overrides)), false);
  }
});

test('native approval resumes the exact job and never passes an approval flag', async () => {
  const { context, calls } = view();
  context.backupHost.jobs = [pending()];
  context.backupHost.submittedOptions = { hostId: 'unrelated-selected-host' };
  await context.backupHostApproveSsh('job-1');
  assert.deepEqual(calls, [
    ['approve', 'saved-host-1'],
    ['start', { request_id: 'request-1', upload_handle: 'opaque-upload-1', target: 'ssh' }],
  ]);
});

test('declined or mismatched native approval never resumes a job', async () => {
  for (const approval of [{ approved: false, host_id: 'saved-host-1' },
    { approved: true, host_id: 'other-host' }, null]) {
    const { context, calls } = view(approval);
    context.backupHost.jobs = [pending()];
    await context.backupHostApproveSsh('job-1');
    assert.deepEqual(calls, [['approve', 'saved-host-1']]);
  }
});

test('cancelling remains active and explicitly describes settling work', () => {
  const { context } = view();
  assert.equal(context.backupHostActive(pending({ state: 'cancelling' })), true);
  assert.match(context.backupHostState(pending({ state: 'cancelling' })), /waiting for the current operation to settle/);
  assert.equal(context.backupHostActive(pending({ state: 'cancelled' })), false);
});
