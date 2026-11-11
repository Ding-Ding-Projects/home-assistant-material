'use strict';
// The only code that runs with administrator rights: writes one image to one drive, reads it back
// to check it, and reports progress in a file. Usage: writer.js <image> <device> <progress.json>
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const [image, device, progressFile] = process.argv.slice(2);
const report = (p) => { try { fs.writeFileSync(progressFile, JSON.stringify({ ...p, at: Date.now() })); } catch { /* the app reads the last good one */ } };
const BLOCK = 4 * 1024 * 1024;

let read = 0;
async function source() {
  const file = fs.createReadStream(image, { highWaterMark: 1024 * 1024 });
  file.on('data', (c) => { read += c.length; });
  const raw = Readable.toWeb(file);
  if (!image.endsWith('.xz')) return Readable.fromWeb(raw);
  const { XzReadableStream } = require('xz-decompress');
  return Readable.fromWeb(new XzReadableStream(raw));
}

async function main() {
  if (!image || !device || !progressFile) throw new Error('writer.js needs an image, a device and a progress file.');
  const total = fs.statSync(image).size;
  const fd = fs.openSync(device, fs.constants.O_WRONLY | (process.platform === 'linux' ? fs.constants.O_SYNC : 0));
  const hash = crypto.createHash('sha256');
  let written = 0;
  let pending = Buffer.alloc(0);
  const flush = (buf) => { let off = 0; while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off, written + off); written += buf.length; hash.update(buf); };
  report({ state: 'writing', fraction: 0, written: 0 });
  let last = 0;
  for await (const chunk of await source()) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    while (pending.length >= BLOCK) { flush(pending.subarray(0, BLOCK)); pending = pending.subarray(BLOCK); }
    if (Date.now() - last > 400) { last = Date.now(); report({ state: 'writing', fraction: Math.min(0.99, read / total), written }); }
  }
  if (pending.length) {
    // Raw devices take whole sectors; pad the tail with zeros to 512 bytes. Only the image's own bytes are checked.
    const real = pending.length;
    const padded = Buffer.alloc(Math.ceil(real / 512) * 512);
    pending.copy(padded);
    let off = 0; while (off < padded.length) off += fs.writeSync(fd, padded, off, padded.length - off, written + off);
    hash.update(pending); written += real;
  }
  try { fs.fsyncSync(fd); } catch { /* some devices do not support it */ }
  fs.closeSync(fd);
  report({ state: 'verifying', fraction: 0, written });
  const rfd = fs.openSync(device, 'r');
  const check = crypto.createHash('sha256');
  const buf = Buffer.alloc(BLOCK);
  let pos = 0;
  while (pos < written) {
    const want = Math.min(BLOCK, written - pos);
    const aligned = Math.ceil(want / 512) * 512;
    const n = fs.readSync(rfd, buf, 0, aligned, pos);
    if (n <= 0) break;
    check.update(buf.subarray(0, Math.min(n, want)));
    pos += Math.min(n, want);
    if (Date.now() - last > 400) { last = Date.now(); report({ state: 'verifying', fraction: pos / written, written }); }
  }
  fs.closeSync(rfd);
  const a = hash.digest('hex');
  const b = check.digest('hex');
  if (a !== b) throw new Error('what was read back does not match what was written');
  report({ state: 'done', fraction: 1, written, sha256: a });
}

main().catch((e) => { report({ state: 'failed', error: e.message }); process.exitCode = 1; });
