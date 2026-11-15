'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const selfsigned = require('selfsigned');
const { fail } = require('./backup-archive');

const validIdentity = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(s);
const digest = (s) => crypto.createHash('sha256').update(s).digest('hex');
class BridgeAuthority {
  constructor(dir, safeStorage, { now = Date.now } = {}) {
    this.file = path.join(dir, 'host-bridge-authority.enc'); this.storage = safeStorage; this.now = now; this.pending = new Map(); this.data = null;
  }
  available() { return this.storage && this.storage.isEncryptionAvailable() && (!this.storage.getSelectedStorageBackend || this.storage.getSelectedStorageBackend() !== 'basic_text'); }
  save() {
    if (!this.available()) throw fail('secure_storage_unavailable');
    const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, this.storage.encryptString(JSON.stringify(this.data)), { mode: 0o600 }); fs.renameSync(tmp, this.file);
  }
  async initialize() {
    if (!this.available()) throw fail('secure_storage_unavailable');
    try { this.data = JSON.parse(this.storage.decryptString(fs.readFileSync(this.file))); }
    catch (e) { if (e.code !== 'ENOENT') throw fail('authority_unavailable'); }
    if (!this.data) {
      const certificate = await selfsigned.generate([{ name: 'commonName', value: 'Home Assistant Material Host Bridge' }], { algorithm: 'sha256', keySize: 2048, days: 365, extensions: [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }, { name: 'extKeyUsage', serverAuth: true }] });
      this.data = { version: 1, key: certificate.private, cert: certificate.cert, clients: [] }; this.save();
    }
    if (this.data.version !== 1 || !Array.isArray(this.data.clients)) throw fail('authority_unavailable');
    return { key: this.data.key, cert: this.data.cert };
  }
  fingerprint() { return this.data ? new crypto.X509Certificate(this.data.cert).fingerprint256 : null; }
  begin({ core_instance_id, client_id, challenge }) {
    if (!validIdentity(core_instance_id) || !validIdentity(client_id) || typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(challenge)) throw fail('invalid_pairing_request');
    for (const [id, item] of this.pending) if (Date.parse(item.expires_at) <= this.now()) this.pending.delete(id);
    if (this.pending.size >= 10) throw fail('pairing_capacity');
    const pairing_id = crypto.randomUUID(); const item = { pairing_id, core_instance_id, client_id, challenge_hash: digest(challenge), expires_at: new Date(this.now() + 600000).toISOString(), state: 'pending_native_approval' };
    this.pending.set(pairing_id, item); return this.summary(item);
  }
  summary(item) { return { pairing_id: item.pairing_id, core_instance_id: item.core_instance_id, client_id: item.client_id, expires_at: item.expires_at, state: item.state, certificate_fingerprint: this.fingerprint() }; }
  approval(id) { const item = this.pending.get(id); if (!item || Date.parse(item.expires_at) <= this.now()) throw fail('pairing_expired'); return this.summary(item); }
  approve(id, approved) {
    const item = this.pending.get(id); this.approval(id);
    if (item.state !== 'pending_native_approval') throw fail('pairing_already_resolved');
    if (!approved) { item.state = 'rejected'; return this.summary(item); }
    item.credential = crypto.randomBytes(32).toString('base64url'); item.state = 'paired';
    this.data.clients = this.data.clients.filter((c) => !(c.client_id === item.client_id && c.core_instance_id === item.core_instance_id));
    this.data.clients.push({ client_id: item.client_id, core_instance_id: item.core_instance_id, credential_hash: digest(item.credential) }); this.save(); return this.summary(item);
  }
  poll(id, challenge) {
    const item = this.pending.get(id); this.approval(id);
    if (typeof challenge !== 'string' || digest(challenge) !== item.challenge_hash) throw fail('unauthorized');
    const result = this.summary(item);
    if (item.state === 'paired') { result.credential = item.credential; this.pending.delete(id); }
    return result;
  }
  authenticate(headers) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(headers.authorization || '');
    if (!match) throw fail('unauthorized');
    const client = this.data.clients.find((c) => c.client_id === headers['x-client-id'] && c.core_instance_id === headers['x-core-instance']);
    if (!client || !crypto.timingSafeEqual(Buffer.from(client.credential_hash, 'hex'), Buffer.from(digest(match[1]), 'hex'))) throw fail('unauthorized');
    return client.core_instance_id + ':' + client.client_id;
  }
}
module.exports = { BridgeAuthority, validIdentity };
