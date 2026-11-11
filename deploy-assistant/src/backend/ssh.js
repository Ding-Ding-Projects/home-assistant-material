'use strict';
// Target: a Linux host reached over SSH that has Docker. The app writes the Compose file there,
// starts it, and streams backups back to this computer.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('ssh2');
const { composeYaml } = require('./compose');
const { waitForHttp, stamp } = require('./util');

function connect(host) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    const cfg = { host: host.address, port: host.port || 22, username: host.user, readyTimeout: 20000, keepaliveInterval: 15000 };
    if (host.keyFile) cfg.privateKey = fs.readFileSync(host.keyFile);
    if (host.passphrase) cfg.passphrase = host.passphrase;
    if (host.password) cfg.password = host.password;
    if (!host.keyFile && !host.password && process.env.SSH_AUTH_SOCK) cfg.agent = process.env.SSH_AUTH_SOCK;
    if (!host.keyFile && !host.password && process.platform === 'win32') cfg.agent = '\\\\.\\pipe\\openssh-ssh-agent';
    c.on('ready', () => resolve(c)).on('error', (e) => reject(new Error('Could not connect to ' + host.address + ': ' + e.message))).connect(cfg);
  });
}

function exec(c, cmd, { onLine, input } = {}) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      let out = '';
      let errOut = '';
      stream.on('data', (d) => { out += d; if (onLine) String(d).split(/\r?\n/).filter(Boolean).forEach(onLine); });
      stream.stderr.on('data', (d) => { errOut += d; if (onLine) String(d).split(/\r?\n/).filter(Boolean).forEach(onLine); });
      stream.on('close', (code) => resolve({ code, out, err: errOut }));
      if (input) input.pipe(stream); else stream.end();
    });
  });
}

const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const remoteDir = (inst) => '$HOME/home-assistant-material/' + inst.slug;

async function withHost(inst, fn) {
  const c = await connect(inst.host);
  try { return await fn(c); } finally { c.end(); }
}

async function check(host) {
  if (!host) return { ok: true, detail: 'Choose or add a host when you deploy.' };
  return withHost({ host }, async (c) => {
    const r = await exec(c, 'docker compose version --short 2>&1 && docker info --format {{.ServerVersion}} 2>&1');
    if (r.code !== 0) return { ok: false, detail: 'Connected, but Docker with Compose is not ready on ' + host.address + '.', fix: 'Install Docker Engine on the host and add ' + host.user + ' to the docker group.', link: 'https://docs.docker.com/engine/install/' };
    return { ok: true, detail: 'Connected. Docker ' + r.out.trim().split('\n').pop() + ' on ' + host.address };
  });
}

function urls(inst) { return { url: 'http://' + inst.host.address + ':' + inst.port, lanUrl: null }; }

async function deploy(inst, log, step) {
  return withHost(inst, async (c) => {
    step('config', 'Writing the configuration on ' + inst.host.address);
    const yaml = composeYaml({ slug: inst.slug, port: inst.port, tag: inst.tag, timezone: inst.timezone, memoryLimit: inst.memoryLimit });
    const mk = await exec(c, 'mkdir -p ' + remoteDir(inst) + '/config && cat > ' + remoteDir(inst) + '/compose.yaml', { input: require('node:stream').Readable.from([yaml]) });
    if (mk.code !== 0) throw new Error('Could not write the configuration on the host. ' + mk.err.trim());
    const used = await exec(c, '(ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -E ":' + inst.port + '\\b" | head -1');
    if (used.out.trim()) throw new Error('Port ' + inst.port + ' is already in use on the host. Choose another port.');
    step('pull', 'Downloading the image on the host');
    const p = await exec(c, 'cd ' + remoteDir(inst) + ' && docker compose pull', { onLine: log });
    if (p.code !== 0) throw new Error('Downloading the image on the host failed. ' + p.err.trim().split('\n').pop());
    step('start', 'Starting the container on the host');
    const u = await exec(c, 'cd ' + remoteDir(inst) + ' && docker compose up -d', { onLine: log });
    if (u.code !== 0) throw new Error('Starting the container failed. ' + u.err.trim().split('\n').pop());
    step('wait', 'Waiting for Home Assistant to answer');
    const ok = await waitForHttp(urls(inst).url, { timeoutMs: 10 * 60000, onTick: (s) => log('Not answering yet; waiting up to ' + s + ' more seconds.') });
    if (!ok) throw new Error('The container started but ' + urls(inst).url + ' did not answer within 10 minutes. A firewall on the host may block port ' + inst.port + '.');
    return urls(inst);
  });
}

const dc = (inst, args, opts) => withHost(inst, (c) => exec(c, 'cd ' + remoteDir(inst) + ' && docker compose ' + args, opts));
async function status(inst) {
  try { const r = await withHost(inst, (c) => exec(c, 'docker inspect -f {{.State.Status}} ham-' + inst.slug)); if (r.code !== 0) return 'missing'; const s = r.out.trim(); return s === 'running' ? 'running' : s === 'restarting' ? 'starting' : 'stopped'; } catch { return 'unreachable'; }
}
async function stats(inst) {
  try { const r = await withHost(inst, (c) => exec(c, "docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}' ham-" + inst.slug)); if (r.code !== 0) return null; const [cpu, mem] = r.out.trim().split('|'); return { cpu: parseFloat(cpu) || 0, mem: (mem || '').split('/')[0].trim() }; } catch { return null; }
}
const start = (inst) => dc(inst, 'up -d');
const stop = (inst) => dc(inst, 'stop');
const restart = (inst) => dc(inst, 'restart');
const update = (inst, log) => dc(inst, 'pull && docker compose up -d', { onLine: log });
const logs = (inst, onLine) => dc(inst, 'logs --tail 300 --no-color', { onLine });

async function backup(inst, destDir, { consistent = true } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, inst.slug + '-' + stamp() + '.tar.gz');
  await withHost(inst, (c) => new Promise((resolve, reject) => {
    const pre = consistent ? 'docker compose stop >/dev/null 2>&1; ' : '';
    const post = consistent ? '; docker compose up -d >/dev/null 2>&1' : '';
    c.exec('cd ' + remoteDir(inst) + ' && ' + pre + 'tar czf - config' + post, (err, stream) => {
      if (err) { reject(err); return; }
      const out = fs.createWriteStream(file);
      stream.pipe(out);
      stream.on('close', (code) => { out.close(); if (code && code !== 0) reject(new Error('The backup stopped on the host with code ' + code + '.')); else resolve(); });
    });
  }));
  return { kind: 'file', file, size: fs.statSync(file).size };
}

async function restore(inst, b) {
  const keep = 'config.before-restore-' + stamp();
  const r = await withHost(inst, (c) => exec(c, 'cd ' + remoteDir(inst) + ' && docker compose stop && mv config ' + q(keep) + ' && tar xzf - && docker compose up -d', { input: fs.createReadStream(b.file) }));
  if (r.code !== 0) throw new Error('Restoring on the host failed. ' + r.err.trim());
  return { kept: keep + ' on the host' };
}
async function deleteBackup(inst, b) { fs.rmSync(b.file, { force: true }); }
async function remove(inst, { keepData = false } = {}) {
  await withHost(inst, (c) => exec(c, 'cd ' + remoteDir(inst) + ' && docker compose down' + (keepData ? '' : ' && cd .. && rm -rf ' + q(inst.slug))));
}

module.exports = { id: 'ssh', check, deploy, status, stats, start, stop, restart, update, logs, backup, restore, deleteBackup, remove, urls, connect, exec };
