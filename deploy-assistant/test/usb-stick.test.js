'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const stick = require('../src/backend/usb-stick');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const OS_NAME = 'haos_ova-13.0.7.raucb';
const OS_BYTES = Buffer.alloc(5000, 7);
const SUP_BYTES = Buffer.alloc(300, 3);

function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-stick-')); return d; }
function manifestFor(overrides = {}) {
  return {
    format: 1, build: '7', board: 'ova',
    parts: [
      { kind: 'supervisor', available: true, file: 'supervisor.tar', size: SUP_BYTES.length, sha256: sha(SUP_BYTES), version: '2026.1.7' },
      { kind: 'core', available: false, version: '2026.1.7' },
      { kind: 'os', available: true, file: OS_NAME, size: OS_BYTES.length, sha256: sha(OS_BYTES), version: '13.0.7', board: 'ova', signature: 'rauc-embedded' }
    ], ...overrides
  };
}
function makePack(root, manifest = manifestFor()) {
  const folder = path.join(root, 'ham-offline-pack-7'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, OS_NAME), OS_BYTES);
  fs.writeFileSync(path.join(folder, 'supervisor.tar'), SUP_BYTES);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  return folder;
}
const volume = (over = {}) => ({ id: 'x', label: 'UPDATES', fs: 'vfat', mount: '', size: 1e9, free: 1e9, bus: 'USB', ...over });

test('a valid pack is read and every part is checked before anything is copied', async () => {
  const root = tmp(); const progress = [];
  const pack = await stick.readPack(makePack(root), { onProgress: (f) => progress.push(f) });
  assert.equal(pack.bytes, OS_BYTES.length + SUP_BYTES.length);
  assert.equal(progress.at(-1), 1);
  assert.deepEqual(pack.manifest.parts.map((p) => p.kind), ['supervisor', 'core', 'os']);
});

test('a pack with an altered, resized or missing part is refused', async () => {
  for (const [name, change, pattern] of [
    ['altered', (f) => fs.writeFileSync(path.join(f, OS_NAME), Buffer.alloc(5000, 9)), /checksum/],
    ['resized', (f) => fs.writeFileSync(path.join(f, OS_NAME), Buffer.alloc(10)), /size/],
    ['missing', (f) => fs.rmSync(path.join(f, 'supervisor.tar')), /missing/]
  ]) {
    const folder = makePack(tmp()); change(folder);
    await assert.rejects(stick.readPack(folder), pattern, name);
  }
});

test('malformed manifests are refused', () => {
  const bad = [
    Buffer.from('nope'), Buffer.from('[]'), Buffer.from(JSON.stringify({ ...manifestFor(), format: 2 })),
    Buffer.from(JSON.stringify(manifestFor({ parts: [] }))),
    Buffer.from(JSON.stringify(manifestFor({ board: 'Bad Board' }))),
    Buffer.from(JSON.stringify(manifestFor({ parts: [{ ...manifestFor().parts[2], file: '../x.raucb' }] }))),
    Buffer.from(JSON.stringify(manifestFor({ parts: [{ ...manifestFor().parts[2], sha256: 'abc' }] }))),
    Buffer.from(JSON.stringify(manifestFor({ parts: [{ ...manifestFor().parts[2], signature: null }] }))),
    Buffer.from(JSON.stringify(manifestFor({ parts: [manifestFor().parts[2], manifestFor().parts[2]] }))),
    Buffer.alloc(300 * 1024, 32)
  ];
  for (const b of bad) assert.throws(() => stick.parseManifest(b), stick.StickError);
});

test('a pack without an operating system part, or a wrongly named folder, is refused', async () => {
  const noOs = makePack(tmp(), manifestFor({ parts: [manifestFor().parts[0]] }));
  await assert.rejects(stick.readPack(noOs), /no operating system part/);
  const root = tmp(); const folder = path.join(root, 'other'); fs.mkdirSync(folder);
  await assert.rejects(stick.readPack(folder), /not named like/);
});

test('drive lists keep removable mounted volumes and drop the system drive', () => {
  const win = stick.parseWindowsVolumes(JSON.stringify([
    { DriveLetter: 'E', FileSystemLabel: 'HA-RECOVERY', FileSystem: 'FAT32', Size: 16e9, SizeRemaining: 15e9 },
    { DriveLetter: 'C', FileSystemLabel: 'Windows', FileSystem: 'NTFS', Size: 500e9, SizeRemaining: 1e9 },
    { DriveLetter: null, FileSystemLabel: 'x' }
  ]));
  const kept = stick.filterTargets(win);
  assert.deepEqual(kept.map((v) => [v.mount, v.label, v.fs]), [['E:\\', 'HA-RECOVERY', 'fat32']]);

  const lsblk = JSON.stringify({ blockdevices: [
    { name: 'sda', type: 'disk', rm: false, tran: 'sata', size: 500e9, children: [{ name: 'sda1', type: 'part', fstype: 'ext4', mountpoint: '/', size: 500e9 }] },
    { name: 'sdb', type: 'disk', rm: true, tran: 'usb', size: 16e9, children: [
      { name: 'sdb1', type: 'part', fstype: 'vfat', label: 'UPDATES', mountpoint: '/media/me/UPDATES', size: 16e9 },
      { name: 'sdb2', type: 'part', fstype: 'ext4', label: 'unmounted', mountpoint: null, size: 1e9 }] }
  ] });
  const linux = stick.filterTargets(stick.parseLsblk(lsblk, () => { throw new Error('no statfs'); }));
  assert.deepEqual(linux.map((v) => [v.mount, v.label, v.fs]), [['/media/me/UPDATES', 'UPDATES', 'vfat']]);

  const plist = '<dict><key>MountPoint</key><string>/Volumes/STICK</string><key>VolumeName</key><string>STICK</string><key>FilesystemType</key><string>msdos</string><key>TotalSize</key><integer>8000000000</integer><key>FreeSpace</key><integer>7000000000</integer></dict>';
  assert.equal(stick.parseDiskutilInfo('disk4s1', plist).mount, '/Volumes/STICK');
  assert.equal(stick.parseDiskutilInfo('disk4s2', '<dict></dict>'), null);
});

test('the offline update plan names what it adds and refuses unsuitable sticks', async () => {
  const root = tmp(); const pack = await stick.readPack(makePack(root)); const mount = tmp();
  const plan = stick.planOfflinePack(pack, volume({ mount }));
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.destDir, path.join(mount, 'updates', 'ham-offline-pack-7'));
  assert.deepEqual(plan.files.map((f) => f.name).sort(), ['haos_ova-13.0.7.raucb', 'manifest.json', 'supervisor.tar']);
  assert.match(stick.planOfflinePack(pack, volume({ mount, fs: 'hfs' })).blocked[0], /formatted hfs/);
  assert.match(stick.planOfflinePack(pack, volume({ mount, free: 1000 })).blocked[0], /too little free space/);
  fs.mkdirSync(plan.destDir, { recursive: true });
  assert.match(stick.planOfflinePack(pack, volume({ mount })).blocked[0], /already has updates/);
});

test('writing a pack adds the files and reads every one back from the stick', async () => {
  const pack = await stick.readPack(makePack(tmp())); const mount = tmp();
  fs.writeFileSync(path.join(mount, 'keep.txt'), 'mine');
  const phases = [];
  const result = await stick.copyAndVerify(stick.planOfflinePack(pack, volume({ mount })), { onProgress: (p) => phases.push(p.phase) });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 3);
  assert.deepEqual(fs.readFileSync(path.join(mount, 'updates', 'ham-offline-pack-7', OS_NAME)), OS_BYTES);
  assert.equal(fs.readFileSync(path.join(mount, 'keep.txt'), 'utf8'), 'mine');
  assert.ok(phases.includes('writing') && phases.includes('checking'));
  assert.deepEqual(fs.readdirSync(path.join(mount, 'updates', 'ham-offline-pack-7')).filter((n) => n.endsWith('.part')), []);
});

test('a file that does not read back the same is reported as not ok', async () => {
  const pack = await stick.readPack(makePack(tmp())); const mount = tmp();
  const plan = stick.planOfflinePack(pack, volume({ mount }));
  plan.files.find((f) => f.name === OS_NAME).sha256 = sha(Buffer.from('something else'));
  const result = await stick.copyAndVerify(plan);
  assert.equal(result.ok, false);
  assert.match(result.error, /did not read back/);
});

test('a blocked plan is never written', async () => {
  const pack = await stick.readPack(makePack(tmp())); const mount = tmp();
  await assert.rejects(stick.copyAndVerify(stick.planOfflinePack(pack, volume({ mount, free: 1 }))), /too little free space/);
  assert.deepEqual(fs.readdirSync(mount), []);
});

test('an existing file on the stick is never overwritten', async () => {
  const pack = await stick.readPack(makePack(tmp())); const mount = tmp();
  const plan = stick.planOfflinePack(pack, volume({ mount }));
  fs.mkdirSync(plan.destDir, { recursive: true });
  fs.writeFileSync(path.join(plan.destDir, 'manifest.json'), 'old');
  plan.blocked = [];
  await assert.rejects(stick.copyAndVerify(plan), /already exists/);
  assert.equal(fs.readFileSync(path.join(plan.destDir, 'manifest.json'), 'utf8'), 'old');
});

test('a recovery stick needs the exact label, and the request is written with the confirm text', async () => {
  const mount = tmp();
  const wrong = stick.planRecovery(volume({ mount, label: 'USB' }), { action: 'reset-apps' });
  assert.match(wrong.blocked[0], /label is "USB".*does not relabel/);
  await assert.rejects(stick.copyAndVerify(wrong), /label/);
  assert.deepEqual(fs.readdirSync(mount), []);

  const plan = stick.planRecovery(volume({ mount, label: 'HA-RECOVERY' }), { action: 'factory-reset' });
  assert.deepEqual(plan.blocked, []);
  const result = await stick.copyAndVerify(plan);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(mount, 'recovery-request.json'), 'utf8')), { format: 1, action: 'factory-reset', confirm: 'ERASE-EVERYTHING-ON-THIS-DEVICE' });
});

test('a recovery stick that already carries a request is refused', async () => {
  const mount = tmp(); fs.writeFileSync(path.join(mount, 'recovery-request.done-20260101T000000Z.json'), '{}');
  const plan = stick.planRecovery(volume({ mount, label: 'HA-RECOVERY' }), { action: 'reset-apps' });
  await assert.rejects(stick.copyAndVerify(plan), /already carries/);
});

test('reinstalling the operating system needs a correctly named update file', async () => {
  const dir = tmp(); const mount = tmp();
  assert.throws(() => stick.planRecovery(volume({ mount, label: 'HA-RECOVERY' }), { action: 'reinstall-os' }), /Choose the update file/);
  const bad = path.join(dir, 'whatever.bin'); fs.writeFileSync(bad, 'x');
  assert.throws(() => stick.planRecovery(volume({ mount, label: 'HA-RECOVERY' }), { action: 'reinstall-os', bundle: bad }), /named like/);
  const good = path.join(dir, OS_NAME); fs.writeFileSync(good, OS_BYTES);
  const plan = stick.planRecovery(volume({ mount, label: 'HA-RECOVERY', fs: 'exfat' }), { action: 'reinstall-os', bundle: good });
  assert.equal((await stick.copyAndVerify(plan)).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(mount, 'recovery-request.json'), 'utf8')).bundle, OS_NAME);
  assert.deepEqual(fs.readFileSync(path.join(mount, OS_NAME)), OS_BYTES);
});

test('an unknown recovery action and an unsupported file system are refused', () => {
  const mount = tmp();
  assert.throws(() => stick.planRecovery(volume({ mount }), { action: 'format-everything' }), /Unknown recovery action/);
  assert.match(stick.planRecovery(volume({ mount, label: 'HA-RECOVERY', fs: 'ntfs' }), { action: 'reset-apps' }).blocked[0], /formatted ntfs/);
});

test('a downloaded pack ZIP is unpacked into one folder that then reads as a pack', async () => {
  const { zipSync } = require('../src/renderer/vendor/fflate.js');
  const files = { 'ham-offline-pack-7/manifest.json': Buffer.from(JSON.stringify(manifestFor())), ['ham-offline-pack-7/' + OS_NAME]: OS_BYTES, 'ham-offline-pack-7/supervisor.tar': SUP_BYTES };
  const zip = path.join(tmp(), 'pack.zip'); fs.writeFileSync(zip, zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)])), { level: 0 }));
  const folder = await stick.unpackZip(zip, tmp());
  assert.equal((await stick.readPack(folder)).manifest.build, '7');
});
