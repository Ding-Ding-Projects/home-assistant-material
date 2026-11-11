'use strict';
// Installs what the app needs on Windows with Chocolatey, and installs Chocolatey first when it is
// missing. Everything runs as administrator through one UAC prompt per batch; the output is
// streamed back from a log file, and a cancelled prompt changes nothing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { run } = require('./util');

// What each part of the app needs, as Chocolatey package names.
const PACKAGES = {
  docker: { pkg: 'docker-desktop', name: 'Docker Desktop', check: ['docker', ['--version']], note: 'Docker Desktop asks you to sign out and in once, and to accept its own terms when it first starts.' },
  virtualbox: { pkg: 'virtualbox', name: 'VirtualBox', check: ['VBoxManage', ['--version']] },
  vmware: { pkg: 'vmwareworkstation', name: 'VMware Workstation', check: ['vmrun', []] },
  java: { pkg: 'temurin21', name: 'Java 21 (Eclipse Temurin)', check: ['java', ['-version']] },
  java17: { pkg: 'temurin17', name: 'Java 17 (Eclipse Temurin)', check: null },
  java8: { pkg: 'temurin8', name: 'Java 8 (Eclipse Temurin)', check: null },
  git: { pkg: 'git', name: 'Git', check: ['git', ['--version']] },
  python: { pkg: 'python', name: 'Python 3', check: ['python', ['-c', 'import sys']] },
  node: { pkg: 'nodejs-lts', name: 'Node.js LTS with npm', check: ['node', ['--version']] },
  ollama: { pkg: 'ollama', name: 'Ollama', check: ['ollama', ['--version']] },
  vscode: { pkg: 'vscode', name: 'Visual Studio Code', check: ['code', ['--version']] },
  openssh: { pkg: 'openssh', name: 'OpenSSH client', check: ['ssh', ['-V']] }
};
const CHOCO = () => path.join(process.env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin', 'choco.exe');

class Choco extends EventEmitter {
  supported() { return process.platform === 'win32'; }
  async status() {
    if (!this.supported()) return { windows: false, choco: false, why: 'Chocolatey is for Windows. On ' + os.type() + ', install with the system package manager.' };
    const has = fs.existsSync(CHOCO()); let version = '';
    if (has) { const r = await run(CHOCO(), ['--version']).catch(() => ({ code: 1 })); version = (r.out || '').trim(); }
    const parts = {};
    for (const k of Object.keys(PACKAGES)) { const p = PACKAGES[k]; if (!p.check) continue; const r = await run(p.check[0], p.check[1], { timeout: 15000 }).catch(() => ({ code: 1 })); parts[k] = r.code === 0 || (k === 'vmware' && r.code !== 1 && r.code != null) ? 'present' : 'missing'; }
    return { windows: true, choco: has, version, parts };
  }
  // keys: entries of PACKAGES. Only missing ones are installed; nothing is downgraded or removed.
  async install(keys, { upgrade = false } = {}) {
    if (!this.supported()) throw new Error('Chocolatey is for Windows.');
    const list = [...new Set(keys)].map((k) => { if (!PACKAGES[k]) throw new Error('Unknown part: ' + k); return PACKAGES[k]; });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-choco-')); const log = path.join(dir, 'log.txt'); const done = path.join(dir, 'done.json'); const script = path.join(dir, 'install.ps1');
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    fs.writeFileSync(script, [
      '$ErrorActionPreference = "Stop"', '$results = @()',
      'try {',
      '  if (-not (Test-Path ' + q(CHOCO()) + ')) {',
      '    "Installing Chocolatey from community.chocolatey.org"',
      '    Set-ExecutionPolicy Bypass -Scope Process -Force',
      '    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072',
      "    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))",
      '  }',
      ...list.map((p) => '  "== ' + p.name + ' (' + p.pkg + ')"; & ' + q(CHOCO()) + ' ' + (upgrade ? 'upgrade' : 'install') + ' ' + p.pkg + ' -y --no-progress; $results += @{ pkg = ' + q(p.pkg) + '; code = $LASTEXITCODE }'),
      '  @{ ok = $true; results = $results } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ' + q(done) + ' -Encoding UTF8',
      '} catch { @{ ok = $false; error = $_.Exception.Message; results = $results } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ' + q(done) + ' -Encoding UTF8 }'
    ].join('\r\n'), 'utf8');
    let pos = 0; const tail = setInterval(() => { try { const b = fs.readFileSync(log); if (b.length > pos) { b.subarray(pos).toString('utf8').split(/\r?\n/).filter((l) => l.trim()).forEach((l) => this.emit('line', l.replace(/\u0000/g, ''))); pos = b.length; } } catch { /* not yet written */ } }, 700);
    const r = await run('powershell', ['-NoProfile', '-Command', "try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command','& ''" + script.replace(/'/g, "''") + "'' *> ''" + log.replace(/'/g, "''") + "''') } catch { exit 5 }"], { timeout: 3 * 3600e3 });
    clearInterval(tail);
    let res = null; try { res = JSON.parse(fs.readFileSync(done, 'utf8').replace(/^\uFEFF/, '')); } catch { res = null; }
    fs.rmSync(dir, { recursive: true, force: true });
    if (r.code === 5 || !res) throw new Error(r.code === 5 ? 'The administrator prompt was cancelled. Nothing was installed.' : 'Chocolatey gave no result. Nothing is assumed to be installed.');
    const results = [].concat(res.results || []).map((x) => ({ pkg: x.pkg, ok: [0, 1641, 3010].includes(x.code), reboot: [1641, 3010].includes(x.code), code: x.code }));
    if (!res.ok) throw new Error('Chocolatey stopped: ' + res.error);
    const after = await this.status();
    return { results, after, reboot: results.some((x) => x.reboot) };
  }
}

module.exports = { Choco, PACKAGES };
