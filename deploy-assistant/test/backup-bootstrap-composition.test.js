'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapService } = require('../src/backend/backup-bootstrap-service');
const { discoverPi, validateAddresses } = require('../src/backend/backup-appliance-discovery');
const { run } = require('../src/backend/util');
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-bootstrap-compose-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('missing or mutable bootstrap descriptors never create a preparation service', async (t) => {
  const dir = directory(t); const descriptorFile = path.join(dir, 'helper.json');
  const options = { rootDir: dir, cacheDir: dir, descriptorFile, safeStorage: { isEncryptionAvailable: () => true }, Service: class { constructor() { assert.fail('No service for an unverified image'); } } };
  const absent = bootstrapService(options); assert.equal(absent.available, false); await assert.rejects(absent.prepare({}), { code: 'bootstrap_helper_unavailable' });
  fs.writeFileSync(descriptorFile, JSON.stringify({ image: 'ghcr.io/ding-ding-projects/bootstrap:latest' }));
  const mutable = bootstrapService(options); assert.equal(mutable.available, false); await assert.rejects(mutable.prepare({}), { code: 'bootstrap_helper_not_pinned' });
});

test('composition passes exact immutable descriptor and actual storage into the service', async (t) => {
  const dir = directory(t); const descriptorFile = path.join(dir, 'helper.json'); const image = 'ghcr.io/ding-ding-projects/bootstrap@sha256:' + 'a'.repeat(64);
  fs.writeFileSync(descriptorFile, JSON.stringify({ image })); const storage = { isEncryptionAvailable: () => true }; let seen;
  class Service { constructor(options) { seen = options; } async prepare(input) { return { received: input }; } }
  const service = bootstrapService({ rootDir: dir, cacheDir: dir, descriptorFile, safeStorage: storage, Service });
  assert.equal(service.available, true); assert.equal(seen.helperImage, image); assert.equal(seen.safeStorage, storage); assert.deepEqual(await service.prepare({ jobId: 'owned' }), { received: { jobId: 'owned' } });
});

test('Pi discovery submits only selected private candidates with the exact job identity', async () => {
  const transport = { ca: 'public fixture', certificate_fingerprint: 'a'.repeat(64), servername: 'backup-owned.invalid' }; const signal = new AbortController().signal;
  const result = await discoverPi({ addresses: ['192.168.1.20', '192.168.1.20'], transport, signal, lookup: async () => assert.fail('Explicit addresses need no DNS lookup'), wait: async (options) => {
    assert.deepEqual(await options.candidates(), ['192.168.1.20']); assert.equal(options.transport, transport); assert.equal(options.signal, signal); return null;
  } });
  assert.equal(result, null);
  for (const addresses of [['8.8.8.8'], ['127.0.0.1'], ['192.168.1.0/24'], ['http://192.168.1.20'], Array(17).fill('192.168.1.20')]) assert.throws(() => validateAddresses(addresses), { code: 'invalid_pi_addresses' });
});

test('scoped mDNS fallback still requires the certificate-verifying waiter', async () => {
  await discoverPi({ transport: {}, lookup: async (name) => { assert.equal(name, 'homeassistant.local'); return [{ address: '192.168.1.20' }, { address: '8.8.8.8' }]; }, wait: async ({ candidates }) => { assert.deepEqual(await candidates(), ['192.168.1.20']); return null; } });
});

test('mismatched prepared-image receipts cannot trigger replacement or reuse', async (t) => {
  const dir = directory(t); const descriptorFile = path.join(dir, 'helper.json'); const jobId = '12345678-1234-4234-8234-123456789abc';
  fs.writeFileSync(descriptorFile, JSON.stringify({ image: 'ghcr.io/ding-ding-projects/bootstrap@sha256:' + 'a'.repeat(64) }));
  const jobDir = path.join(dir, jobId); fs.mkdirSync(jobDir); fs.writeFileSync(path.join(jobDir, 'bootstrap-receipt.json'), JSON.stringify({ jobId: 'different-job', format: 'raw' }));
  class Service { async prepare() { assert.fail('Never replace a recorded prepared image'); } }
  const service = bootstrapService({ rootDir: dir, cacheDir: dir, descriptorFile, safeStorage: { isEncryptionAvailable: () => true }, Service });
  await assert.rejects(service.prepare({ jobId, format: 'raw', image: { file: 'unused' } }), { code: 'bootstrap_receipt_invalid' });
});

test('closed child stdin is handled without exposing the private request', async () => {
  const result = await run(process.execPath, ['-e', 'process.stdin.destroy();setTimeout(()=>process.exit(0),10)'], { input: 'private fixture'.repeat(100000), timeout: 5000 });
  assert.doesNotMatch(result.err, /private fixture/); assert.equal(typeof result.code, 'number');
});
