'use strict';
// Target: a VMware Workstation (or Fusion) virtual machine running the operating system image.
// It joins VMware's NAT network; the app reads its address from VMware Tools and gives that link.
const fs = require('node:fs');
const path = require('node:path');
const { run, findProgram, waitForHttp, stamp, unitName } = require('./util');
const { fetchImage } = require('./images');
const { verifyCandidate } = require('./backup-bootstrap');

const DIRS = ['C:\\Program Files (x86)\\VMware\\VMware Workstation', 'C:\\Program Files\\VMware\\VMware Workstation', 'C:\\Program Files (x86)\\VMware\\VMware Workstation\\OVFTool', 'C:\\Program Files\\VMware\\VMware Workstation\\OVFTool', '/usr/bin', '/usr/lib/vmware-ovftool', '/Applications/VMware Fusion.app/Contents/Library', '/Applications/VMware Fusion.app/Contents/Library/VMware OVF Tool'];
const vmrun = () => findProgram(['vmrun'], DIRS);
const ovftool = () => findProgram(['ovftool'], DIRS);
const kind = () => (process.platform === 'darwin' ? 'fusion' : 'ws');
const vmx = (inst) => path.join(inst.dir, unitName(inst), unitName(inst) + '.vmx');
const R = (args, opts) => { const b = vmrun(); if (!b) return Promise.resolve({ code: -1, out: '', err: 'VMware is not installed.' }); return run(b, ['-T', kind()].concat(args), opts); };

async function check() {
  if (!vmrun()) return { ok: false, detail: 'VMware Workstation (or Fusion) is not installed.', fix: 'Install VMware Workstation Pro, which is free for personal use, then check again.', link: 'https://www.vmware.com/products/desktop-hypervisor/workstation-and-fusion' };
  if (!ovftool()) return { ok: false, detail: 'VMware OVF Tool was not found.', fix: 'Reinstall VMware Workstation with OVF Tool included.' };
  return { ok: true, detail: 'VMware ' + (kind() === 'ws' ? 'Workstation' : 'Fusion') + ' with OVF Tool' };
}

async function must(p, what) { const r = await p; if (r.code !== 0) throw new Error(what + ' failed. ' + (r.err || r.out).trim().split('\n').pop()); return r; }

async function guestIp(inst, waitSec = 600) {
  const r = await R(['getGuestIPAddress', vmx(inst), '-wait'], { timeout: waitSec * 1000 });
  const ip = r.out.trim();
  return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
}
function urls(inst) { const url = inst.hostingJobId ? (inst.url || (inst.restoreTransport && inst.ip ? 'https://' + inst.ip + ':8123/' : null)) : (inst.ip ? 'http://' + inst.ip + '/' : null); return { url, lanUrl: inst.hostingJobId ? url : null }; }
async function address(inst) { return guestIp(inst, 30); }

async function deploy(inst, log, step, ctx) {
  const checkCancelled = () => { if (ctx.signal?.aborted) throw Object.assign(new Error('Appliance deployment was cancelled.'), { code: 'hosting_cancelled' }); };
  checkCancelled();
  step('image', 'Downloading the operating system image');
  const img = await fetchImage(/^haos_ova-.*\.ova$/, ctx.cacheDir, log, (f) => step('image', 'Downloading the operating system image', f));
  checkCancelled();
  let bootstrap;
  if (inst.hostingJobId) {
    if (typeof ctx.prepareBootstrap !== 'function') throw new Error('Secure appliance preparation is unavailable. No backup was transmitted.');
    step('bootstrap', 'Preparing a private, certificate-bound appliance image');
    bootstrap = await ctx.prepareBootstrap({ jobId: inst.hostingJobId, image: img, format: 'vmdk' });
    checkCancelled();
    inst.restoreTransport = bootstrap.transport;
  }
  step('config', 'Creating the virtual machine');
  fs.mkdirSync(inst.dir, { recursive: true });
  await must(run(ovftool(), ['--acceptAllEulas', '--skipManifestCheck', '--name=' + unitName(inst), '--allowExtraConfig', img.file, inst.dir], { onLine: log, timeout: 30 * 60000 }), 'Importing the image');
  checkCancelled();
  let text = fs.readFileSync(vmx(inst), 'utf8');
  const set = (k, v) => { const re = new RegExp('^' + k.replace(/\./g, '\\.') + '\\s*=.*$', 'm'); text = re.test(text) ? text.replace(re, k + ' = "' + v + '"') : text + '\n' + k + ' = "' + v + '"'; };
  set('memsize', String(inst.memoryMb || 4096));
  set('numvcpus', String(inst.cpus || 2));
  set('ethernet0.connectionType', inst.hostingJobId ? 'bridged' : 'nat');
  set('firmware', 'efi');
  if (bootstrap) {
    const disks = [...text.matchAll(/^((?:scsi|sata|ide|nvme)\d+:\d+\.fileName)\s*=\s*"[^"\r\n]+\.vmdk"\s*$/gm)];
    if (disks.length !== 1) throw new Error('The appliance must contain exactly one boot disk.');
    const disk = path.resolve(bootstrap.image.file).replace(/\\/g, '/');
    if (/["\r\n]/.test(disk)) throw new Error('Invalid prepared appliance path.');
    set(disks[0][1], disk);
  }
  fs.writeFileSync(vmx(inst), text);
  step('start', 'Starting the virtual machine');
  checkCancelled();
  await must(R(['start', vmx(inst), 'nogui']), 'Starting the virtual machine');
  checkCancelled();
  step('wait', 'Waiting for the virtual machine to get an address');
  inst.ip = await guestIp(inst, 900);
  checkCancelled();
  if (!inst.ip) throw new Error('The virtual machine started but did not report an address within 15 minutes. Open it in VMware to see its console.');
  log('The virtual machine has the address ' + inst.ip);
  if (bootstrap) {
    step('wait', 'Waiting for this appliance to present its own TLS certificate');
    const end = Date.now() + 25 * 60000;
    while (Date.now() < end) {
      checkCancelled();
      const verified = await verifyCandidate(inst.ip, inst.restoreTransport);
      checkCancelled();
      if (verified) { inst.url = verified; inst.lanUrl = verified; return urls(inst); }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('The appliance did not present its expected TLS identity. No backup was transmitted.');
  }
  step('wait', 'Waiting for Home Assistant to answer (the first start takes several minutes)');
  const ok = await waitForHttp(urls(inst).url, { timeoutMs: 25 * 60000, everyMs: 5000, onTick: (s) => log('Not answering yet; waiting up to ' + s + ' more seconds.') });
  if (!ok) throw new Error('Home Assistant did not answer at ' + urls(inst).url + ' within 25 minutes.');
  return urls(inst);
}

async function status(inst) {
  if (!fs.existsSync(vmx(inst))) return 'missing';
  const r = await R(['list'], { timeout: 15000 });
  return r.out.toLowerCase().includes(vmx(inst).toLowerCase()) ? 'running' : 'stopped';
}
async function start(inst) { const r = await R(['start', vmx(inst), 'nogui']); inst.ip = (await guestIp(inst, 300)) || inst.ip; return r; }
const stop = (inst) => R(['stop', vmx(inst), 'soft']);
const restart = (inst) => R(['reset', vmx(inst), 'soft']);
async function update() { return { code: 0, out: 'Update the operating system from Settings inside Home Assistant.' }; }
async function logs(inst, onLine) { const f = path.join(path.dirname(vmx(inst)), 'vmware.log'); const t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'No log yet.'; t.split('\n').slice(-300).forEach(onLine); return { code: 0 }; }
async function stats() { return null; }
async function backup(inst) { const name = 'backup-' + stamp(); await must(R(['snapshot', vmx(inst), name]), 'Taking a snapshot'); return { kind: 'snapshot', name }; }
async function restore(inst, b) { await must(R(['revertToSnapshot', vmx(inst), b.name]), 'Restoring the snapshot'); await start(inst); return {}; }
async function deleteBackup(inst, b) { await must(R(['deleteSnapshot', vmx(inst), b.name]), 'Deleting the snapshot'); }
async function remove(inst, { keepData = false } = {}) {
  await R(['stop', vmx(inst), 'hard']);
  if (!keepData) { await R(['deleteVM', vmx(inst)]); fs.rmSync(inst.dir, { recursive: true, force: true }); }
}

module.exports = { id: 'vmware', check, deploy, status, stats, start, stop, restart, update, logs, backup, restore, deleteBackup, remove, urls, address };
