'use strict';
// Chrome-style updates. On Windows the Squirrel installer updates itself in the background from
// the newest Deploy Assistant release and the app shows a "restart to update" banner; elsewhere
// the app tells you a new version is out and where to get it. Nothing is code-signed, and the
// banner says so. The self-test walks the same path step by step and says what it proved.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { getJson, download } = require('./util');

const REPO = 'Ding-Ding-Projects/home-assistant-material';
const API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=50';
const newer = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

function getText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) { reject(new Error('Too many redirects.')); return; }
    https.get(url, { headers: { 'User-Agent': 'ham-deploy-assistant' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve(getText(new URL(res.headers.location, url).toString(), redirects + 1)); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Status ' + res.statusCode + ' for ' + url)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 1e6) res.destroy(new Error('The answer is too large.')); });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function latest() {
  const list = await getJson(API);
  const r = list.find((x) => !x.draft && /^deploy-assistant-v/.test(x.tag_name));
  return r ? { version: r.tag_name.replace('deploy-assistant-v', ''), tag: r.tag_name, url: r.html_url, published: r.published_at, feed: 'https://github.com/' + REPO + '/releases/download/' + r.tag_name } : null;
}

// Squirrel's RELEASES file: one line per package, "SHA1 file-name size".
function parseReleases(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/^﻿/, '').trim()).filter(Boolean).map((l) => { const [sha1, file, size] = l.split(/\s+/); return { sha1: (sha1 || '').toLowerCase(), file, size: Number(size) }; })
    .filter((x) => /^[0-9a-f]{40}$/.test(x.sha1) && x.file && Number.isFinite(x.size));
}

function hashes(file) {
  return new Promise((resolve, reject) => {
    const s1 = crypto.createHash('sha1'); const s256 = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => { s1.update(c); s256.update(c); }).on('error', reject).on('end', () => resolve({ sha1: s1.digest('hex'), sha256: s256.digest('hex') }));
  });
}

// The record of applied updates: the version that last started, and each change between starts.
function ledger(dir) {
  const file = path.join(dir, 'updates.json');
  let db = { lastVersion: '', applied: [], tests: [] };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* first start */ }
  return { db, save: () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, file); } };
}

function start({ app, autoUpdater, send, dir }) {
  const L = ledger(dir);
  const now = app.getVersion();
  if (L.db.lastVersion && L.db.lastVersion !== now) {
    L.db.applied.unshift({ from: L.db.lastVersion, to: now, at: new Date().toISOString(), how: process.platform === 'win32' && app.isPackaged ? 'Squirrel update' : 'new install' });
    L.db.applied = L.db.applied.slice(0, 20);
    setTimeout(() => send('update', { state: 'applied', from: L.db.applied[0].from, version: now }), 4000);
  }
  L.db.lastVersion = now;
  L.save();
  let current = { state: 'current', version: now };
  const tell = (s) => { current = s; send('update', s); };
  const check = async () => {
    try {
      const l = await latest();
      if (!l || !newer(l.version, now)) { tell({ state: 'current', version: now }); return; }
      if (process.platform === 'win32' && app.isPackaged) {
        autoUpdater.setFeedURL({ url: l.feed });
        autoUpdater.once('update-downloaded', () => tell({ state: 'ready', version: l.version }));
        autoUpdater.once('error', (e) => tell({ state: 'failed', version: l.version, error: e.message }));
        tell({ state: 'downloading', version: l.version });
        autoUpdater.checkForUpdates();
      } else tell({ state: 'available', version: l.version, url: l.url });
    } catch (e) { tell({ state: 'offline', error: e.message }); }
  };
  setTimeout(check, 15000);
  setInterval(check, 4 * 3600 * 1000);

  // Walks the update path and reports each step as passed, skipped (with why) or failed.
  async function selfTest() {
    const steps = [];
    const step = (key, title) => { const s = { key, title, state: 'running', detail: '' }; steps.push(s); send('selftest', { steps }); return s; };
    const end = (s, state, detail) => { s.state = state; s.detail = detail; send('selftest', { steps }); };
    const work = path.join(dir, 'update-check');
    let rel = null; let entry = null;
    try {
      let s = step('reach', 'Reach the project releases');
      try { rel = await latest(); } catch (e) { end(s, 'failed', e.message); throw e; }
      if (!rel) { end(s, 'failed', 'No Deploy Assistant release was found.'); throw new Error('no release'); }
      end(s, 'passed', 'Newest release ' + rel.tag + (rel.published ? ', published ' + rel.published.slice(0, 10) : '') + '.');

      s = step('compare', 'Compare with this copy');
      end(s, 'passed', 'This copy is ' + now + '. ' + (newer(rel.version, now) ? 'Version ' + rel.version + ' is newer and would be installed.' : newer(now, rel.version) ? 'This copy is newer than the newest release (a development build).' : 'This is the newest version; the test checks the same release.'));

      s = step('feed', 'Read the update feed (RELEASES)');
      const list = parseReleases(await getText(rel.feed + '/RELEASES').catch((e) => { end(s, 'failed', e.message); throw e; }));
      entry = list.find((x) => /-full\.nupkg$/i.test(x.file) && x.file.includes(rel.version));
      if (!entry) { end(s, 'failed', 'RELEASES lists no full package for ' + rel.version + '.'); throw new Error('no package'); }
      end(s, 'passed', entry.file + ', ' + (entry.size / 1e6).toFixed(1) + ' MB, SHA-1 ' + entry.sha1.slice(0, 12) + '…');

      s = step('package', 'Download the package and check it');
      fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
      const file = path.join(work, entry.file);
      let shown = 0;
      await download(rel.feed + '/' + entry.file, file, (got, total) => { const f = total ? got / total : 0; if (f - shown >= 0.02) { shown = f; s.detail = Math.round(f * 100) + '% of ' + (total / 1e6).toFixed(1) + ' MB'; s.fraction = f; send('selftest', { steps }); } })
        .catch((e) => { end(s, 'failed', e.message); throw e; });
      const size = fs.statSync(file).size; const h = await hashes(file);
      let sums = '';
      try { sums = await getText(rel.feed + '/SHA256SUMS'); } catch { /* older releases have none */ }
      const line = sums.split('\n').find((l) => l.trim().endsWith(entry.file));
      const sha256ok = line ? line.trim().split(/\s+/)[0].toLowerCase() === h.sha256 : null;
      const ok = size === entry.size && h.sha1 === entry.sha1 && sha256ok !== false;
      end(s, ok ? 'passed' : 'failed', (size === entry.size ? 'Size matches' : 'Size differs (' + size + ' bytes)') + '; ' + (h.sha1 === entry.sha1 ? 'SHA-1 matches RELEASES' : 'SHA-1 does not match RELEASES') + '; ' + (sha256ok === null ? 'no SHA256SUMS line to compare' : sha256ok ? 'SHA-256 matches SHA256SUMS' : 'SHA-256 does not match SHA256SUMS') + '. Not code-signed; the check is by checksum only.');
      fs.rmSync(work, { recursive: true, force: true });
      if (!ok) throw new Error('package check');

      s = step('install', 'Let the installer stage it');
      if (process.platform !== 'win32') end(s, 'skipped', 'Only the Windows installer (Squirrel) updates itself. On this system, download the new version when the app says one is out.');
      else if (!app.isPackaged) end(s, 'skipped', 'This is a development run, not an installed copy, so Squirrel is not present.');
      else if (!newer(rel.version, now)) end(s, 'skipped', 'Nothing newer to stage. Publish a newer release and run the test again to see it staged.');
      else {
        await new Promise((resolve) => {
          const t = setTimeout(() => { end(s, 'failed', 'Squirrel did not finish within 10 minutes.'); resolve(); }, 600000);
          autoUpdater.once('update-downloaded', () => { clearTimeout(t); end(s, 'passed', 'Version ' + rel.version + ' is downloaded and staged. Restart to apply it.'); tell({ state: 'ready', version: rel.version }); resolve(); });
          autoUpdater.once('error', (e) => { clearTimeout(t); end(s, 'failed', e.message); resolve(); });
          autoUpdater.setFeedURL({ url: rel.feed }); autoUpdater.checkForUpdates();
        });
      }

      s = step('applied', 'Seen applied after a restart');
      const last = L.db.applied[0];
      if (last) end(s, 'passed', 'Updated from ' + last.from + ' to ' + last.to + ' (' + last.how + ') on ' + last.at.slice(0, 10) + '; this copy reports ' + now + '.');
      else end(s, 'skipped', 'No update has been applied to this copy yet. After a restart into a new version this step passes on its own.');
    } catch (e) { /* the failed step already says why */ }
    L.db.tests.unshift({ at: new Date().toISOString(), version: now, steps: steps.map((x) => ({ key: x.key, state: x.state, detail: x.detail })) });
    L.db.tests = L.db.tests.slice(0, 10);
    L.save();
    return { steps, current };
  }
  return { check, selfTest, history: () => ({ applied: L.db.applied, tests: L.db.tests, current }) };
}

module.exports = { start, newer, parseReleases };
