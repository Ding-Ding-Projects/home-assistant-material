'use strict';
// Private, job-owned appliance preparation. Never accepts renderer-selected file paths.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const net = require('node:net');
const selfsigned = require('selfsigned');
const { run, sha256File } = require('./util');
const { fail } = require('./backup-archive');

const JOB = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const IMAGE = /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
function localAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return net.isIP(address) === 6 && (address === '::1' || /^(fc|fd|fe[89ab])/i.test(address));
}
function inside(root, file) {
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}
function storageAvailable(storage) {
  return storage?.isEncryptionAvailable() && (!storage.getSelectedStorageBackend || storage.getSelectedStorageBackend() !== 'basic_text');
}
class BootstrapImageService {
  constructor({ rootDir, cacheDir, safeStorage, helperImage, execute = run }) {
    this.rootDir = rootDir; this.cacheDir = cacheDir; this.storage = safeStorage;
    this.helperImage = helperImage; this.execute = execute;
  }
  async prepare({ jobId, image, format }) {
    if (!JOB.test(jobId) || !['raw', 'vdi', 'vmdk'].includes(format)) throw fail('invalid_bootstrap_request');
    if (!IMAGE.test(this.helperImage || '')) throw fail('bootstrap_helper_not_pinned');
    if (!storageAvailable(this.storage)) throw fail('secure_storage_unavailable');
    if (!image?.file || !inside(this.cacheDir, image.file) || !/^haos_[A-Za-z0-9._-]+\.(ova|img\.xz|vdi\.zip)$/.test(path.basename(image.file))) throw fail('bootstrap_image_not_verified');
    const expected = fs.readFileSync(image.file + '.verified', 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(expected) || await sha256File(image.file) !== expected) throw fail('bootstrap_image_not_verified');
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
    const jobDir = path.join(this.rootDir, jobId);
    fs.mkdirSync(jobDir, { mode: 0o700 }); // exclusive ownership, never reuse an existing job
    if (!inside(this.rootDir, jobDir)) throw fail('bootstrap_path_invalid');
    const work = path.join(jobDir, 'bootstrap'); fs.mkdirSync(work, { mode: 0o700 });
    const servername = 'backup-' + jobId + '.invalid';
    const identity = await selfsigned.generate([{ name: 'commonName', value: servername }], {
      algorithm: 'sha256', keySize: 2048, days: 30,
      extensions: [{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true }, { name: 'extKeyUsage', serverAuth: true }, { name: 'subjectAltName', altNames: [{ type: 2, value: servername }] }],
    });
    const fingerprint = new crypto.X509Certificate(identity.cert).fingerprint256;
    const transport = { ca: identity.cert, certificate_fingerprint: fingerprint, fingerprint256: fingerprint, servername };
    // The key is encrypted on the host; plaintext travels only on the helper's stdin.
    fs.writeFileSync(path.join(jobDir, 'bootstrap-identity.enc'), this.storage.encryptString(JSON.stringify({ version: 1, jobId, key: identity.private, cert: identity.cert })), { mode: 0o600, flag: 'wx' });
    const request = JSON.stringify({ version: 1, jobId, source: path.basename(image.file), sourceSha256: expected, format, key: identity.private, cert: identity.cert });
    const result = await this.execute('docker', ['run', '--rm', '--network=none', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only', '--memory=1g', '--cpus=2', '--pids-limit=64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--mount', 'type=bind,src=' + fs.realpathSync(image.file) + ',dst=/input/base,readonly', '--mount', 'type=bind,src=' + fs.realpathSync(work) + ',dst=/output', '-i', this.helperImage], { input: request, timeout: 60 * 60000 });
    if (result.code !== 0) throw fail('bootstrap_image_preparation_failed'); // helper output must not disclose private values
    const file = path.join(work, 'appliance.' + (format === 'raw' ? 'img' : format));
    if (!fs.existsSync(file) || !inside(work, file) || !fs.statSync(file).isFile()) throw fail('bootstrap_image_missing');
    if (await sha256File(image.file) !== expected) throw fail('bootstrap_source_changed');
    const prepared = { file, sha256: await sha256File(file), format };
    const receipt = { version: 1, jobId, sourceSha256: expected, imageSha256: prepared.sha256, format, certificate_fingerprint: fingerprint, servername, port: 8123, identityKind: 'job-owned-media-certificate' };
    fs.writeFileSync(path.join(jobDir, 'bootstrap-receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    return { image: prepared, transport, identity: { jobId, kind: receipt.identityKind } };
  }
}

// Candidate addresses come from the owned VM or an explicitly selected LAN. No discovery scan.
function verifyCandidate(address, transport, { timeout = 4000 } = {}) {
  if (!localAddress(address) || !transport?.ca || !transport?.servername || !transport?.certificate_fingerprint) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const req = https.get({ hostname: address, port: 8123, path: '/api/onboarding', ca: transport.ca, servername: transport.servername, rejectUnauthorized: true, timeout, agent: false,
      checkServerIdentity: (name, cert) => {
        const error = require('node:tls').checkServerIdentity(name, cert);
        if (error) return error;
        if (cert.fingerprint256 !== transport.certificate_fingerprint) return new Error('Bootstrap identity mismatch');
      },
    }, (res) => { res.resume(); done(res.statusCode === 200 ? 'https://' + (net.isIP(address) === 6 ? '[' + address + ']' : address) + ':8123/' : null); });
    req.on('error', () => done(null)); req.on('timeout', () => { req.destroy(); done(null); });
  });
}
async function waitForOwnedAppliance({ candidates, transport, timeoutMs = 30 * 60000, onWaiting = () => {}, signal }) {
  if (typeof candidates !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60 * 60000) throw fail('invalid_bootstrap_discovery');
  const end = Date.now() + timeoutMs;
  do {
    if (signal?.aborted) throw fail('bootstrap_cancelled');
    const addresses = [...new Set(await candidates())];
    if (addresses.length > 16 || addresses.some((address) => !localAddress(address))) throw fail('bootstrap_candidates_invalid');
    for (const address of addresses) {
      const url = await verifyCandidate(address, transport);
      if (url) return { url, transport, identity: 'job-owned-media-certificate' };
    }
    onWaiting('waiting_for_identity');
    if (Date.now() >= end) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, end - Date.now())));
  } while (Date.now() < end);
  return null;
}
module.exports = { BootstrapImageService, verifyCandidate, waitForOwnedAppliance, inside, storageAvailable, localAddress };
