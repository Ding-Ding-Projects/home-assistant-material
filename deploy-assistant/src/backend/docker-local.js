'use strict';
// Target: Docker on this computer. Docker Desktop on Windows and macOS, Docker Engine on Linux.
const fs = require('node:fs');
const path = require('node:path');
const tar = require('tar');
const { run, waitForHttp, lanAddress, stamp } = require('./util');
const { composeYaml } = require('./compose');

const DOCKER = process.platform === 'win32' ? 'docker.exe' : 'docker';

async function check() {
  const v = await run(DOCKER, ['version', '--format', '{{.Server.Version}}'], { timeout: 20000 });
  if (v.code !== 0) {
    const missing = /not found|ENOENT|not recognized/i.test(v.err);
    return { ok: false, detail: missing ? 'Docker is not installed.' : 'Docker is installed but not running.', fix: missing ? 'Install Docker Desktop, then start it.' : 'Start Docker Desktop (or the Docker service), then check again.', link: 'https://docs.docker.com/get-started/get-docker/' };
  }
  const c = await run(DOCKER, ['compose', 'version', '--short'], { timeout: 20000 });
  if (c.code !== 0) return { ok: false, detail: 'Docker Compose is missing.', fix: 'Update Docker to a version that includes Compose v2.' };
  return { ok: true, detail: 'Docker ' + v.out.trim() + ', Compose ' + c.out.trim() };
}

const compose = (inst, args, opts = {}) => run(DOCKER, ['compose', '-f', path.join(inst.dir, 'compose.yaml')].concat(args), { cwd: inst.dir, ...opts });

function write(inst) {
  fs.mkdirSync(path.join(inst.dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(inst.dir, 'compose.yaml'), composeYaml({ slug: inst.slug, port: inst.port, tag: inst.tag, timezone: inst.timezone, memoryLimit: inst.memoryLimit }));
}

function urls(inst) {
  const lan = lanAddress();
  return { url: 'http://localhost:' + inst.port, lanUrl: lan ? 'http://' + lan + ':' + inst.port : null };
}

async function deploy(inst, log, step) {
  step('config', 'Writing the configuration');
  write(inst);
  log('Wrote ' + path.join(inst.dir, 'compose.yaml'));
  step('pull', 'Downloading the image');
  const p = await compose(inst, ['pull'], { onLine: log });
  if (p.code !== 0) throw new Error('Downloading the image failed. ' + p.err.trim().split('\n').pop());
  step('start', 'Starting the container');
  const u = await compose(inst, ['up', '-d'], { onLine: log });
  if (u.code !== 0) throw new Error('Starting the container failed. ' + u.err.trim().split('\n').pop());
  step('wait', 'Waiting for Home Assistant to answer');
  const ok = await waitForHttp(urls(inst).url, { timeoutMs: 10 * 60000, onTick: (s) => log('Not answering yet; waiting up to ' + s + ' more seconds.') });
  if (!ok) throw new Error('The container started but Home Assistant did not answer within 10 minutes. Open Logs to see why.');
  return urls(inst);
}

async function status(inst) {
  const r = await run(DOCKER, ['inspect', '-f', '{{.State.Status}}', 'ham-' + inst.slug], { timeout: 15000 });
  if (r.code !== 0) return 'missing';
  const s = r.out.trim();
  return s === 'running' ? 'running' : s === 'restarting' ? 'starting' : 'stopped';
}

async function stats(inst) {
  const r = await run(DOCKER, ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', 'ham-' + inst.slug], { timeout: 15000 });
  if (r.code !== 0) return null;
  const [cpu, mem] = r.out.trim().split('|');
  return { cpu: parseFloat(cpu) || 0, mem: (mem || '').split('/')[0].trim() };
}

const start = (inst) => compose(inst, ['up', '-d']);
const stop = (inst) => compose(inst, ['stop']);
const restart = (inst) => compose(inst, ['restart']);
async function update(inst, log) { write(inst); await compose(inst, ['pull'], { onLine: log }); return compose(inst, ['up', '-d'], { onLine: log }); }
function logs(inst, onLine) { return compose(inst, ['logs', '--tail', '300', '--no-color'], { onLine, timeout: 20000 }); }

async function backup(inst, destDir, { consistent = true } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, inst.slug + '-' + stamp() + '.tar.gz');
  const wasRunning = (await status(inst)) === 'running';
  if (consistent && wasRunning) await stop(inst);
  try { await tar.c({ gzip: true, file, cwd: inst.dir }, ['config']); } finally { if (consistent && wasRunning) await start(inst); }
  return { kind: 'file', file, size: fs.statSync(file).size };
}

async function restore(inst, b) {
  await stop(inst);
  const cfg = path.join(inst.dir, 'config');
  const keep = path.join(inst.dir, 'config.before-restore-' + stamp());
  if (fs.existsSync(cfg)) fs.renameSync(cfg, keep);
  await tar.x({ file: b.file, cwd: inst.dir });
  await start(inst);
  return { kept: keep };
}

async function deleteBackup(inst, b) { fs.rmSync(b.file, { force: true }); }

async function remove(inst, { keepData = false } = {}) {
  await compose(inst, ['down']);
  if (!keepData) fs.rmSync(inst.dir, { recursive: true, force: true });
}

module.exports = { id: 'docker', check, deploy, status, stats, start, stop, restart, update, logs, backup, restore, deleteBackup, remove, urls, write };
