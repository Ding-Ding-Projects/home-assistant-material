'use strict';
// Small helpers shared by every deploy target.
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Runs a program without a shell. Resolves with { code, out, err }; never rejects on a non-zero exit.
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) }, windowsHide: true });
    } catch (e) {
      resolve({ code: -1, out: '', err: String(e.message || e) });
      return;
    }
    const timer = opts.timeout ? setTimeout(() => { child.kill(); err += '\nStopped after ' + Math.round(opts.timeout / 1000) + ' seconds.'; }, opts.timeout) : null;
    child.stdout.on('data', (d) => { out += d; if (opts.onLine) String(d).split(/\r?\n/).filter(Boolean).forEach(opts.onLine); });
    child.stderr.on('data', (d) => { err += d; if (opts.onLine) String(d).split(/\r?\n/).filter(Boolean).forEach(opts.onLine); });
    if (opts.input) { child.stdin.end(opts.input); }
    child.on('error', (e) => { if (timer) clearTimeout(timer); resolve({ code: -1, out, err: err + String(e.message || e) }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, out, err }); });
  });
}

// True when nothing on this computer listens on the port.
function portFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

// The first free port at or above start that no instance has taken.
async function freePort(start, taken, check = portFree) {
  for (let p = start; p < start + 2000; p++) {
    if (taken.includes(p)) continue;
    if (await check(p)) return p;
  }
  throw new Error('No free port between ' + start + ' and ' + (start + 2000) + '.');
}

// A short, safe name for containers, folders and virtual machines.
function slug(name) {
  const s = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'home';
}

// The name of an instance's container, Compose project or virtual machine. The first part
// is the app's short name, or the word the person's own wording file gives for this kind
// of deployment when one is in use; it is fixed when the instance is made.
function namePrefix(text) {
  const s = String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '');
  return s;
}
function unitName(inst) { return (inst.prefix || 'ham') + '-' + inst.slug; }

function uniqueSlug(name, taken) {
  const base = slug(name);
  let s = base;
  for (let i = 2; taken.includes(s); i++) s = base + '-' + i;
  return s;
}

// Waits until the address answers with anything below 500. Resolves true or false.
function waitForHttp(url, { timeoutMs = 600000, everyMs = 3000, onTick } = {}) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        res.resume();
        if (res.statusCode < 500) resolve(true);
        else again();
      });
      req.on('error', again);
      req.on('timeout', () => { req.destroy(); });
    };
    const again = () => {
      if (Date.now() > end) { resolve(false); return; }
      if (onTick) onTick(Math.round((end - Date.now()) / 1000));
      setTimeout(tryOnce, everyMs);
    };
    tryOnce();
  });
}

// The first private IPv4 address of this computer, for links other devices can open.
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return null;
}

// Downloads a file with progress, following redirects.
function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) { reject(new Error('Too many redirects.')); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'ham-deploy-assistant' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Download failed with status ' + res.statusCode + ': ' + url)); return; }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      const tmp = dest + '.part';
      const file = fs.createWriteStream(tmp);
      res.on('data', (c) => { got += c.length; if (onProgress) onProgress(got, total); });
      res.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve(dest); }));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ham-deploy-assistant', Accept: 'application/vnd.github+json' } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { if (res.statusCode !== 200) reject(new Error('Request failed with status ' + res.statusCode)); else { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } } });
    }).on('error', reject);
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

// Finds a program on PATH or in the usual install folders.
function findProgram(names, extraDirs = []) {
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(extraDirs);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) for (const n of names) for (const e of exts) {
    const f = path.join(d, n + e);
    if (exists(f)) return f;
  }
  return null;
}

module.exports = { run, portFree, freePort, slug, uniqueSlug, namePrefix, unitName, waitForHttp, lanAddress, download, getJson, sha256File, stamp, exists, findProgram };
