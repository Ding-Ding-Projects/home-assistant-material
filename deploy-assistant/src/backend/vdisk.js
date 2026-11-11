'use strict';
// Windows virtual disk manager: VHD, VHDX, VHD Set and ISO. It finds which routes this Windows has
// (the Storage module, DiskPart, the Hyper-V module) and never enables Hyper-V itself. Every
// operation is built as a PowerShell script and, where DiskPart can do it, an equivalent DiskPart
// script; both are shown to copy. Steps that need administrator rights run through one UAC prompt,
// and a cancelled prompt changes nothing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { run } = require('./util');

const EXT = /\.(vhdx?|vhds|avhdx?|iso)$/i;
const ps = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const LIMITS = { min: 3 * 1048576, vhd: 2040 * 1073741824, vhdx: 64 * 1099511627776 };

function checkPath(p, { mustExist = true } = {}) {
  if (typeof p !== 'string' || !path.win32.isAbsolute(p) || !EXT.test(p) || /[\r\n"]/.test(p)) throw new Error('Give the full path of a .vhd, .vhdx, .vhds, .avhd, .avhdx or .iso file.');
  if (mustExist && process.platform === 'win32' && !fs.existsSync(p)) throw new Error('That file is not there.');
  return p;
}
function sizeBytes(v, unit) { const n = Number(v); const m = { MB: 1048576, GB: 1073741824, TB: 1099511627776 }[unit || 'GB']; if (!(n > 0) || !m) throw new Error('Give a size above zero.'); return Math.round(n * m); }

// Each operation: what it does, which routes can do it, the PowerShell, and the DiskPart where one exists.
const OPS = {
  create(o, routes) {
    const fmt = /\.vhds$/i.test(o.path) ? 'vhds' : /\.vhdx$/i.test(o.path) ? 'vhdx' : 'vhd'; const bytes = o.type === 'differencing' ? 0 : sizeBytes(o.size, o.unit);
    if (o.type !== 'differencing') { if (bytes < LIMITS.min) throw new Error('A virtual disk is at least 3 MB.'); if (fmt === 'vhd' && o.type !== 'fixed' && bytes > LIMITS.vhd) throw new Error('A dynamic VHD holds at most 2,040 GB; use VHDX.'); if (bytes > LIMITS.vhdx) throw new Error('A VHDX holds at most 64 TB.'); }
    if (o.block && (fmt !== 'vhdx' || !/^(1|2|4|8|16|32|64|128|256)$/.test(String(o.block)))) throw new Error('The block size is for VHDX only: 1 to 256 MB, a power of two.');
    if (o.logical && !/^(512|4096)$/.test(String(o.logical))) throw new Error('Sector sizes are 512 or 4096.');
    if (fmt === 'vhds' && !routes.hyperv) throw new Error('VHD Sets need the Hyper-V PowerShell module, which this Windows does not have. Nothing was created.');
    const init = o.init ? '\n$d = (Mount-DiskImage -ImagePath ' + ps(o.path) + ' -PassThru | Get-DiskImage).Number\nInitialize-Disk -Number $d -PartitionStyle ' + (o.style === 'MBR' ? 'MBR' : 'GPT') + '\n$p = New-Partition -DiskNumber $d -UseMaximumSize ' + (o.letter ? '-AssignDriveLetter' : '') + '\nFormat-Volume -Partition $p -FileSystem ' + (o.fs || 'NTFS') + ' -NewFileSystemLabel ' + ps(o.label || 'Virtual disk') + ' -Confirm:$false | Out-Null' + (o.keepAttached ? '' : '\nDismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null') : '';
    const hv = 'New-VHD -Path ' + ps(o.path) + (o.type === 'differencing' ? ' -ParentPath ' + ps(o.parent) + ' -Differencing' : ' -SizeBytes ' + bytes + (o.type === 'fixed' ? ' -Fixed' : ' -Dynamic')) + (o.block ? ' -BlockSizeBytes ' + o.block * 1048576 : '') + (o.logical ? ' -LogicalSectorSizeBytes ' + o.logical : '') + (o.physical ? ' -PhysicalSectorSizeBytes ' + o.physical : '') + ' | Out-Null' + (o.sddl ? '\nSet-VHD -Path ' + ps(o.path) + ' -ResetDiskIdentifier -Force' : '');
    const dp = 'create vdisk file="' + o.path + '"' + (o.type === 'differencing' ? ' parent="' + o.parent + '"' : ' maximum=' + Math.round(bytes / 1048576) + ' type=' + (o.type === 'fixed' ? 'fixed' : 'expandable')) + (o.sddl ? ' sd="' + o.sddl + '"' : '');
    const route = routes.hyperv && (o.block || o.logical || o.physical || fmt === 'vhds') ? 'hyperv' : routes.hyperv ? 'hyperv' : 'diskpart';
    if (route === 'diskpart' && (o.block || o.logical || o.physical)) throw new Error('Block and sector sizes need the Hyper-V module, which this Windows does not have. Leave them empty to use DiskPart.');
    return { title: 'Create ' + o.path, route, ps: (route === 'hyperv' ? hv : '$s = "' + dp.replace(/"/g, '`"') + '"\n$s | diskpart | Out-String') + init, diskpart: dp, admin: true };
  },
  attach(o) { const iso = /\.iso$/i.test(o.path); const ro = iso || o.readOnly; return { title: 'Attach ' + o.path, route: 'storage', ps: 'Mount-DiskImage -ImagePath ' + ps(o.path) + ' -Access ' + (ro ? 'ReadOnly' : 'ReadWrite') + (o.noLetter ? ' -NoDriveLetter' : '') + ' -PassThru | Get-DiskImage | Select-Object Number,Attached,ImagePath | ConvertTo-Json' + (o.atSignIn ? '\n$a = New-ScheduledTaskAction -Execute powershell.exe -Argument ' + ps('-NoProfile -WindowStyle Hidden -Command "Mount-DiskImage -ImagePath \'' + o.path + '\' -Access ' + (ro ? 'ReadOnly' : 'ReadWrite') + '"') + '\nRegister-ScheduledTask -TaskName ' + ps('HAM attach ' + path.win32.basename(o.path)) + ' -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -RunLevel Highest -Force | Out-Null' : ''), diskpart: iso ? null : 'select vdisk file="' + o.path + '"\nattach vdisk' + (ro ? ' readonly' : '') + (o.noLetter ? ' noerr' : ''), admin: true }; },
  detach(o) { return { title: 'Detach ' + o.path, route: 'storage', ps: '$f = Get-DiskImage -ImagePath ' + ps(o.path) + ' | Get-Disk -ErrorAction SilentlyContinue | Get-Partition -ErrorAction SilentlyContinue | Where-Object DriveLetter | ForEach-Object { $_.DriveLetter + ":" }\nif ($f -and -not ' + (o.force ? '$true' : '$false') + ') { $open = Get-Process | Where-Object { try { $_.Modules.FileName -match ("^(" + ($f -join "|") + ")") } catch { $false } } | Select-Object -ExpandProperty Name -Unique; if ($open) { throw ("Still open by: " + ($open -join ", ") + ". Close them or detach with Force.") } }\nDismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null' + (o.removeTask ? '\nUnregister-ScheduledTask -TaskName ' + ps('HAM attach ' + path.win32.basename(o.path)) + ' -Confirm:$false -ErrorAction SilentlyContinue' : ''), diskpart: 'select vdisk file="' + o.path + '"\ndetach vdisk', admin: true }; },
  resize(o, routes) {
    const bytes = sizeBytes(o.size, o.unit); const grow = o.direction !== 'shrink';
    if (!grow && !/\.vhdx$/i.test(o.path)) throw new Error('Only a VHDX can shrink.');
    if (!grow && !routes.hyperv) throw new Error('Shrinking needs the Hyper-V module (Resize-VHD), which this Windows does not have.');
    const ext = '\n$d = (Mount-DiskImage -ImagePath ' + ps(o.path) + ' -PassThru | Get-DiskImage).Number\n$p = Get-Partition -DiskNumber $d | Where-Object Type -ne Reserved | Sort-Object Offset | Select-Object -Last 1\n$max = (Get-PartitionSupportedSize -DiskNumber $d -PartitionNumber $p.PartitionNumber).SizeMax\nResize-Partition -DiskNumber $d -PartitionNumber $p.PartitionNumber -Size $max\nDismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null';
    const shrink = '$d = (Mount-DiskImage -ImagePath ' + ps(o.path) + ' -PassThru | Get-DiskImage).Number\n$p = Get-Partition -DiskNumber $d | Where-Object Type -ne Reserved | Sort-Object Offset | Select-Object -Last 1\n$min = (Get-PartitionSupportedSize -DiskNumber $d -PartitionNumber $p.PartitionNumber).SizeMin\n$target = ' + bytes + ' - $p.Offset - 1MB\nif ($target -lt $min) { Dismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null; throw ("The smallest safe size is " + [math]::Ceiling(($min + $p.Offset + 1MB)/1GB) + " GB.") }\nResize-Partition -DiskNumber $d -PartitionNumber $p.PartitionNumber -Size $target\nDismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null\nResize-VHD -Path ' + ps(o.path) + ' -SizeBytes ' + bytes;
    return { title: (grow ? 'Grow ' : 'Shrink ') + o.path, route: routes.hyperv ? 'hyperv' : 'diskpart', ps: grow ? (routes.hyperv ? 'Resize-VHD -Path ' + ps(o.path) + ' -SizeBytes ' + bytes : '$s = "select vdisk file=`"' + o.path + '`"`nexpand vdisk maximum=' + Math.round(bytes / 1048576) + '"\n$s | diskpart | Out-String') + (o.extend !== false ? ext : '') : shrink, diskpart: grow ? 'select vdisk file="' + o.path + '"\nexpand vdisk maximum=' + Math.round(bytes / 1048576) : null, admin: true };
  },
  compact(o, routes) {
    const modes = ['Full', 'Quick', 'Retrim', 'Pretrimmed', 'Prezeroed']; const mode = modes.includes(o.mode) ? o.mode : 'Quick';
    const need = mode === 'Full' ? 'detached' : 'read-only attached';
    const hv = (mode === 'Full' ? '' : 'Mount-DiskImage -ImagePath ' + ps(o.path) + ' -Access ReadOnly | Out-Null\n') + '$before = (Get-Item ' + ps(o.path) + ').Length\nOptimize-VHD -Path ' + ps(o.path) + ' -Mode ' + mode + '\n' + (mode === 'Full' ? '' : 'Dismount-DiskImage -ImagePath ' + ps(o.path) + ' | Out-Null\n') + '$after = (Get-Item ' + ps(o.path) + ').Length\n@{ mode = ' + ps(mode) + '; before = $before; after = $after } | ConvertTo-Json';
    const dp = 'select vdisk file="' + o.path + '"\nattach vdisk readonly\ncompact vdisk\ndetach vdisk';
    return { title: 'Compact ' + o.path + ' (' + mode + ')', route: routes.hyperv ? 'hyperv' : 'diskpart', ps: routes.hyperv ? hv : '$before = (Get-Item ' + ps(o.path) + ').Length\n$s = "' + dp.replace(/"/g, '`"').replace(/\n/g, '`n') + '"\n$s | diskpart | Out-String\n$after = (Get-Item ' + ps(o.path) + ').Length\n@{ mode = "DiskPart compact"; before = $before; after = $after } | ConvertTo-Json', diskpart: dp, admin: true, note: 'Mode ' + mode + ' needs the disk ' + need + '; the manager puts it that way and back.' };
  },
  convert(o, routes) {
    if (!routes.hyperv) throw new Error('Converting needs the Hyper-V module (Convert-VHD), which this Windows does not have. Nothing was changed.');
    if (/\.vhd$/i.test(o.dest) && o.sizeBytes > LIMITS.vhd) throw new Error('This disk is larger than a VHD can hold (2,040 GB).');
    return { title: 'Convert to ' + o.dest, route: 'hyperv', ps: 'Convert-VHD -Path ' + ps(o.path) + ' -DestinationPath ' + ps(o.dest) + (o.type ? ' -VHDType ' + (o.type === 'fixed' ? 'Fixed' : 'Dynamic') : '') + (o.block ? ' -BlockSizeBytes ' + o.block * 1048576 : '') + '\nTest-VHD -Path ' + ps(o.dest), diskpart: null, admin: true };
  },
  merge(o, routes) { return { title: 'Merge ' + o.path + ' into its parent', route: routes.hyperv ? 'hyperv' : 'diskpart', ps: routes.hyperv ? 'Merge-VHD -Path ' + ps(o.path) + (o.dest ? ' -DestinationPath ' + ps(o.dest) : '') : '$s = "select vdisk file=`"' + o.path + '`"`nmerge vdisk depth=' + (o.depth || 1) + '"\n$s | diskpart | Out-String', diskpart: 'select vdisk file="' + o.path + '"\nmerge vdisk depth=' + (o.depth || 1), admin: true }; },
  reconnect(o, routes) { if (!routes.hyperv) throw new Error('Reconnecting a moved parent needs the Hyper-V module (Set-VHD).'); return { title: 'Reconnect ' + o.path + ' to ' + o.parent, route: 'hyperv', ps: 'Set-VHD -Path ' + ps(o.path) + ' -ParentPath ' + ps(o.parent) + (o.ignoreId ? ' -IgnoreIdMismatch' : ''), diskpart: null, admin: true }; },
  online(o) { return { title: (o.offline ? 'Take offline' : 'Bring online') + ' disk ' + o.number, route: 'storage', ps: 'Set-Disk -Number ' + Number(o.number) + ' -IsOffline $' + !!o.offline + (o.readOnly != null ? '\nSet-Disk -Number ' + Number(o.number) + ' -IsReadOnly $' + !!o.readOnly : ''), diskpart: 'select disk ' + Number(o.number) + '\n' + (o.offline ? 'offline disk' : 'online disk') + (o.readOnly != null ? '\nattributes disk ' + (o.readOnly ? 'set' : 'clear') + ' readonly' : ''), admin: true }; },
  snapshot(o, routes) { if (!routes.hyperv) throw new Error('VHD Set checkpoints need the Hyper-V module.'); const map = { take: 'New-VHDSnapshot -Path ' + ps(o.path) + ' -Name ' + ps(o.name || 'Checkpoint ' + new Date().toISOString().slice(0, 16)), list: 'Get-VHDSnapshot -Path ' + ps(o.path) + ' | Select-Object SnapshotId,CreationTime,ResilientChangeTrackingId,ParentPathsList | ConvertTo-Json -Depth 4', remove: 'Remove-VHDSnapshot -Path ' + ps(o.path) + ' -SnapshotId ' + ps(o.id) }; return { title: 'VHD Set: ' + o.action, route: 'hyperv', ps: map[o.action], diskpart: null, admin: o.action !== 'list' }; }
};

class VDisk {
  constructor(mgr) { this.m = mgr; this.db = mgr.db.vdisk = mgr.db.vdisk || { files: [], log: [] }; this.routesCache = null; }
  supported() { return process.platform === 'win32'; }
  async routes(force) {
    if (!this.supported()) return { windows: false, storage: false, diskpart: false, hyperv: false, virtdisk: false, why: 'The virtual disk manager works on Windows only. This computer runs ' + os.type() + '.' };
    if (this.routesCache && !force) return this.routesCache;
    const r = await run('powershell', ['-NoProfile', '-Command', '@{ storage = [bool](Get-Command Mount-DiskImage -ErrorAction SilentlyContinue); hyperv = [bool](Get-Command New-VHD -ErrorAction SilentlyContinue); diskpart = (Test-Path "$env:WINDIR\\System32\\diskpart.exe"); edition = (Get-CimInstance Win32_OperatingSystem).Caption } | ConvertTo-Json']);
    let j = {}; try { j = JSON.parse(r.out); } catch { j = {}; }
    this.routesCache = { windows: true, virtdisk: true, storage: !!j.storage, hyperv: !!j.hyperv, diskpart: !!j.diskpart, edition: j.edition || '', at: new Date().toISOString() };
    return this.routesCache;
  }
  async library() {
    const routes = await this.routes(); if (!routes.windows) return { routes, disks: [] };
    const script = '$out = @()\n$imgs = @(Get-Disk | Where-Object BusType -eq "File Backed Virtual" | ForEach-Object { $n = $_.Number; Get-DiskImage -DevicePath ("\\\\.\\PHYSICALDRIVE" + $n) -ErrorAction SilentlyContinue })\n$files = @(' + this.db.files.map((f) => ps(f)).join(',') + ') + @($imgs | ForEach-Object { $_.ImagePath })\nforeach ($f in ($files | Where-Object { $_ } | Select-Object -Unique)) {\n  $e = @{ path = $f; exists = (Test-Path -LiteralPath $f) }\n  if ($e.exists) { $e.fileSize = (Get-Item -LiteralPath $f).Length\n    try { $i = Get-DiskImage -ImagePath $f; $e.attached = $i.Attached; $e.size = $i.Size; $e.number = $i.Number; $e.storageType = $i.StorageType } catch { $e.error = $_.Exception.Message }\n    ' + (routes.hyperv ? 'try { $v = Get-VHD -Path $f; $e.format = "$($v.VhdFormat)"; $e.type = "$($v.VhdType)"; $e.size = $v.Size; $e.minSize = $v.MinimumSize; $e.block = $v.BlockSize; $e.logical = $v.LogicalSectorSize; $e.physical = $v.PhysicalSectorSize; $e.fragmentation = $v.FragmentationPercentage; $e.parent = $v.ParentPath; $e.diskId = "$($v.DiskIdentifier)"; $e.aligned = $v.Alignment; $e.chainOk = [bool](Test-VHD -Path $f -ErrorAction SilentlyContinue) } catch {}' : '') + '\n    if ($e.attached -and $e.number -ne $null) { $e.partitions = @(Get-Partition -DiskNumber $e.number -ErrorAction SilentlyContinue | ForEach-Object { $vol = $_ | Get-Volume -ErrorAction SilentlyContinue; @{ number = $_.PartitionNumber; letter = "$($_.DriveLetter)"; size = $_.Size; fs = $vol.FileSystem; free = $vol.SizeRemaining; label = $vol.FileSystemLabel; paths = @($_.AccessPaths) } }); $dk = Get-Disk -Number $e.number; $e.online = -not $dk.IsOffline; $e.readOnly = $dk.IsReadOnly; $e.style = "$($dk.PartitionStyle)" } }\n  $out += $e }\n$out | ConvertTo-Json -Depth 6';
    const r = await run('powershell', ['-NoProfile', '-Command', script], { timeout: 60000 });
    let disks = []; try { disks = [].concat(JSON.parse(r.out || '[]') || []); } catch { disks = []; }
    return { routes, disks: disks.map((d) => Object.assign({ format: (/\.(\w+)$/.exec(d.path) || [])[1].toUpperCase() }, d)), at: new Date().toISOString() };
  }
  addFiles(paths) { for (const p of paths) { checkPath(p); if (!this.db.files.includes(p)) this.db.files.push(p); } this.db.files = this.db.files.slice(-500); this.m.save(); return this.db.files; }
  forget(p) { this.db.files = this.db.files.filter((x) => x !== p); this.m.save(); return this.db.files; }
  async scan(folder) {
    if (!this.supported()) throw new Error('Windows only.'); if (!path.win32.isAbsolute(folder)) throw new Error('Choose a folder.');
    const found = []; const walk = (d, depth) => { if (depth > 6 || found.length > 2000) return; let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory() && !/^(\$|System Volume Information|Windows)/.test(e.name)) walk(f, depth + 1); else if (EXT.test(e.name)) found.push(f); } };
    walk(folder, 0); return this.addFiles(found);
  }
  // Builds the scripts without running anything, so they can be read and copied first.
  async plan(op, o) { let routes = await this.routes(); if (!routes.windows) routes = { windows: false, storage: true, diskpart: true, hyperv: false, preview: true }; if (!OPS[op]) throw new Error('Unknown operation.'); if (o.path) checkPath(o.path, { mustExist: op !== 'create' }); if (o.parent) checkPath(o.parent); if (o.dest) checkPath(o.dest, { mustExist: false }); return OPS[op](o, routes); }
  // Runs one planned operation as administrator through a single UAC prompt, and reads back its result.
  async execute(op, o) {
    if (!this.supported()) throw new Error('Running it needs Windows. The scripts can be copied and run there.');
    const p = await this.plan(op, o); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-vd-')); const res = path.join(dir, 'result.json'); const script = path.join(dir, 'op.ps1');
    fs.writeFileSync(script, '$ErrorActionPreference = "Stop"\ntry {\n$o = & {\n' + p.ps + '\n} | Out-String\n@{ ok = $true; output = $o } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ' + ps(res) + ' -Encoding UTF8\n} catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath ' + ps(res) + ' -Encoding UTF8 }\n', 'utf8');
    const launch = p.admin ? 'try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",' + ps(script) + ') } catch { exit 5 }' : '& ' + ps(script);
    const r = await run('powershell', ['-NoProfile', '-Command', launch], { timeout: 6 * 3600e3 });
    let out = null; try { out = JSON.parse(fs.readFileSync(res, 'utf8').replace(/^﻿/, '')); } catch { out = null; }
    fs.rmSync(dir, { recursive: true, force: true });
    const entry = { at: new Date().toISOString(), op, title: p.title, route: p.route, ok: !!(out && out.ok), detail: out ? (out.ok ? String(out.output || '').trim().slice(0, 4000) : out.error) : r.code === 5 ? 'The administrator prompt was cancelled or refused. Nothing was changed.' : 'No result came back. Nothing is assumed to have changed.' };
    this.db.log.unshift(entry); this.db.log = this.db.log.slice(0, 200); this.m.save();
    if (op === 'create' && entry.ok) this.addFiles([o.path]);
    if (!entry.ok) throw Object.assign(new Error(entry.detail), { entry });
    return entry;
  }
}

module.exports = { VDisk, OPS, checkPath, LIMITS };
