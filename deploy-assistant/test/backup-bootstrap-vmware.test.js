'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function adapter({ fetchImage, run = async () => ({ code: 0 }), findProgram = () => 'fixture-program' }) {
  const exports = { exports: {} };
  const requireFixture = (name) => {
    if (name === 'node:fs') return { mkdirSync() {}, readFileSync() { throw Error('cancelled deployment reached configuration'); } };
    if (name === 'node:path') return path;
    if (name === './images') return { fetchImage };
    if (name === './backup-bootstrap') return { verifyCandidate() { throw Error('unexpected identity probe'); } };
    if (name === './util') return { run, findProgram, unitName: () => 'fixture-vm' };
    throw Error('unexpected module');
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/backend/vmware.js'), 'utf8'), { module: exports, require: requireFixture, process: { platform: 'win32' }, setTimeout });
  return exports.exports;
}

test('VMware cancellation before download prevents all provisioning', async () => {
  const controller = new AbortController(); controller.abort();
  const target = adapter({ fetchImage: async () => { throw Error('download must not start'); } });
  await assert.rejects(target.deploy({}, () => {}, () => {}, { signal: controller.signal }), { code: 'hosting_cancelled' });
});

test('VMware cancellation during download prevents image preparation', async () => {
  const controller = new AbortController();
  const target = adapter({ fetchImage: async () => { controller.abort(); return {}; } });
  await assert.rejects(target.deploy({ hostingJobId: 'fixture' }, () => {}, () => {}, { signal: controller.signal, prepareBootstrap: () => { throw Error('must not prepare'); } }), { code: 'hosting_cancelled' });
});

test('VMware cancellation during private preparation prevents import', async () => {
  const controller = new AbortController();
  const target = adapter({ fetchImage: async () => ({}), run: async () => { throw Error('must not import'); } });
  await assert.rejects(target.deploy({ hostingJobId: 'fixture' }, () => {}, () => {}, { signal: controller.signal, prepareBootstrap: async () => { controller.abort(); return {}; } }), { code: 'hosting_cancelled' });
});

test('VMware cancellation during import prevents subsequent start', async () => {
  const controller = new AbortController(); let calls = 0;
  const target = adapter({ fetchImage: async () => ({ file: 'fixture.ova' }), run: async () => { calls++; controller.abort(); return { code: 0 }; } });
  await assert.rejects(target.deploy({ dir: 'fixture', hostingJobId: 'fixture' }, () => {}, () => {}, { signal: controller.signal, prepareBootstrap: async () => ({ transport: {} }) }), { code: 'hosting_cancelled' });
  assert.equal(calls, 1);
});

test('VMware resume address lookup is bounded and never starts the guest', async () => {
  let args; let options;
  const target = adapter({ fetchImage: async () => { throw Error('must not download'); }, run: async (_command, values, opts) => { args = values; options = opts; return { out: '192.168.1.10\n' }; } });
  assert.equal(await target.address({ dir: 'fixture' }), '192.168.1.10');
  assert.deepEqual(Array.from(args), ['-T', 'ws', 'getGuestIPAddress', path.join('fixture', 'fixture-vm', 'fixture-vm.vmx'), '-wait']);
  assert.equal(options.timeout, 30000);
  assert.equal(target.urls({ hostingJobId: 'fixture', restoreTransport: {}, ip: '192.168.1.10' }).url, 'https://192.168.1.10:8123/');
});
