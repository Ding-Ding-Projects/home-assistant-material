'use strict';
// Local Ollama manager. It talks only to Ollama's documented HTTP API on 127.0.0.1:11434 and to
// ollama.com for the public model library. It can install Ollama into this app's own folder from
// the official GitHub release (checked against the release's SHA-256) and run it as a process the
// app owns, or use an Ollama that is already running.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { run, getJson, download } = require('./util');

const HOST = '127.0.0.1'; const PORT = 11434;

function api(method, p, body, { timeout = 15000, onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: HOST, port: PORT, path: p, method, timeout, signal, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = ''; let all = ''; res.setEncoding('utf8');
      res.on('data', (c) => { if (onLine) { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { try { onLine(JSON.parse(l)); } catch { /* a partial line */ } } } } else { all += c; if (all.length > 32 * 1024 * 1024) res.destroy(new Error('The answer is too large.')); } });
      res.on('end', () => { if (res.statusCode >= 400) { let m = all; try { m = JSON.parse(all).error; } catch { /* plain text */ } reject(new Error(m || 'Ollama answered ' + res.statusCode)); return; } if (onLine) { if (buf.trim()) try { onLine(JSON.parse(buf)); } catch { /* ignore */ } resolve(true); } else { try { resolve(all ? JSON.parse(all) : {}); } catch { resolve(all); } } });
    });
    req.on('timeout', () => req.destroy(new Error('Ollama did not answer in time.')));
    req.on('error', (e) => reject(e.code === 'ECONNREFUSED' ? new Error('Ollama is not running.') : e));
    if (data) req.write(data); req.end();
  });
}
function page(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ham-deploy-assistant', Accept: 'text/html' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve(page(new URL(res.headers.location, url).toString())); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('ollama.com answered ' + res.statusCode)); return; }
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; if (b.length > 8e6) res.destroy(new Error('Too large.')); }); res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}
const strip = (s) => String(s || '').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const SIZE = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
function parseSize(s) { const m = /([\d.]+)\s*(KB|MB|GB|TB)\b/i.exec(s || ''); return m ? Math.round(parseFloat(m[1]) * SIZE[m[2].toUpperCase()]) : 0; }

// The library page lists every public model; each model's tags page lists every tag with its size.
function parseLibrary(html) {
  const out = []; const items = String(html).split(/<li\s[^>]*class="flex items-baseline/).slice(1);
  for (const raw of items) {
    const b = raw.split('</li>')[0]; const name = (/href="\/library\/([\w.\-]+)"/.exec(b) || [])[1]; if (!name) continue;
    const desc = strip((/<p class="max-w-lg[^"]*">([\s\S]*?)<\/p>/.exec(b) || [])[1]);
    const badge = (re) => { const o = []; let m; while ((m = re.exec(b))) o.push(strip(m[1])); return o; };
    const caps = badge(/<span\s+class="[^"]*bg-indigo-50[^"]*">([\s\S]*?)<\/span>/g);
    const sizes = badge(/<span\s+class="[^"]*bg-\[#ddf4ff\][^"]*">([\s\S]*?)<\/span>/g);
    const meta = strip((/<p class="flex space-x-5[^"]*">([\s\S]*?)<\/p>/.exec(b) || [])[1]).replace(/\u00a0/g, ' ');
    const pulls = (/([\d.,]+[KMB]?) Pulls/i.exec(meta) || [])[1] || ''; const tagCount = +((/(\d+) Tags/i.exec(meta) || [])[1] || 0); const updated = (/Updated (.+)$/i.exec(meta) || [])[1] || '';
    out.push({ name, description: desc, capabilities: caps, sizes, pulls, tagCount, updated });
  }
  return out;
}
function parseTags(html, model) {
  const out = []; const seen = new Set(); const re = new RegExp('href="/library/' + model.replace(/[.\-]/g, '\\$&') + ':([\\w.\\-]+)"', 'g'); let m;
  while ((m = re.exec(html))) {
    const tag = m[1]; if (seen.has(tag)) continue; seen.add(tag);
    const around = html.slice(m.index, m.index + 1500); const t = strip(around);
    const size = parseSize(t); const ctx = (/(\d+K) context/i.exec(t) || [])[1] || ''; const input = (/(Text|Image)(?:, (Text|Image))* input/i.exec(t) || [''])[0];
    const digest = (/\b([0-9a-f]{12})\b/.exec(t) || [])[1] || '';
    out.push({ tag, name: model + ':' + tag, size, context: ctx, input, digest });
  }
  return out;
}

class Ollama extends EventEmitter {
  constructor(mgr) { super(); this.m = mgr; this.dir = path.join(mgr.dir, 'ollama'); fs.mkdirSync(this.dir, { recursive: true }); this.db = mgr.db.ollama = mgr.db.ollama || { install: null, catalog: null, tags: {}, cart: [], parallel: 1 }; this.proc = null; this.pulls = new Map();
    this.on('pull', (p) => { const it = (this.db.cart || []).find((x) => x.name === p.name); if (it && p.done) { it.state = p.status; this.m.save(); } }); }

  // ---------- Runtime ----------
  async health() {
    try { const v = await api('GET', '/api/version', null, { timeout: 2500 }); return { running: true, version: v.version, owned: !!this.proc, install: this.db.install }; }
    catch (e) { return { running: false, error: e.message, owned: false, install: this.db.install }; }
  }
  binary() { const i = this.db.install; if (!i) return null; const f = path.join(i.dir, process.platform === 'win32' ? 'ollama.exe' : process.platform === 'darwin' ? 'Ollama.app/Contents/Resources/ollama' : 'bin/ollama'); return fs.existsSync(f) ? f : null; }
  // Installs the official build from the newest GitHub release into this app's own versioned folder.
  async install() {
    const rel = await getJson('https://api.github.com/repos/ollama/ollama/releases/latest');
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const want = process.platform === 'win32' ? 'ollama-windows-' + arch + '.zip' : process.platform === 'darwin' ? 'Ollama-darwin.zip' : 'ollama-linux-' + arch + '.tgz';
    const a = rel.assets.find((x) => x.name === want); if (!a) throw new Error('The release ' + rel.tag_name + ' has no ' + want + '.');
    const sha = (a.digest || '').replace(/^sha256:/, ''); if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('The release does not publish a SHA-256 for ' + want + ', so it was not installed.');
    const free = fs.statfsSync(this.dir); if (free.bavail * free.bsize < a.size * 3) throw new Error('Not enough free space: about ' + Math.round(a.size * 3 / 1e9) + ' GB is needed.');
    const tmp = path.join(this.dir, want + '.download');
    await download(a.browser_download_url, tmp, (got, total) => this.emit('install', { text: 'Downloading Ollama ' + rel.tag_name, fraction: total ? got / total : 0 }));
    const h = crypto.createHash('sha256'); await new Promise((r, j) => fs.createReadStream(tmp).on('data', (c) => h.update(c)).on('end', r).on('error', j));
    if (h.digest('hex') !== sha) { fs.rmSync(tmp, { force: true }); throw new Error('The download does not match the SHA-256 the release publishes. Nothing was installed.'); }
    const dest = path.join(this.dir, rel.tag_name); fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
    this.emit('install', { text: 'Unpacking', fraction: 1 });
    const r = /\.tgz$/.test(want) ? await run('tar', ['xzf', tmp, '-C', dest]) : process.platform === 'win32' ? await run('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath ' + JSON.stringify(tmp) + ' -DestinationPath ' + JSON.stringify(dest) + ' -Force']) : await run('ditto', ['-x', '-k', tmp, dest]);
    fs.rmSync(tmp, { force: true }); if (r.code) throw new Error('Unpacking failed: ' + (r.err || '').trim());
    this.db.install = { version: rel.tag_name, dir: dest, sha256: sha, asset: want, at: new Date().toISOString() }; this.m.save();
    if (!this.binary()) throw new Error('The unpacked release has no ollama program where it should be.');
    return this.db.install;
  }
  async start() {
    if ((await this.health()).running) return 'Ollama is already running' + (this.proc ? '' : ', started outside this app') + '.';
    const bin = this.binary(); if (!bin) throw new Error('Ollama is not installed by this app. Install it first.');
    const env = Object.assign({}, process.env, { OLLAMA_HOST: HOST + ':' + PORT });
    this.proc = spawn(bin, ['serve'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => this.emit('log', l)); this.proc.stdout.on('data', log); this.proc.stderr.on('data', log);
    this.proc.on('exit', () => { this.proc = null; this.emit('state', 'stopped'); });
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); const h = await this.health(); if (h.running) { this.emit('state', 'running'); return 'Ollama ' + h.version + ' is running.'; } }
    throw new Error('Ollama did not answer within 20 seconds.');
  }
  async stop() {
    if (!this.proc) throw new Error('This app did not start the running Ollama, so it does not stop it.');
    const p = this.proc; p.kill(); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } r(); }, 8000); p.once('exit', () => { clearTimeout(t); r(); }); });
    return 'Stopped.';
  }

  // ---------- Models ----------
  async installed() { const t = await api('GET', '/api/tags'); const ps = await api('GET', '/api/ps').catch(() => ({ models: [] })); const running = new Map((ps.models || []).map((m) => [m.name, m])); return (t.models || []).map((m) => ({ name: m.name, size: m.size, digest: m.digest, modified: m.modified_at, family: m.details && m.details.family, parameters: m.details && m.details.parameter_size, quantization: m.details && m.details.quantization_level, running: running.has(m.name), vram: running.has(m.name) ? running.get(m.name).size_vram : 0, expires: running.has(m.name) ? running.get(m.name).expires_at : '' })); }
  async show(name) { const r = await api('POST', '/api/show', { model: name }); return { capabilities: r.capabilities || [], parameters: r.parameters || '', template: (r.template || '').slice(0, 4000), license: (r.license || '').slice(0, 4000), details: r.details || {}, info: Object.fromEntries(Object.entries(r.model_info || {}).filter(([k]) => /context_length|parameter_count|embedding_length|block_count|head_count/.test(k))) }; }
  async remove(name) { await api('DELETE', '/api/delete', { model: name }); return 'Deleted ' + name + '.'; }
  async copy(from, to) { if (!/^[\w.\-/]+(:[\w.\-]+)?$/.test(to)) throw new Error('A model name is letters, digits, dots and dashes, with an optional :tag.'); await api('POST', '/api/copy', { source: from, destination: to }); return 'Copied to ' + to + '.'; }
  async unload(name) { await api('POST', '/api/generate', { model: name, keep_alive: 0 }); return 'Unloaded ' + name + ' from memory.'; }
  pull(name) {
    if (!/^[\w.\-/]+(:[\w.\-]+)?$/.test(name)) throw new Error('That is not a model name.');
    if (this.pulls.has(name)) return 'already';
    const ac = new AbortController(); const st = { name, status: 'starting', completed: 0, total: 0, started: Date.now() }; this.pulls.set(name, { ac, st });
    api('POST', '/api/pull', { model: name, stream: true }, { timeout: 0, signal: ac.signal, onLine: (j) => { if (j.error) { st.status = 'failed'; st.error = j.error; } else { st.status = j.status; if (j.total) { st.total = j.total; st.completed = j.completed || 0; } } this.emit('pull', Object.assign({}, st)); } })
      .then(() => { if (st.status !== 'failed') st.status = 'success'; this.emit('pull', Object.assign({}, st, { done: true })); }, (e) => { st.status = ac.signal.aborted ? 'cancelled' : 'failed'; st.error = e.message; this.emit('pull', Object.assign({}, st, { done: true })); })
      .finally(() => { this.pulls.delete(name); this.drainCart(); });
    return 'started';
  }
  cancel(name) { const p = this.pulls.get(name); if (p) p.ac.abort(); return !!p; }
  setCart(items, parallel) { this.db.cart = items.map((n) => ({ name: n, state: 'queued' })); this.db.parallel = Math.max(1, Math.min(4, Number(parallel) || 1)); this.m.save(); this.drainCart(); return this.db.cart; }
  drainCart() { const c = this.db.cart || []; const busy = () => [...this.pulls.keys()].filter((k) => !/^chat:/.test(k)).length; for (const it of c) { if (it.state === 'queued' && busy() < this.db.parallel) { it.state = 'pulling'; this.pull(it.name); } } }

  // ---------- Chat ----------
  chat(id, model, messages, options) {
    const ac = new AbortController(); this.pulls.set('chat:' + id, { ac });
    api('POST', '/api/chat', { model, messages: messages.slice(-50).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: String(m.content).slice(0, 200000) })), stream: true, options: options || {} }, { timeout: 0, signal: ac.signal, onLine: (j) => this.emit('chat', { id, delta: j.message ? j.message.content : '', done: !!j.done, stats: j.done ? { tokens: j.eval_count, seconds: (j.eval_duration || 0) / 1e9 } : null, error: j.error }) })
      .catch((e) => this.emit('chat', { id, done: true, error: ac.signal.aborted ? 'Stopped.' : e.message }))
      .finally(() => this.pulls.delete('chat:' + id));
    return true;
  }
  stopChat(id) { return this.cancel('chat:' + id); }

  // ---------- Model library from ollama.com ----------
  async library(force) {
    const c = this.db.catalog; if (!force && c && Date.now() - Date.parse(c.at) < 24 * 3600e3) return c;
    const html = await page('https://ollama.com/library?sort=popular'); const models = parseLibrary(html);
    if (!models.length) throw new Error('The library page could not be read; its layout may have changed. The last good copy is kept.');
    this.db.catalog = { at: new Date().toISOString(), source: 'https://ollama.com/library', pages: 1, count: models.length, complete: 'Every model the library page lists at this time', models }; this.m.save(); return this.db.catalog;
  }
  async tags(model, force) {
    if (!/^[\w.\-]+$/.test(model)) throw new Error('That is not a library model name.');
    const c = this.db.tags[model]; if (!force && c && Date.now() - Date.parse(c.at) < 24 * 3600e3) return c;
    const tags = parseTags(await page('https://ollama.com/library/' + model + '/tags'), model); this.db.tags[model] = { at: new Date().toISOString(), tags }; this.m.save(); return this.db.tags[model];
  }

  // ---------- Hardware fit ----------
  async hardware() {
    const ram = os.totalmem(); let gpus = [];
    try {
      if (process.platform === 'win32') { const r = await run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json']); const j = JSON.parse(r.out || '[]'); gpus = [].concat(j).map((g) => ({ name: g.Name, vram: g.AdapterRAM > 0 ? g.AdapterRAM : 0, note: 'Windows reports at most 4 GB for some cards' })); }
      else if (process.platform === 'darwin') gpus = [{ name: 'Apple silicon (shared memory)', vram: Math.round(ram * 0.66), note: 'About two thirds of memory can go to the graphics processor' }];
      else { const r = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']).catch(() => ({ code: 1 })); if (r.code === 0) gpus = r.out.trim().split('\n').map((l) => { const [n, m] = l.split(','); return { name: n.trim(), vram: Number(m) * 1048576 }; }); }
    } catch { gpus = []; }
    let free = 0; try { const s = fs.statfsSync(this.dir); free = s.bavail * s.bsize; } catch { free = 0; }
    return { ram, gpus, free, cpus: os.cpus().length, arch: process.arch, at: new Date().toISOString() };
  }
}

// A careful verdict: the weights plus about a fifth for the context must fit in graphics memory to
// run well, or in graphics plus system memory to run with limits.
function fit(size, hw) {
  if (!size) return { verdict: 'Unknown', why: 'The library gives no size for this tag.' };
  const need = size * 1.2; const vram = Math.max(0, ...hw.gpus.map((g) => g.vram || 0)); const disk = hw.free;
  if (disk && size > disk) return { verdict: 'Unlikely', why: 'It needs ' + (size / 1e9).toFixed(1) + ' GB of disk; ' + (disk / 1e9).toFixed(1) + ' GB is free.' };
  if (vram && need <= vram) return { verdict: 'Runs well', why: 'About ' + (need / 1e9).toFixed(1) + ' GB with its context fits in ' + (vram / 1e9).toFixed(1) + ' GB of graphics memory.' };
  if (need <= vram + hw.ram * 0.7) return { verdict: 'Runs with limits', why: 'About ' + (need / 1e9).toFixed(1) + ' GB is more than graphics memory (' + (vram / 1e9).toFixed(1) + ' GB) but fits with system memory (' + (hw.ram / 1e9).toFixed(1) + ' GB); expect slower answers.' };
  return { verdict: 'Unlikely', why: 'About ' + (need / 1e9).toFixed(1) + ' GB is more than this computer\'s memory can hold.' };
}

module.exports = { Ollama, parseLibrary, parseTags, parseSize, fit };
