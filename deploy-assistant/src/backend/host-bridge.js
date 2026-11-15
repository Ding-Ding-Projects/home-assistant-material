'use strict';
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { BridgeAuthority } = require('./host-bridge-authority');
const { MAX_BYTES, fail } = require('./backup-archive');

async function jsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail('invalid_content_type');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 32768) throw fail('request_too_large'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid_json'); }
}
class HostBridge {
  constructor(manager, uploads, jobs, safeStorage, { nativePairing } = {}) {
    this.manager = manager; this.uploads = uploads; this.jobs = jobs; this.authority = new BridgeAuthority(manager.dir, safeStorage); this.nativePairing = nativePairing; this.server = null; this.bind = null;
  }
  status() { return { version: 1, state: !this.authority.available() ? 'secure_storage_unavailable' : this.server ? 'available' : 'disabled', certificate_fingerprint: this.authority.fingerprint(), address: this.bind, capabilities: { targets: ['docker', 'ssh', 'virtualbox', 'vmware', 'pi'], archive_formats: ['tar', 'zip'], automation_state: 'original', max_upload_bytes: MAX_BYTES, native_pairing_required: true } }; }
  async authenticatedStatus() {
    if (!this.capabilityCache || Date.now() - this.capabilityCache.at > 30000) {
      this.capabilityCache = { at: Date.now(), promise: Promise.all(['docker', 'virtualbox', 'vmware'].map(async (target) => {
        if (target !== 'docker' && this.manager.backupBootstrap && !this.manager.backupBootstrap.available) return [target, { available: false, reason: this.manager.backupBootstrap.reason }];
        let timeout;
        const check = await Promise.race([this.manager.check(target), new Promise((resolve) => { timeout = setTimeout(() => resolve({ ok: false }), 5000); })]).finally(() => clearTimeout(timeout));
        return [target, check.ok ? { available: true } : { available: false, reason: 'setup_required' }];
      })).then((entries) => Object.fromEntries([...entries, ['ssh', { available: false, reason: 'saved_host_required' }], ['pi', { available: false, reason: 'hardware_required' }]])) };
    }
    const status = this.status(); status.capabilities.target_status = await this.capabilityCache.promise; return status;
  }
  async enable({ address, port = 48321 } = {}) {
    if (this.server) return this.status();
    if (!net.isIPv4(address) || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address) || !Number.isInteger(port) || port < 1024 || port > 65535) throw fail('private_lan_address_required');
    const certificates = await this.authority.initialize();
    const server = https.createServer({ ...certificates, minVersion: 'TLSv1.2', requestTimeout: 3600000, headersTimeout: 15000 }, (req, res) => this.route(req, res).catch((e) => {
      if (res.headersSent) { res.destroy(); return; }
      this.reply(res, e.code === 'unauthorized' ? 401 : 400, { code: ['unauthorized', 'upload_expired', 'invalid_request', 'pairing_expired', 'idempotency_conflict'].includes(e.code) ? e.code : 'request_failed' });
    }));
    server.maxConnections = 16;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, address, resolve); });
    this.server = server; this.bind = 'https://' + address + ':' + port; return this.status();
  }
  reply(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); }
  owns(job, owner) { if (!job || job.owner !== owner) throw fail('unauthorized'); return job; }
  async route(req, res) {
    // Browsers cannot use the host authority, including authenticated cross-origin pages.
    if (req.headers.origin || req.headers['sec-fetch-site']) throw fail('unauthorized');
    const url = new URL(req.url, this.bind);
    if (url.search) throw fail('invalid_request');
    if (req.method === 'GET' && url.pathname === '/v1/status') {
      if (req.headers.authorization) { this.authority.authenticate(req.headers); this.reply(res, 200, await this.authenticatedStatus()); }
      else this.reply(res, 200, { version: 1, state: 'pairing_required', certificate_fingerprint: this.authority.fingerprint() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/pair') {
      const pending = this.authority.begin(await jsonBody(req)); this.reply(res, 202, pending);
      if (this.nativePairing) Promise.resolve(this.nativePairing(pending)).then((approved) => this.authority.approve(pending.pairing_id, approved === true)).catch(() => {});
      return;
    }
    const pair = /^\/v1\/pair\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (req.method === 'GET' && pair) { this.reply(res, 200, this.authority.poll(pair[1], req.headers['x-pairing-challenge'])); return; }
    const owner = this.authority.authenticate(req.headers);
    if (req.method === 'GET' && url.pathname === '/v1/capabilities') { this.reply(res, 200, (await this.authenticatedStatus()).capabilities); return; }
    if (req.method === 'POST' && url.pathname === '/v1/uploads') {
      const size = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES || !['application/x-tar', 'application/zip', 'application/octet-stream'].includes(req.headers['content-type'])) throw fail('invalid_upload');
      const filename = req.headers['x-upload-name'] || 'backup.tar';
      if (typeof filename !== 'string' || !/^[A-Za-z0-9 _().-]{1,150}$/.test(filename)) throw fail('invalid_upload');
      this.uploads.cleanupExpired();
      const reservation = this.uploads.capacity.reserve(owner, size);
      const staging = path.join(this.uploads.dir, 'incoming-' + crypto.randomUUID());
      let bytes = 0;
      try {
        await pipeline(req, new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; cb(bytes > size ? fail('invalid_upload') : null, chunk); } }), fs.createWriteStream(staging, { flags: 'wx', mode: 0o600 }));
        if (bytes !== size) throw fail('invalid_upload');
        const metadata = await this.uploads.pick(staging, { owner, reservation }); const item = this.uploads.resolve(metadata.upload_handle); item.name = filename; metadata.name = filename; this.uploads.persist(item);
        this.reply(res, 201, metadata);
      } finally { await fs.promises.unlink(staging).catch(() => {}); reservation.release(); }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/jobs') {
      const input = await jsonBody(req); const upload = this.uploads.resolve(input.upload_handle);
      if (upload.owner !== owner) throw fail('unauthorized');
      const existing = this.jobs.jobs.find((j) => j.request_id === input.request_id);
      if (existing && existing.owner !== owner) throw fail('unauthorized');
      const job = this.jobs.start(input, { owner }); this.reply(res, 202, job); return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/jobs') { this.reply(res, 200, { jobs: this.jobs.jobs.filter((j) => j.owner === owner).map((j) => this.jobs.public(j)) }); return; }
    const match = /^\/v1\/jobs\/([a-f0-9-]{36})(\/cancel)?$/.exec(url.pathname);
    if (match) {
      const job = this.owns(this.jobs.jobs.find((j) => j.id === match[1]), owner);
      if (req.method === 'GET' && !match[2]) { this.reply(res, 200, this.jobs.public(job)); return; }
      if (req.method === 'POST' && match[2]) { this.reply(res, 200, this.jobs.cancel(job.id)); return; }
    }
    this.reply(res, 404, { code: 'not_found' });
  }
  async close() { if (!this.server) return; await new Promise((resolve) => this.server.close(resolve)); this.server = null; this.bind = null; }
}
module.exports = { HostBridge, jsonBody };
