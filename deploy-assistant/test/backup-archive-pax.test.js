'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');
const { inspectTar } = require('../src/backend/backup-archive');
function archive(t, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-backup-pax-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const blocks = [];
  for (const row of rows) {
    const body = Buffer.from(row.body || ''); const header = new tar.Header({ path: row.name, type: row.type || 'File', size: row.size ?? body.length, mode: 0o600, uid: 0, gid: 0, mtime: new Date(0) }); header.encode();
    blocks.push(header.block, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024)); const file = path.join(dir, 'backup.tar'); fs.writeFileSync(file, Buffer.concat(blocks)); return file;
}
const meta = { name: 'PaxHeader/backup.json', type: 'ExtendedHeader', body: '9 size=2\n' };
const backup = { name: './backup.json', size: 0, body: '{}' };
const core = { name: 'homeassistant.tar.gz', body: '' };

test('per-entry PAX size overrides a zero physical size without desynchronizing inventory', async (t) => {
  const file = archive(t, [meta, backup, core]); assert.equal(fs.statSync(file).size, 3584);
  assert.equal((await inspectTar(file)).entries, 2);
});

test('per-entry size clears before the following physical zero-sized file', async (t) => {
  assert.equal((await inspectTar(archive(t, [meta, backup, core, { name: 'last-empty' }]))).entries, 3);
});

test('global PAX size persists and is replaced by a later global size', async (t) => {
  const file = archive(t, [{ ...meta, type: 'GlobalExtendedHeader' }, backup, { name: 'two-byte-file', size: 0, body: 'ab' }, { ...meta, type: 'GlobalExtendedHeader', body: '9 size=0\n' }, core]);
  assert.equal((await inspectTar(file)).entries, 3);
});

test('local size overrides global size for one file only', async (t) => {
  const file = archive(t, [{ ...meta, type: 'GlobalExtendedHeader', body: '9 size=3\n' }, meta, backup, { ...core, size: 0, body: 'abc' }]);
  await tar.t({ file, strict: true });
  const result = await inspectTar(file); assert.equal(result.entries, 2); assert.equal(result.bytes, 5);
});

test('pending local size does not replace the next metadata header physical size', async (t) => {
  const file = archive(t, [meta, { name: 'PaxHeader/mtime', type: 'ExtendedHeader', body: '11 mtime=0\n' }, backup, core]);
  assert.equal((await inspectTar(file)).entries, 2);
});

for (const body of ['99 size=2\n', '9 size=x\n', '9 size=-1\n', '9 size=2', '11 size=2\n', 'size=2\n']) {
  test('malformed PAX metadata is rejected: ' + JSON.stringify(body), async (t) => {
    await assert.rejects(inspectTar(archive(t, [{ ...meta, body }, { name: 'backup.json', body: '{}' }, core])), { code: 'unsafe_backup_archive' });
  });
}

test('oversized metadata is rejected without consuming its advertised body', async (t) => {
  await assert.rejects(inspectTar(archive(t, [{ ...meta, size: 1024 * 1024 + 1, body: '' }, { name: 'backup.json', body: '{}' }, core])), { code: 'unsafe_backup_archive' });
});

test('PAX sizes beyond the backup limit are rejected without allocating their payload', async (t) => {
  const body = new tar.Pax({ size: 64 * 1024 ** 3 + 1 }).encodeBody();
  await assert.rejects(inspectTar(archive(t, [{ ...meta, body }, backup, core])), { code: 'backup_too_large' });
});

test('global size clearing uses the installed parser semantics', async (t) => {
  const file = archive(t, [{ ...meta, type: 'GlobalExtendedHeader' }, backup, { ...meta, type: 'GlobalExtendedHeader', body: '8 size=\n' }, core]);
  await tar.t({ file, strict: true });
  const result = await inspectTar(file); assert.equal(result.entries, 2); assert.equal(result.bytes, 2);
});
