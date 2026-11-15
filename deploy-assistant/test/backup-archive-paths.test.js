'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');
const { gzipSync } = require('node:zlib');
const { inspectTar } = require('../src/backend/backup-archive');

function archive(t, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-core-tar-paths-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const blocks = [];
  for (const row of rows) {
    const body = Buffer.from(row.body || ''); const header = new tar.Header({ path: row.name, type: row.type || 'File', linkpath: row.linkpath, size: body.length, mode: 0o600, mtime: new Date(0), uid: 0, gid: 0 });
    header.encode(); blocks.push(header.block, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024)); const file = path.join(dir, 'backup.tar'); fs.writeFileSync(file, Buffer.concat(blocks)); return file;
}
const core = { name: 'homeassistant.tar.gz', body: 'synthetic encrypted payload' };

test('Python-style leading-dot backup metadata and core payload are recognized', async (t) => {
  const file = archive(t, [{ name: './backup.json', body: '{}' }, { ...core, name: './homeassistant.tar.gz' }]);
  assert.equal(fs.readFileSync(file).subarray(0, 14).toString(), './backup.json\0');
  const result = await inspectTar(file); assert.equal(result.entries, 2);
});

test('a leading-dot root directory is a zero-size inventory no-op', async (t) => {
  const file = archive(t, [{ name: './', type: 'Directory' }, { name: './backup.json', body: '{}' }, core]);
  assert.equal((await inspectTar(file)).entries, 3);
});

test('gzip tar inventory applies the same leading-dot compatibility', async (t) => {
  const file = archive(t, [{ name: './backup.json', body: '{}' }, core]);
  const compressed = file + '.gz'; fs.writeFileSync(compressed, gzipSync(fs.readFileSync(file)));
  assert.equal((await inspectTar(compressed)).entries, 2);
});

for (const names of [['backup.json', './backup.json'], ['./backup.json', 'backup.json']]) {
  test('canonical metadata duplicates are rejected in either order: ' + names[0], async (t) => {
    const file = archive(t, [...names.map((name) => ({ name, body: '{}' })), core]);
    await assert.rejects(inspectTar(file), { code: 'unsafe_backup_archive' });
  });
}

for (const name of ['./../outside', './folder/../outside', './folder/./outside', '/outside', './C:/outside', './folder\\outside', '././backup.json']) {
  test('leading-dot normalization never permits unsafe tar path ' + name, async (t) => {
    const file = archive(t, [{ name: 'backup.json', body: '{}' }, core, { name, body: 'blocked' }]);
    await assert.rejects(inspectTar(file), { code: 'unsafe_backup_archive' });
  });
}

test('the root marker cannot be a file', async (t) => {
  const file = archive(t, [{ name: './', type: 'File' }, { name: 'backup.json', body: '{}' }, core]);
  await assert.rejects(inspectTar(file), { code: 'unsafe_backup_archive' });
});

test('root directory wire size must be zero before parser normalization', async (t) => {
  const file = archive(t, [{ name: './', type: 'Directory', body: '\0' }, { name: 'backup.json', body: '{}' }, core]);
  await assert.rejects(inspectTar(file), { code: 'unsafe_backup_archive' });
});

test('leading-dot symlinks remain rejected', async (t) => {
  const file = archive(t, [{ name: './backup.json', type: 'SymbolicLink', linkpath: 'outside' }, core]);
  await assert.rejects(inspectTar(file), { code: 'unsafe_backup_archive' });
});
