'use strict';
// Target: a Raspberry Pi. Writes the operating system image to an SD card or USB drive, checks
// what was written, and then waits for the Pi to answer on the network.
// Writing a whole drive needs administrator rights: the app asks the system for them with its own
// prompt (UAC on Windows, the password dialog on macOS and Linux) and runs only the writer that way.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('./util');
const readiness = require('./pi-readiness');

const GB = 1024 ** 3;

// Lists drives that look removable: USB or SD, not the system disk, at most 512 GB.
async function listDrives() {
  if (process.platform === 'win32') {
    const ps = "Get-Disk | Where-Object { $_.BusType -in 'USB','SD','MMC' -and -not $_.IsBoot -and -not $_.IsSystem } | Select-Object Number,FriendlyName,Size,BusType | ConvertTo-Json -Compress";
    const r = await run('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 30000 });
    if (r.code !== 0) throw new Error('Could not list drives: ' + r.err.trim());
    const list = r.out.trim() ? [].concat(JSON.parse(r.out)) : [];
    return list.filter((d) => d.Size <= 512 * GB).map((d) => ({ id: '\\\\.\\PhysicalDrive' + d.Number, number: d.Number, name: d.FriendlyName, size: d.Size, bus: d.BusType }));
  }
  if (process.platform === 'darwin') {
    const r = await run('diskutil', ['list', '-plist', 'external', 'physical'], { timeout: 30000 });
    const names = [...r.out.matchAll(/<string>(disk\d+)<\/string>/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    const out = [];
    for (const n of names) {
      const i = await run('diskutil', ['info', n]);
      const size = Number((i.out.match(/Disk Size:.*\((\d+) Bytes\)/) || [])[1] || 0);
      const name = ((i.out.match(/Device \/ Media Name:\s*(.+)/) || [])[1] || n).trim();
      if (/Whole:\s+Yes/.test(i.out) && size && size <= 512 * GB) out.push({ id: '/dev/r' + n, disk: n, name, size, bus: 'External' });
    }
    return out;
  }
  const r = await run('lsblk', ['-J', '-b', '-d', '-o', 'NAME,SIZE,RM,TRAN,MODEL,TYPE,MOUNTPOINT'], { timeout: 20000 });
  if (r.code !== 0) throw new Error('Could not list drives: ' + r.err.trim());
  const root = (await run('findmnt', ['-n', '-o', 'SOURCE', '/'])).out.trim();
  return JSON.parse(r.out).blockdevices.filter((d) => d.type === 'disk' && (d.rm === true || d.rm === '1' || d.tran === 'usb' || /^mmcblk/.test(d.name)) && !root.startsWith('/dev/' + d.name) && Number(d.size) <= 512 * GB)
    .map((d) => ({ id: '/dev/' + d.name, name: (d.model || d.name).trim(), size: Number(d.size), bus: d.tran || 'card' }));
}

// Runs this app's own writer with administrator rights and follows its progress file.
async function write({ image, drive, onProgress, log }) {
  const prog = path.join(os.tmpdir(), 'ham-writer-' + Date.now() + '.json');
  const writer = path.join(__dirname, 'writer.js');
  const exe = process.execPath;
  const args = [writer, image, drive.id, prog];
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  let launch;
  if (process.platform === 'win32') {
    // Remove the drive's partitions first so Windows lets go of it, then write; both in one elevated run.
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const inner = "$env:ELECTRON_RUN_AS_NODE='1'; Clear-Disk -Number " + Number(drive.number) + " -RemoveData -RemoveOEM -Confirm:$false -ErrorAction SilentlyContinue; & " + q(exe) + ' ' + args.map(q).join(' ');
    const encoded = Buffer.from(inner, 'utf16le').toString('base64');
    launch = run('powershell.exe', ['-NoProfile', '-Command', "Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','" + encoded + "'"]);
  } else if (process.platform === 'darwin') {
    const sh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
    const cmd = 'diskutil unmountDisk ' + sh('/dev/' + drive.disk) + ' && ELECTRON_RUN_AS_NODE=1 ' + [exe].concat(args).map(sh).join(' ');
    launch = run('osascript', ['-e', 'do shell script ' + JSON.stringify(cmd) + ' with administrator privileges']);
  } else {
    await run('sh', ['-c', 'for p in $(lsblk -ln -o NAME ' + drive.id + ' | tail -n +2); do udisksctl unmount -b /dev/$p >/dev/null 2>&1 || true; done']);
    launch = run('pkexec', ['env', 'ELECTRON_RUN_AS_NODE=1', exe].concat(args));
  }
  void env;
  let done = false;
  const poll = setInterval(() => { try { const p = JSON.parse(fs.readFileSync(prog, 'utf8')); onProgress(p); if (p.state === 'done' || p.state === 'failed') done = true; } catch { /* not started yet */ } }, 500);
  const r = await launch;
  clearInterval(poll);
  let p = {};
  try { p = JSON.parse(fs.readFileSync(prog, 'utf8')); fs.rmSync(prog, { force: true }); } catch { /* the writer never started */ }
  if (!p.state) throw new Error(r.code !== 0 ? 'Writing needs administrator rights, and the request was cancelled or refused. Nothing was written.' : 'The writer did not start.');
  if (p.state !== 'done') throw new Error('Writing stopped: ' + (p.error || 'unknown reason') + '. The drive may be unusable until it is written again.');
  void done; void log;
  return p;
}

async function waitForPi(log, minutes = 30, options = {}) {
  const urls = options.url ? [readiness.localAddress(options.url)] : readiness.DEFAULT_URLS;
  const probe = options.probe || readiness.probeCore;
  const now = options.now || Date.now;
  const pause = options.pause || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const end = now() + minutes * 60000;
  do {
    const found = await readiness.candidates(urls, probe);
    const result = readiness.assessCandidates(found, options.baseline || [], !!options.url);
    if (result.status !== 'unreachable') return result;
    if (now() >= end) return result;
    log('Waiting for the appliance service. Owner-account setup is not required for startup.');
    await pause(Math.min(15000, Math.max(0, end - now())));
  } while (now() < end);
  return { status: 'unreachable', ownerSetup: 'unknown', piIdentity: 'unverified' };
}

module.exports = { listDrives, write, waitForPi, baseline: readiness.candidates };
