'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const tar = require('tar');
const yauzl = require('yauzl');
const { createGunzip } = require('node:zlib');
const { UploadCapacity } = require('./backup-capacity');

const MAX_BYTES = 64 * 1024 ** 3;
function fail(code) { return Object.assign(new Error(code), { code }); }
function safeName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024 && !name.includes('\\') && !/[\x00-\x1f]/.test(name) && !name.startsWith('/') && !/^[A-Za-z]:/.test(name) && !name.split('/').some((p) => p === '..' || p === '.');
}

function checkedPax(body, previous, global) {
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space < 0 || !/^[1-9][0-9]{0,7}$/.test(body.subarray(offset, space).toString('utf8'))) throw fail('unsafe_backup_archive');
    const length = Number(body.subarray(offset, space).toString('utf8')); const end = offset + length;
    if (end > body.length || end <= space + 2 || body[end - 1] !== 0x0a) throw fail('unsafe_backup_archive');
    const field = body.subarray(space + 1, end - 1); const equals = field.indexOf(0x3d);
    if (equals <= 0) throw fail('unsafe_backup_archive');
    if (field.subarray(0, equals).toString('utf8') === 'size') {
      const value = field.subarray(equals + 1).toString('utf8');
      if (!/^[0-9]*$/.test(value)) throw fail('unsafe_backup_archive');
      if (!Number.isSafeInteger(Number(value)) || Number(value) > MAX_BYTES) throw fail('backup_too_large');
    }
    offset = end;
  }
  return tar.Pax.parse(body.toString('utf8'), previous, global);
}

// Reuse node-tar's effective Header/Pax semantics while retaining physical wire checks.
function rawTarHeaders(maximum) {
  let header = Buffer.alloc(0); let remaining = 0; let bytes = 0; let headers = 0; let metaBytes = 0;
  let extended; let globalExtended; let meta;
  const finishMeta = () => {
    const body = Buffer.concat(meta.chunks);
    switch (meta.type) {
      case 'ExtendedHeader': case 'OldExtendedHeader': extended = checkedPax(body, extended, false); break;
      case 'GlobalExtendedHeader': globalExtended = checkedPax(body, globalExtended, true); break;
      case 'NextFileHasLongPath': case 'OldGnuLongPath': extended = { ...extended, path: body.toString('utf8').replace(/\0.*/, '') }; break;
      case 'NextFileHasLongLinkpath': extended = { ...extended, linkpath: body.toString('utf8').replace(/\0.*/, '') }; break;
    }
    meta = undefined;
  };
  const metaTypes = new Set(['ExtendedHeader', 'OldExtendedHeader', 'GlobalExtendedHeader', 'NextFileHasLongPath', 'OldGnuLongPath', 'NextFileHasLongLinkpath']);
  return new Transform({ transform(chunk, encoding, done) {
    try {
      bytes += chunk.length; if (bytes > maximum) throw fail('backup_too_large');
      let offset = 0;
      while (offset < chunk.length) {
        if (remaining) {
          const take = Math.min(remaining, chunk.length - offset);
          if (meta?.left) { const actual = Math.min(take, meta.left); meta.chunks.push(chunk.subarray(offset, offset + actual)); meta.left -= actual; }
          remaining -= take; offset += take; if (!remaining && meta) finishMeta(); continue;
        }
        const take = Math.min(512 - header.length, chunk.length - offset);
        header = Buffer.concat([header, chunk.subarray(offset, offset + take)]); offset += take;
        if (header.length !== 512) continue;
        if (++headers > 10000) throw fail('unsafe_backup_archive');
        const physical = new tar.Header(header); const decoded = new tar.Header(header, 0, extended, globalExtended);
        if (!decoded.nullBlock) {
          if (!decoded.cksumValid || physical.path.includes('\\') || decoded.path.includes('\\')) throw fail('unsafe_backup_archive');
          if (decoded.path === './') {
            const raw = Buffer.from(header); raw[156] = 0x37;
            if (header[156] !== 0x35 || new tar.Header(raw).size !== 0) throw fail('unsafe_backup_archive');
          }
          if (!Number.isSafeInteger(decoded.size) || decoded.size < 0 || decoded.size > MAX_BYTES) throw fail('backup_too_large');
          if (metaTypes.has(decoded.type)) {
            metaBytes += decoded.size;
            if (decoded.size > 1024 * 1024 || metaBytes > 8 * 1024 * 1024) throw fail('unsafe_backup_archive');
            if (decoded.size) meta = { type: decoded.type, left: decoded.size, chunks: [] };
          } else extended = undefined;
          remaining = Math.ceil(decoded.size / 512) * 512;
        }
        header = Buffer.alloc(0);
      }
      done(null, chunk);
    } catch (error) { done(error); }
  } });
}

async function inspectTar(file) {
  let count = 0; let bytes = 0; let metadata = false; let core = false;
  const names = new Set();
  const parser = new tar.Parser({ strict: true, maxMetaEntrySize: 1024 * 1024, maxDecompressionRatio: 200 });
  parser.on('entry', (entry) => {
    if (++count > 10000) { parser.abort(fail('unsafe_backup_archive')); return; }
    if (entry.path === './' && entry.type === 'Directory' && entry.size === 0) { entry.resume(); return; }
    const rawName = entry.header.path;
    const name = rawName.startsWith('./') ? rawName.slice(2) : rawName;
    if (!safeName(name) || names.has(name) || !['File', 'Directory'].includes(entry.type)) { parser.abort(fail('unsafe_backup_archive')); return; }
    names.add(name); bytes += entry.header.size;
    if (bytes > MAX_BYTES) { parser.abort(fail('backup_too_large')); return; }
    if (name === 'backup.json') { if (entry.header.size > 1024 * 1024) { parser.abort(fail('unsafe_backup_archive')); return; } metadata = true; }
    if (/^homeassistant\.tar(?:\.gz)?$/.test(name)) core = true;
    entry.resume();
  });
  const size = fs.statSync(file).size;
  const prefix = Buffer.alloc(2); const descriptor = await fs.promises.open(file, 'r');
  try { await descriptor.read(prefix, 0, 2, 0); } finally { await descriptor.close(); }
  const guard = rawTarHeaders(Math.min(MAX_BYTES + 10000 * 512 + 1024, Math.max(1024 * 1024, size * 200)));
  if (prefix[0] === 0x1f && prefix[1] === 0x8b) await pipeline(fs.createReadStream(file), createGunzip(), guard, parser);
  else await pipeline(fs.createReadStream(file), guard, parser);
  if (!metadata || !core) throw fail('backup_no_core_archive');
  return { entries: count, bytes };
}

async function unwrapZip(file, destination) {
  const zip = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (e, z) => e ? reject(e) : resolve(z)));
  let candidate = null; let count = 0; let total = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', (entry) => {
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (++count > 1000 || !safeName(entry.fileName) || (mode && mode !== 0x8000 && mode !== 0x4000) || entry.generalPurposeBitFlag & 1) return reject(fail('unsafe_backup_archive'));
        total += entry.uncompressedSize;
        if (total > MAX_BYTES || entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 200)) return reject(fail('backup_too_large'));
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        if (!/\.(?:tar|tar\.gz)$/i.test(entry.fileName) || candidate) return reject(fail('ambiguous_backup_archive'));
        candidate = entry;
        zip.readEntry();
      });
      zip.readEntry();
    });
    if (!candidate) throw fail('backup_no_core_archive');
    const free = fs.statfsSync(path.dirname(destination));
    if (free.bavail * free.bsize < candidate.uncompressedSize + 1024 ** 3) throw fail('insufficient_storage');
  } finally { zip.close(); }
  // Reopen after the complete inventory has passed, before writing any payload.
  const source = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => e ? reject(e) : resolve(z)));
  try {
    await new Promise((resolve, reject) => {
      source.on('error', reject);
      source.on('entry', (entry) => {
        if (entry.fileName !== candidate.fileName) { source.readEntry(); return; }
        source.openReadStream(entry, async (error, stream) => {
          if (error) { reject(error); return; }
          let written = 0;
          const bound = new Transform({ transform(chunk, enc, cb) { written += chunk.length; cb(written > candidate.uncompressedSize || written > MAX_BYTES ? fail('backup_too_large') : null, chunk); } });
          try { await pipeline(stream, bound, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })); resolve(); } catch (e) { reject(e); }
        });
      }); source.readEntry();
    });
  } finally { source.close(); }
}

class BackupUploads {
  constructor(dir, { now = Date.now } = {}) {
    this.dir = dir; this.now = now; this.handles = new Map(); this.references = () => new Set(); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); this.capacity = new UploadCapacity(dir);
    for (const handle of fs.readdirSync(dir)) {
      if (!/^[a-f0-9-]{36}$/.test(handle)) continue;
      try {
        const item = JSON.parse(fs.readFileSync(path.join(dir, handle, 'metadata.json'), 'utf8'));
        if (!['original', 'backup.tar'].includes(item.payload)) continue;
        item.file = path.join(dir, handle, item.payload); item.original = path.join(dir, handle, 'original');
        this.handles.set(handle, item);
      } catch { /* An incomplete import is never offered for restoration. */ }
    }
  }
  persist(item) {
    const { file, original, ...metadata } = item;
    fs.writeFileSync(path.join(this.dir, item.upload_handle, 'metadata.json'), JSON.stringify({ ...metadata, payload: path.basename(file) }), { mode: 0o600 });
  }
  cleanupExpired() {
    const referenced = this.references();
    for (const [handle, item] of this.handles) {
      if (referenced.has(handle) || Date.parse(item.expires_at) > this.now()) continue;
      const directory = path.resolve(this.dir, handle);
      if (!/^[a-f0-9-]{36}$/.test(handle) || path.dirname(directory) !== path.resolve(this.dir)) throw fail('invalid_upload_storage');
      fs.rmSync(directory, { recursive: true, force: true }); this.handles.delete(handle);
    }
  }
  async pick(file, { owner = 'native', reservation } = {}) {
    this.cleanupExpired();
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw fail('unsafe_backup_archive');
    const lease = reservation || this.capacity.reserve(owner, stat.size);
    if (lease.owner !== owner || lease.released) throw fail('invalid_upload_reservation');
    const handle = crypto.randomUUID(); const folder = path.join(this.dir, handle);
    let complete = false;
    try {
    await fs.promises.mkdir(folder, { mode: 0o700 });
    const original = path.join(folder, 'original');
    const free = fs.statfsSync(this.dir); if (free.bavail * free.bsize < stat.size * 2 + 1024 ** 3) throw fail('insufficient_storage');
    let copied = 0;
    await pipeline(fs.createReadStream(file), new Transform({ transform(chunk, enc, cb) { copied += chunk.length; cb(copied > stat.size ? fail('backup_changed') : null, chunk); } }), fs.createWriteStream(original, { flags: 'wx', mode: 0o600 }));
    if (copied !== stat.size) throw fail('backup_changed');
    const head = Buffer.alloc(4); const fd = await fs.promises.open(original, 'r');
    try { await fd.read(head, 0, 4, 0); } finally { await fd.close(); }
    const payload = head.readUInt32LE(0) === 0x04034b50 ? path.join(folder, 'backup.tar') : original;
    if (payload !== original) await unwrapZip(original, payload);
    const inventory = await inspectTar(payload);
    const item = { file: payload, original, owner, upload_handle: handle, name: path.basename(file), size: stat.size, expires_at: new Date(this.now() + 3600000).toISOString(), inventory };
    this.handles.set(handle, item);
    this.persist(item);
    complete = true;
    return this.metadata(item);
    } finally {
      try {
      if (!complete) {
        if (path.dirname(path.resolve(folder)) !== path.resolve(this.dir)) throw fail('invalid_upload_storage');
        await fs.promises.rm(folder, { recursive: true, force: true }); this.handles.delete(handle);
      }
      } finally { if (!reservation) lease.release(); }
    }
  }
  metadata(item) { return { upload_handle: item.upload_handle, name: item.name, size: item.size, expires_at: item.expires_at }; }
  resolve(handle) { const item = this.handles.get(handle); if (!item || Date.parse(item.expires_at) <= this.now()) throw fail('upload_expired'); return item; }
}
module.exports = { BackupUploads, inspectTar, unwrapZip, safeName, MAX_BYTES, fail };
