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
    document: { addEventListener() {}, getElementById() { return null; } }, window: { addEventListener() {} },
    DEMO: false, st: { active: 'none' }, soon() {}, $() { return null; }, wiz: { vals: {} },
    clearTimeout() {}, setTimeout() { return 1; },
    API: {
      async sshHostKeyApprove(hostId) { calls.push(['approve', hostId]); return approval; },
      async backupHostStart(request) { calls.push(['start', JSON.parse(JSON.stringify(request))]); return { ...request, id: 'new-job', state: 'queued' }; },
      async backupHostJobs() { return { jobs: [] }; },
    },
  };
  context.L = (key) => context.W[key]?.[0] || key;
  context.wizTarget = () => context.st.wizTarget;
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

test('visible image and port choices reach the backup hosting API', async () => {
  for (const target of ['docker', 'ssh', 'virtualbox']) {
    const { context, calls } = view();
    context.st.wizTarget = target;
    context.wiz.vals[target] = { name: 'restored-home', port: '18123', tag: '2026.11.1.442' };
    context.backupHost.file = { upload_handle: 'picked-archive' };
    context.backupHost.requestId = 'selected-backup-request';
    await context.backupHostStart();
    assert.equal(calls.length, 1);
    const request = calls[0][1];
    assert.equal(request.target, target);
    assert.equal(request.options.port, 18123);
    assert.equal(typeof request.options.port, 'number');
    assert.equal(request.options.tag, target === 'virtualbox' ? undefined : '2026.11.1.442');
  }
});

test('absent form defaults and hidden VMware choices are not invented', async () => {
  for (const [target, values] of [['docker', {}], ['ssh', { port: '', tag: '' }],
    ['vmware', { port: '18123', tag: '2026.11.1.442' }]]) {
    const { context, calls } = view();
    context.st.wizTarget = target;
    context.wiz.vals[target] = values;
    context.backupHost.file = { upload_handle: 'picked-archive' };
    context.backupHost.requestId = 'selected-backup-request';
    await context.backupHostStart();
    assert.equal(calls.length, 1);
    assert.equal(Object.hasOwn(calls[0][1].options, 'port'), false);
    assert.equal(Object.hasOwn(calls[0][1].options, 'tag'), false);
  }
});

test('invalid visible ports do not become null or a different default in IPC', async () => {
  for (const port of ['not-a-port', '8123.5', '0', '65536']) {
    const { context, calls } = view();
    context.st.wizTarget = 'docker';
    context.wiz.vals.docker = { port };
    context.backupHost.file = { upload_handle: 'picked-archive' };
    await context.backupHostStart();
    assert.deepEqual(calls, []);
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

test('Pi addresses accept only a bounded explicit private IPv4 list', () => {
  const { context } = view();
  const parse = (value) => Array.from(context.backupHostPiAddresses(value));
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('10.0.0.2, 172.16.0.3\n192.168.1.4 10.0.0.2'),
    ['10.0.0.2', '172.16.0.3', '192.168.1.4']);
  assert.equal(parse(Array.from({ length: 16 }, (_, i) => `192.168.1.${i + 1}`).join(',')).length, 16);
  for (const value of ['8.8.8.8', '127.0.0.1', '169.254.1.2', '172.15.0.2',
    '172.32.0.2', '192.168.1.256', '192.168.01.2', 'homeassistant.local',
    'http://192.168.1.2', '192.168.1.0/24', '192.168.1.*', '10.0.0.1-10',
    Array.from({ length: 17 }, (_, i) => `10.0.0.${i + 1}`).join(' ')]) {
    assert.throws(() => parse(value), /bhPiInvalid/);
  }
});

test('Pi address correction resumes only the waiting job with its opaque handle', async () => {
  const { context, calls } = view();
  context.backupHost.jobs = [pending({ target: 'pi', state: 'waiting_for_boot', error_code: null })];
  context.backupHost.piAddressByJob['job-1'] = '192.168.1.2';
  await context.backupHostRetryPi('job-1');
  assert.deepEqual(calls, [['start', { request_id: 'request-1', upload_handle: 'opaque-upload-1',
    target: 'pi', options: { pi_addresses: ['192.168.1.2'] } }]]);
  for (const overrides of [{ target: 'ssh' }, { state: 'ready' }, { upload_handle: '' }]) {
    const denied = view();
    denied.context.backupHost.jobs = [pending({ target: 'pi', state: 'waiting_for_boot', ...overrides })];
    await denied.context.backupHostRetryPi('job-1');
    assert.deepEqual(denied.calls, []);
  }
});

test('native-owned resume after restart preserves identity and omits options', async () => {
  const { context, calls } = view();
  context.backupHost.file = null;
  context.backupHost.jobs = [pending({ target: 'docker', state: 'needs_resume', error_code: null, can_resume: true })];
  await context.backupHostResume('job-1');
  assert.deepEqual(calls, [['start', { request_id: 'request-1', upload_handle: 'opaque-upload-1', target: 'docker' }]]);
});

test('resume forwards a transient key once and clears the input immediately', async () => {
  const { context, calls } = view();
  const input = { value: 'test-only-key' };
  context.document.getElementById = () => input;
  context.backupHost.jobs = [pending({ target: 'docker', error_code: 'incorrect_password', can_resume: true })];
  await context.backupHostResume('job-1');
  assert.equal(input.value, '');
  assert.deepEqual(calls, [['start', { request_id: 'request-1', upload_handle: 'opaque-upload-1', target: 'docker', password: 'test-only-key' }]]);
  assert.equal(Object.hasOwn(context.backupHost, 'password'), false);
});

test('resume rejects absent owner authority and preserves dedicated approval boundaries', async () => {
  for (const overrides of [{ can_resume: false }, { can_resume: undefined }, { state: 'ready' },
    { upload_handle: '' }, { request_id: '' }, { error_code: 'target_already_configured' },
    { target: 'ssh', error_code: 'host_key_approval_required' }]) {
    const { context, calls } = view();
    context.backupHost.jobs = [pending({ target: 'docker', state: 'needs_attention', error_code: 'onboarding_not_ready', can_resume: true, ...overrides })];
    await context.backupHostResume('job-1');
    assert.deepEqual(calls, []);
  }
});
