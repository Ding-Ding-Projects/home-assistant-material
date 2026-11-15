'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BootstrapImageService, inside, storageAvailable, localAddress, verifyCandidate, waitForOwnedAppliance } = require('../src/backend/backup-bootstrap');

test('bootstrap requires a digest-pinned helper before any process invocation', async () => {
  let invoked = false;
  const service = new BootstrapImageService({ helperImage: 'example/helper:latest', execute: async () => { invoked = true; } });
  await assert.rejects(service.prepare({ jobId: '00000000-0000-4000-8000-000000000000', format: 'raw' }), { code: 'bootstrap_helper_not_pinned' });
  assert.equal(invoked, false);
});

test('bootstrap refuses plaintext storage and invalid job identities', async () => {
  assert.equal(storageAvailable({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' }), false);
  const service = new BootstrapImageService({ helperImage: 'example/helper@sha256:' + 'a'.repeat(64) });
  await assert.rejects(service.prepare({ jobId: '../other-job', format: 'raw' }), { code: 'invalid_bootstrap_request' });
  await assert.rejects(service.prepare({ jobId: '00000000-0000-4000-8000-000000000000', format: 'raw' }), { code: 'secure_storage_unavailable' });
});

test('owned path checks reject root itself, parent escape, and symlink escape', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-outside-'));
  try {
    fs.mkdirSync(path.join(root, 'owned'));
    assert.equal(inside(root, path.join(root, 'owned')), true);
    assert.equal(inside(root, root), false);
    assert.equal(inside(root, other), false);
    fs.symlinkSync(other, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(inside(root, path.join(root, 'escape')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true });
  }
});

test('discovery is bounded to explicit local candidates and carries no plaintext fallback', async () => {
  for (const address of ['10.0.0.2', '172.16.1.2', '192.168.2.3', '127.0.0.1', 'fd00::1', '::1']) assert.equal(localAddress(address), true);
  for (const address of ['8.8.8.8', '172.32.0.1', '224.0.0.1', '2001:4860::1', 'example.invalid']) assert.equal(localAddress(address), false);
  assert.equal(await verifyCandidate('8.8.8.8', {}), null);
  await assert.rejects(waitForOwnedAppliance({ candidates: async () => ['8.8.8.8'], timeoutMs: 0 }), { code: 'bootstrap_candidates_invalid' });
  await assert.rejects(waitForOwnedAppliance({ candidates: async () => [], timeoutMs: 3600001 }), { code: 'invalid_bootstrap_discovery' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForOwnedAppliance({ candidates: async () => [], signal: controller.signal }), { code: 'bootstrap_cancelled' });
});
