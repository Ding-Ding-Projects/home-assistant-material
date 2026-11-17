'use strict';
// USB stick maker: puts an offline update pack, or a recovery request, onto a removable stick.
// Everything that can be pure is pure and takes its input as arguments: reading a pack, listing
// and filtering drives from command output, planning the copy and checking the result. The only
// writing is copyAndVerify(), which adds files to an existing file system. It never formats,
// repartitions, relabels or deletes anything, and it never writes to a drive that is not a
// mounted removable volume the caller got from listVolumes().
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run } = require('./util');

const PACK_FORMAT = 1;
const MANIFEST_NAME = 'manifest.json';
const MANIFEST_MAX = 256 * 1024;
const RE_PACK_FOLDER = /^ham-offline-pack-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RE_SHA = /^[0-9a-f]{64}$/;
const RE_BOARD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const KINDS = ['supervisor', 'core', 'os'];
const GIB = 1024 ** 3;
const MARGIN = 64 * 1024 * 1024;
const FAT_FILE_LIMIT = 4 * GIB - 1;

const RECOVERY_LABEL = 'HA-RECOVERY';
const RECOVERY_ACTIONS = {
  'reinstall-os': { confirm: 'REINSTALL-OS', needsBundle: true, effect: 'Reinstalls the operating system from the update file on the stick. The device keeps its settings and data.' },
  'reset-apps': { confirm: 'RESET-APPS', needsBundle: false, effect: 'Resets the apps container storage. Settings and the Home Assistant configuration are kept.' },
  'factory-reset': { confirm: 'ERASE-EVERYTHING-ON-THIS-DEVICE', needsBundle: false, effect: 'Erases everything on the device when it next starts: settings, apps, history and the Home Assistant configuration.' }
};
const RECOVERY_FS = ['fat32', 'vfat', 'exfat', 'ext4'];
const PACK_FS = ['fat32', 'vfat', 'exfat', 'ntfs', 'ext2', 'ext3', 'ext4', 'btrfs', 'f2fs'];
const RE_BUNDLE = /^haos_([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+\.\d+(?:\.\d+)*(?:\.?(?:dev|rc|b|a)\d+)?)\.raucb$/;

class StickError extends Error {}
const need = (ok, message) => { if (!ok) throw new StickError(message); };

// ---------- Pack manifest (the same rules as supervisor/supervisor/os/offline_pack.py) ----------
function parseManifest(buffer) {
  need(buffer.length <= MANIFEST_MAX, 'The manifest is too large.');
  let raw;
  try { raw = JSON.parse(buffer.toString('utf8')); } catch { throw new StickError('The manifest is not valid JSON.'); }
  need(raw && typeof raw === 'object' && !Array.isArray(raw), 'The manifest is not an object.');
  need(raw.format === PACK_FORMAT, 'Unsupported manifest format.');
  need(typeof raw.build === 'string' && RE_VERSION.test(raw.build), 'Bad build number.');
  need(typeof raw.board === 'string' && RE_BOARD.test(raw.board), 'Bad board.');
  need(Array.isArray(raw.parts) && raw.parts.length > 0 && raw.parts.length <= KINDS.length, 'Bad parts list.');
  const parts = raw.parts.map((p) => {
    need(p && typeof p === 'object' && KINDS.includes(p.kind), 'A part has an unknown kind.');
    const available = p.available === undefined ? true : p.available;
    need(typeof available === 'boolean', `Part ${p.kind}: bad available flag.`);
    need(p.version === undefined || p.version === null || (typeof p.version === 'string' && RE_VERSION.test(p.version)), `Part ${p.kind}: bad version.`);
    if (!available) return { kind: p.kind, available: false, version: p.version || null };
    need(typeof p.file === 'string' && RE_FILE.test(p.file) && p.file !== MANIFEST_NAME, `Part ${p.kind}: bad file name.`);
    need(Number.isSafeInteger(p.size) && p.size > 0, `Part ${p.kind}: bad size.`);
    need(typeof p.sha256 === 'string' && RE_SHA.test(p.sha256), `Part ${p.kind}: bad sha256.`);
    if (p.kind === 'os') {
      need(p.board === raw.board, 'The os part is for another board.');
      need(p.signature === 'rauc-embedded', 'The os part has an unknown signature.');
      need(p.file === `haos_${raw.board}-${p.version}.raucb`, 'The os part file name does not match its board and version.');
    }
    return { kind: p.kind, available: true, file: p.file, size: p.size, sha256: p.sha256, version: p.version || null };
  });
  need(new Set(parts.map((p) => p.kind)).size === parts.length, 'A part kind is listed twice.');
  const files = parts.filter((p) => p.available).map((p) => p.file);
  need(new Set(files).size === files.length, 'A file is listed twice.');
  return { build: raw.build, board: raw.board, parts };
}

function sha256File(file, onChunk) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', (c) => { hash.update(c); if (onChunk) onChunk(c.length); });
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Reads a pack folder and checks every available part against the manifest before any copy.
async function readPack(folder, { onProgress } = {}) {
  need(RE_PACK_FOLDER.test(path.basename(folder)), 'The folder is not named like an offline update pack (ham-offline-pack-<build>).');
  const dir = fs.lstatSync(folder);
  need(dir.isDirectory() && !dir.isSymbolicLink(), 'The pack is not a folder.');
  const manifestPath = path.join(folder, MANIFEST_NAME);
  const mInfo = fs.lstatSync(manifestPath, { throwIfNoEntry: false });
  need(mInfo && mInfo.isFile(), 'The pack has no manifest.json.');
  const manifest = parseManifest(fs.readFileSync(manifestPath));
  need(manifest.parts.some((p) => p.kind === 'os' && p.available), 'The pack has no operating system part, so it cannot update a device without internet.');
  let done = 0;
  const total = manifest.parts.filter((p) => p.available).reduce((n, p) => n + p.size, 0);
  for (const part of manifest.parts.filter((p) => p.available)) {
    const file = path.join(folder, part.file);
    const info = fs.lstatSync(file, { throwIfNoEntry: false });
    need(info && info.isFile(), `${part.file}: the file is missing.`);
    need(info.size === part.size, `${part.file}: the size does not match the manifest.`);
    const sum = await sha256File(file, (n) => { done += n; if (onProgress) onProgress(done / total); });
    need(sum === part.sha256, `${part.file}: the checksum does not match the manifest.`);
  }
  return { folder, name: path.basename(folder), manifest, bytes: total };
}

// ---------- Drive listing: read only, removable volumes only ----------
const norm = (fsName) => String(fsName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fsId = (n) => ({ fat32: 'fat32', fat: 'vfat', vfat: 'vfat', exfat: 'exfat', ntfs: 'ntfs' })[norm(n)] || norm(n);

function parseWindowsVolumes(json) {
  const list = json && json.trim() ? [].concat(JSON.parse(json)) : [];
  return list.filter((v) => v && v.DriveLetter).map((v) => ({
    id: 'win:' + v.DriveLetter, label: v.FileSystemLabel || '', fs: fsId(v.FileSystem), mount: v.DriveLetter + ':\\',
    size: Number(v.Size) || 0, free: Number(v.SizeRemaining) || 0, bus: 'USB'
  }));
}

function parseLsblk(json, statfs) {
  const out = [];
  const walk = (node, disk) => {
    if (node.fstype && node.mountpoint && node.mountpoint !== '/' && !/^\/(boot|usr|var|etc|home)?$/.test(node.mountpoint) && !String(node.mountpoint).startsWith('[')) {
      let free = 0, size = Number(node.size) || 0;
      try { const s = statfs(node.mountpoint); free = s.bavail * s.bsize; size = s.blocks * s.bsize; } catch { /* keep the reported size */ }
      out.push({ id: 'lsblk:' + node.name, label: node.label || '', fs: fsId(node.fstype), mount: node.mountpoint, size, free, bus: disk.tran || 'removable' });
    }
    for (const c of node.children || []) walk(c, disk);
  };
  for (const d of JSON.parse(json).blockdevices || []) {
    const removable = d.rm === true || d.rm === '1' || d.rm === 1 || d.tran === 'usb';
    if (d.type === 'disk' && removable) walk(d, d);
  }
  return out;
}

function parseDiskutilInfo(id, text) {
  const key = (k) => (new RegExp('<key>' + k + '</key>\\s*<(?:string|integer)>([^<]*)</').exec(text) || [])[1];
  const mount = key('MountPoint');
  if (!mount) return null;
  return { id: 'diskutil:' + id, label: key('VolumeName') || '', fs: fsId(key('FilesystemType') || key('FilesystemName')), mount, size: Number(key('TotalSize')) || 0, free: Number(key('FreeSpace') || key('APFSContainerFree')) || 0, bus: 'External' };
}

// A stick is a mounted, writable, removable volume that is not where the system lives.
function filterTargets(volumes, { systemRoots = [] } = {}) {
  const roots = ['/', 'C:\\', ...systemRoots].map((r) => r.toLowerCase());
  return volumes.filter((v) => v.mount && !roots.includes(v.mount.toLowerCase()) && v.size > 0);
}

async function listVolumes() {
  if (process.platform === 'win32') {
    const ps = "Get-Disk | Where-Object { $_.BusType -eq 'USB' -and -not $_.IsBoot -and -not $_.IsSystem } | Get-Partition | Get-Volume | Where-Object { $_.DriveLetter } | Select-Object DriveLetter,FileSystemLabel,FileSystem,Size,SizeRemaining | ConvertTo-Json -Compress";
    const r = await run('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 30000 });
    if (r.code !== 0) throw new Error('Could not list drives: ' + r.err.trim());
    return filterTargets(parseWindowsVolumes(r.out));
  }
  if (process.platform === 'darwin') {
    const list = await run('diskutil', ['list', '-plist', 'external', 'physical'], { timeout: 30000 });
    const ids = [...list.out.matchAll(/<string>(disk\d+s\d+)<\/string>/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    const out = [];
    for (const id of ids) { const info = parseDiskutilInfo(id, (await run('diskutil', ['info', '-plist', id])).out); if (info) out.push(info); }
    return filterTargets(out);
  }
  const r = await run('lsblk', ['-J', '-b', '-o', 'NAME,SIZE,RM,TRAN,LABEL,FSTYPE,MOUNTPOINT,TYPE'], { timeout: 20000 });
  if (r.code !== 0) throw new Error('Could not list drives: ' + r.err.trim());
  return filterTargets(parseLsblk(r.out, (m) => fs.statfsSync(m)));
}

// ---------- Plans ----------
const reasons = (list) => list.filter(Boolean);

function planOfflinePack(pack, volume) {
  const files = pack.manifest.parts.filter((p) => p.available).map((p) => ({ name: p.file, size: p.size, sha256: p.sha256, from: path.join(pack.folder, p.file) }));
  files.push({ name: MANIFEST_NAME, size: fs.statSync(path.join(pack.folder, MANIFEST_NAME)).size, from: path.join(pack.folder, MANIFEST_NAME), sha256: null });
  const destDir = path.join(volume.mount, 'updates', pack.name);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const blocked = reasons([
    !PACK_FS.includes(volume.fs) && `The stick is formatted ${volume.fs || 'unknown'}, which the device cannot read for updates. Format it as FAT32, exFAT or ext4 first.`,
    ['fat32', 'vfat'].includes(volume.fs) && files.some((f) => f.size > FAT_FILE_LIMIT) && 'A file in the pack is larger than a FAT32 stick can hold. Use an exFAT or ext4 stick.',
    volume.free < bytes + MARGIN && `The stick has too little free space: the pack needs ${bytes} bytes plus a margin.`,
    fs.existsSync(destDir) && `The stick already has updates/${pack.name}. Remove that folder on the stick yourself, then write again.`
  ]);
  return { kind: 'pack', purpose: 'offline-update', volume, destDir, files, bytes, blocked, summary: `Adds updates/${pack.name} (${files.length} files) to ${volume.label || volume.mount}. Nothing already on the stick is changed or deleted.` };
}

// confirmed: the exact confirm text the device expects is written for the person, never typed.
function planRecovery(volume, { action, bundle }) {
  const spec = RECOVERY_ACTIONS[action];
  need(spec, 'Unknown recovery action.');
  const files = [];
  let request = { format: 1, action, confirm: spec.confirm };
  if (spec.needsBundle) {
    need(bundle && fs.statSync(bundle, { throwIfNoEntry: false })?.isFile(), 'Choose the update file for your board.');
    const m = RE_BUNDLE.exec(path.basename(bundle));
    need(m, 'The update file must be named like haos_<board>-<version>.raucb.');
    request = { ...request, bundle: path.basename(bundle) };
    files.push({ name: path.basename(bundle), size: fs.statSync(bundle).size, from: bundle, sha256: null });
  }
  const body = Buffer.from(JSON.stringify(request, null, 2) + '\n');
  files.push({ name: 'recovery-request.json', size: body.length, body, sha256: crypto.createHash('sha256').update(body).digest('hex') });
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const blocked = reasons([
    volume.label !== RECOVERY_LABEL && `The stick's label is "${volume.label || '(none)'}", but the device only looks for a stick labelled exactly ${RECOVERY_LABEL}. This app does not relabel or format drives. Set the label yourself: on Windows right-click the drive, Rename, type ${RECOVERY_LABEL}; on macOS rename it in Finder or Disk Utility; on Linux use a label tool for its file system. Then refresh.`,
    !RECOVERY_FS.includes(volume.fs) && `The stick is formatted ${volume.fs || 'unknown'}. The device mounts FAT32, exFAT or ext4 recovery sticks.`,
    volume.free < bytes + MARGIN && 'The stick has too little free space.'
  ]);
  return { kind: 'recovery', purpose: 'recovery', action, volume, destDir: volume.mount, files, bytes, blocked, summary: `${spec.effect} Writes recovery-request.json${spec.needsBundle ? ' and the update file' : ''} to the root of ${volume.label || volume.mount}.` };
}

// ---------- Writing and verifying ----------
// Adds the planned files. Each is written under a temporary name, flushed, renamed, and finally every
// file is read back from the stick and compared with its SHA-256. Existing names are never replaced.
async function copyAndVerify(plan, { onProgress, markers = true } = {}) {
  need(!plan.blocked.length, plan.blocked[0]);
  if (plan.kind === 'recovery' && markers) {
    const clash = fs.readdirSync(plan.destDir).find((n) => /^recovery-request(\.|$)/.test(n));
    need(!clash, `The stick already carries ${clash}. A stick acts on one request only; remove the old request files on the stick yourself first.`);
  }
  fs.mkdirSync(plan.destDir, { recursive: true });
  const total = plan.bytes; let done = 0; const written = [];
  const report = (n) => { done += n; if (onProgress) onProgress({ phase: 'writing', fraction: Math.min(done / total, 1) / 2 }); };
  for (const f of plan.files) {
    const target = path.join(plan.destDir, f.name);
    need(!fs.existsSync(target), `${f.name} already exists on the stick and is left alone.`);
    const tmp = target + '.part';
    try {
      if (f.body) { fs.writeFileSync(tmp, f.body); report(f.body.length); } else await copyFile(f.from, tmp, report);
      const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, target);
    } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
    written.push({ ...f, target });
  }
  let verified = 0;
  const results = [];
  for (const f of written) {
    const want = f.sha256 || await sha256File(f.from);
    const got = await sha256File(f.target, (n) => { verified += n; if (onProgress) onProgress({ phase: 'checking', fraction: 0.5 + Math.min(verified / total, 1) / 2 }); });
    results.push({ name: f.name, size: f.size, sha256: got, ok: got === want });
  }
  const bad = results.filter((r) => !r.ok);
  return { ok: !bad.length, results, written: written.map((f) => f.target), error: bad.length ? `${bad.map((b) => b.name).join(', ')} did not read back correctly from the stick. Do not use it.` : '' };
}

function copyFile(from, to, onChunk) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(from, { highWaterMark: 4 * 1024 * 1024 });
    const output = fs.createWriteStream(to, { flags: 'wx', mode: 0o644 });
    input.on('data', (c) => onChunk(c.length));
    input.on('error', reject); output.on('error', reject); output.on('finish', resolve);
    input.pipe(output);
  });
}

// A downloaded pack is a ZIP holding one ham-offline-pack-<build> folder. It is unpacked into a
// fresh folder the caller owns, and nothing outside that folder is written.
async function unpackZip(zipFile, destDir) {
  const extract = require('extract-zip');
  fs.mkdirSync(destDir, { recursive: true });
  await extract(zipFile, { dir: path.resolve(destDir) });
  const folders = fs.readdirSync(destDir).filter((n) => RE_PACK_FOLDER.test(n));
  need(folders.length === 1, 'The ZIP must hold exactly one ham-offline-pack-<build> folder.');
  return path.join(destDir, folders[0]);
}

module.exports = {
  StickError, PACK_FORMAT, RECOVERY_LABEL, RECOVERY_ACTIONS, RE_PACK_FOLDER,
  parseManifest, readPack, sha256File, parseWindowsVolumes, parseLsblk, parseDiskutilInfo, filterTargets, listVolumes,
  planOfflinePack, planRecovery, copyAndVerify, unpackZip
};
