'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sha256File } = require('./util');
const { fail } = require('./backup-archive');

function bootstrapService({ rootDir, cacheDir, safeStorage, descriptorFile = path.join(__dirname, 'backup-bootstrap-image.json'), Service }) {
  let descriptor;
  try { descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8')); }
  catch { return { available: false, reason: 'bootstrap_helper_unavailable', prepare: async () => { throw fail('bootstrap_helper_unavailable'); } }; }
  if (!descriptor || Object.keys(descriptor).length !== 1 || typeof descriptor.image !== 'string' || !/^ghcr\.io\/ding-ding-projects\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(descriptor.image)) return { available: false, reason: 'bootstrap_helper_not_pinned', prepare: async () => { throw fail('bootstrap_helper_not_pinned'); } };
  if (!safeStorage?.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') return { available: false, reason: 'secure_storage_unavailable', prepare: async () => { throw fail('secure_storage_unavailable'); } };
  let service;
  try { const Bootstrap = Service || require('./backup-bootstrap').BootstrapImageService; service = new Bootstrap({ rootDir, cacheDir, safeStorage, helperImage: descriptor.image }); }
  catch { return { available: false, reason: 'bootstrap_service_unavailable', prepare: async () => { throw fail('bootstrap_service_unavailable'); } }; }
  const prepare = async (input) => {
    if (!/^[a-f0-9-]{36}$/.test(input.jobId || '') || !['raw', 'vdi', 'vmdk'].includes(input.format)) return service.prepare(input);
    const jobDir = path.join(rootDir, input.jobId); const receiptFile = path.join(jobDir, 'bootstrap-receipt.json');
    if (!fs.existsSync(receiptFile)) return service.prepare(input);
    if (fs.statSync(receiptFile).size > 65536) throw fail('bootstrap_receipt_invalid');
    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    const imageFile = path.join(jobDir, 'bootstrap', 'appliance.' + (input.format === 'raw' ? 'img' : input.format));
    if (receipt.jobId !== input.jobId || receipt.format !== input.format || !/^[a-f0-9]{64}$/.test(receipt.imageSha256 || '') || fs.realpathSync(imageFile) !== path.resolve(imageFile) || await sha256File(imageFile) !== receipt.imageSha256 || await sha256File(input.image.file) !== receipt.sourceSha256) throw fail('bootstrap_receipt_invalid');
    const encrypted = fs.readFileSync(path.join(jobDir, 'bootstrap-identity.enc'));
    const identity = JSON.parse(safeStorage.decryptString(encrypted));
    const fingerprint = new crypto.X509Certificate(identity.cert).fingerprint256;
    if (identity.jobId !== input.jobId || fingerprint !== receipt.certificate_fingerprint || receipt.servername !== 'backup-' + input.jobId + '.invalid') throw fail('bootstrap_receipt_invalid');
    return { image: { file: imageFile, sha256: receipt.imageSha256, format: input.format }, transport: { ca: identity.cert, certificate_fingerprint: fingerprint, fingerprint256: fingerprint, servername: receipt.servername }, identity: { jobId: input.jobId, kind: 'job-owned-media-certificate' } };
  };
  return { available: true, prepare };
}
module.exports = { bootstrapService };
