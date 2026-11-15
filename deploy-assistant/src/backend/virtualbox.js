'use strict';
// Target: a VirtualBox virtual machine running the Home Assistant Material operating system.
// The machine uses NAT with a forwarded port, so it is reachable at http://localhost:<port>.
const fs = require('node:fs');
const path = require('node:path');
const extract = require('extract-zip');
const { run, findProgram, waitForHttp, stamp, unitName, lanAddress } = require('./util');
const { fetchImage } = require('./images');
const { fail } = require('./backup-archive');
const checkAbort = (ctx) => { if (ctx.signal?.aborted) throw fail('cancelled'); };

function vbox() {
  return findProgram(['VBoxManage', 'vboxmanage'], ['C:\\Program Files\\Oracle\\VirtualBox', '/usr/bin', '/usr/local/bin', '/Applications/VirtualBox.app/Contents/MacOS']);
}
const V = (args, opts) => { const b = vbox(); if (!b) return Promise.resolve({ code: -1, out: '', err: 'VirtualBox is not installed.' }); return run(b, args, opts); };
const vm = (inst) => unitName(inst);

async function check() {
  const b = vbox();
  if (!b) return { ok: false, detail: 'VirtualBox is not installed.', fix: 'Install VirtualBox 7, then check again.', link: 'https://www.virtualbox.org/wiki/Downloads' };
  const r = await run(b, ['--version'], { timeout: 15000 });
  return r.code === 0 ? { ok: true, detail: 'VirtualBox ' + r.out.trim() } : { ok: false, detail: 'VirtualBox did not answer: ' + r.err.trim() };
}

function urls(inst) { const scheme = inst.restoreTransport ? 'https://' : 'http://'; const lan = inst.hostingJobId && inst.bindAddress ? scheme + inst.bindAddress + ':' + inst.port + '/' : null; return { url: scheme + '127.0.0.1:' + inst.port + '/', lanUrl: lan }; }

async function must(p, what) { const r = await p; if (r.code !== 0) throw new Error(what + ' failed. ' + (r.err || r.out).trim().split('\n').pop()); return r; }

async function deploy(inst, log, step, ctx) {
  step('image', 'Downloading the operating system image');
  const img = await fetchImage(/^haos_ova-.*\.vdi\.zip$/, ctx.cacheDir, log, (f) => step('image', 'Downloading the operating system image', f));
  checkAbort(ctx);
  let bootstrap;
  if (inst.hostingJobId) {
    if (typeof ctx.prepareBootstrap !== 'function') throw fail('bootstrap_helper_unavailable');
    bootstrap = await ctx.prepareBootstrap({ jobId: inst.hostingJobId, image: img, format: 'vdi' });
    checkAbort(ctx); inst.restoreTransport = bootstrap.transport;
  }
  step('config', 'Creating the virtual machine');
  fs.mkdirSync(inst.dir, { recursive: true });
  let vdi;
  if (bootstrap) vdi = bootstrap.image.file;
  else {
  await extract(img.file, { dir: inst.dir });
  checkAbort(ctx);
  const disk = fs.readdirSync(inst.dir).find((f) => f.endsWith('.vdi'));
  if (!disk) throw new Error('The image did not contain a .vdi disk.');
  vdi = path.join(inst.dir, vm(inst) + '.vdi');
  fs.renameSync(path.join(inst.dir, disk), vdi);
  await must(V(['internalcommands', 'sethduuid', vdi]), 'Giving the disk its own id');
  }
  checkAbort(ctx);
  await must(V(['createvm', '--name', vm(inst), '--ostype', 'Linux_64', '--register', '--basefolder', inst.dir]), 'Creating the virtual machine');
  if (inst.hostingJobId) { inst.bindAddress = lanAddress(); if (!inst.bindAddress) throw new Error('No private LAN address is available for this instance.'); }
  const guestPort = bootstrap ? 8123 : 80;
  await must(V(['modifyvm', vm(inst), '--firmware', 'efi', '--memory', String(inst.memoryMb || 4096), '--cpus', String(inst.cpus || 2), '--nic1', 'nat', '--natpf1', 'http,tcp,127.0.0.1,' + inst.port + ',,' + guestPort, ...(inst.hostingJobId ? ['--natpf1', 'http-lan,tcp,' + inst.bindAddress + ',' + inst.port + ',,' + guestPort] : []), '--audio-enabled', 'off', '--graphicscontroller', 'vmsvga']), 'Setting up the virtual machine');
  await must(V(['storagectl', vm(inst), '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci', '--portcount', '1']), 'Adding a disk controller');
  await must(V(['storageattach', vm(inst), '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', vdi]), 'Attaching the disk');
  if (inst.diskGb) await V(['modifymedium', 'disk', vdi, '--resize', String(inst.diskGb * 1024)]);
  checkAbort(ctx);
  step('start', 'Starting the virtual machine');
  await must(V(['startvm', vm(inst), '--type', 'headless']), 'Starting the virtual machine');
  if (bootstrap) {
    const { request } = require('./backup-restore');
    const base = 'https://127.0.0.1:' + inst.port + '/';
    const end = Date.now() + 25 * 60000;
    while (Date.now() < end) {
      checkAbort(ctx);
      try {
        const info = await request(base, '/api/onboarding/backup/info', { transport: inst.restoreTransport, signal: ctx.signal });
        if (Array.isArray(info.backups)) { inst.url = base; inst.lanUrl = 'https://' + inst.bindAddress + ':' + inst.port + '/'; return { url: inst.url, lanUrl: inst.lanUrl }; }
      } catch (error) { if (ctx.signal?.aborted) throw error; }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw fail('bootstrap_identity_unverified');
  }
  step('wait', 'Waiting for Home Assistant to answer (the first start takes several minutes)');
  const ok = await waitForHttp(urls(inst).url, { timeoutMs: 25 * 60000, everyMs: 5000, onTick: (s) => log('Not answering yet; waiting up to ' + s + ' more seconds.') });
  if (!ok) throw new Error('The virtual machine is running but Home Assistant did not answer within 25 minutes. Open it in VirtualBox to see its console.');
  return urls(inst);
}

async function status(inst) {
  const r = await V(['showvminfo', vm(inst), '--machinereadable'], { timeout: 15000 });
  if (r.code !== 0) return 'missing';
  const m = r.out.match(/VMState="([^"]+)"/);
  const s = m ? m[1] : '';
  return s === 'running' ? 'running' : /starting|restoring/.test(s) ? 'starting' : 'stopped';
}
const start = (inst) => V(['startvm', vm(inst), '--type', 'headless']);
const stop = (inst) => V(['controlvm', vm(inst), 'acpipowerbutton']);
async function restart(inst) { await V(['controlvm', vm(inst), 'reset']); return { code: 0 }; }
async function update() { return { code: 0, out: 'Update the operating system from Settings inside Home Assistant.' }; }
async function logs(inst, onLine) { const r = await V(['showvminfo', vm(inst), '--log', '0'], { timeout: 20000 }); r.out.split('\n').slice(-300).forEach(onLine); return r; }
async function stats() { return null; }

async function backup(inst) {
  const name = 'backup-' + stamp();
  await must(V(['snapshot', vm(inst), 'take', name, '--live', '--description', 'Made by Deploy Assistant']), 'Taking a snapshot');
  return { kind: 'snapshot', name };
}
async function restore(inst, b) {
  if ((await status(inst)) === 'running') { await V(['controlvm', vm(inst), 'poweroff']); }
  await must(V(['snapshot', vm(inst), 'restore', b.name]), 'Restoring the snapshot');
  await start(inst);
  return {};
}
async function deleteBackup(inst, b) { await must(V(['snapshot', vm(inst), 'delete', b.name]), 'Deleting the snapshot'); }
async function remove(inst, { keepData = false } = {}) {
  await V(['controlvm', vm(inst), 'poweroff']);
  await V(['unregistervm', vm(inst)].concat(keepData ? [] : ['--delete']));
  if (!keepData) fs.rmSync(inst.dir, { recursive: true, force: true });
}

module.exports = { id: 'virtualbox', check, deploy, status, stats, start, stop, restart, update, logs, backup, restore, deleteBackup, remove, urls };
