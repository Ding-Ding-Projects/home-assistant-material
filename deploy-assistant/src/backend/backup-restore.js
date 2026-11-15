'use strict';
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const tls = require('node:tls');
const net = require('node:net');
const dns = require('node:dns').promises;
const { performance } = require('node:perf_hooks');
const { once } = require('node:events');
const { fail } = require('./backup-archive');
const privateAddress = (address) => net.isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

async function lanOrigin(value, { lookup = dns.lookup } = {}) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw fail('invalid_target_address');
  let addresses;
  if (net.isIP(url.hostname)) addresses = [{ address: url.hostname }];
  else {
    let timeout;
    try { addresses = await Promise.race([lookup(url.hostname, { all: true, family: 4 }), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(fail('lan_address_unavailable')), 5000); })]); }
    finally { clearTimeout(timeout); }
  }
  if (!addresses.length || addresses.some((entry) => !privateAddress(entry.address))) throw fail('lan_address_unavailable');
  url.hostname = addresses[0].address; return url.href;
}
function coreManifest(value) { return value && typeof value.name === 'string' && typeof value.short_name === 'string' && value.start_url === '/?homescreen=1' && value.id === '/?homescreen=1' && Array.isArray(value.icons) && value.icons.length > 0; }

function targetUrl(base, { certificate_fingerprint, fingerprint256, allowLanProbe = false } = {}) {
  const u = new URL(base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw fail('invalid_target_address');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  const privateV4 = net.isIPv4(u.hostname) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  if (u.protocol === 'http:' && !loopback && !(allowLanProbe && privateV4)) throw fail('encrypted_restore_transport_required');
  if (u.protocol === 'https:' && !/^[a-f0-9]{64}$/i.test((certificate_fingerprint || fingerprint256 || '').replaceAll(':', ''))) throw fail('verified_tls_pin_required');
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
  return u;
}
function request(base, route, { method = 'GET', headers = {}, body, file, prefix, suffix, signal, transport = {}, allowLanProbe = false } = {}) {
  const probe = allowLanProbe && method === 'GET' && route === '/manifest.json' && !body && !file && Object.keys(headers).length === 0;
  const url = new URL(route, targetUrl(base, { ...transport, allowLanProbe: probe }));
  return new Promise((resolve, reject) => {
    if (transport.servername && !/^[a-z0-9-]{1,63}\.invalid$/.test(transport.servername)) { reject(fail('invalid_tls_identity')); return; }
    const secure = url.protocol === 'https:' ? { ...(transport.ca ? { ca: transport.ca } : {}), ...(transport.servername ? { servername: transport.servername } : {}), checkServerIdentity: (host, certificate) => {
      const identityError = tls.checkServerIdentity(host, certificate); if (identityError) return identityError;
      const actual = crypto.createHash('sha256').update(certificate.raw).digest('hex');
      if (actual !== (transport.certificate_fingerprint || transport.fingerprint256).replaceAll(':', '').toLowerCase()) return fail('target_certificate_changed');
      return undefined;
    } } : {};
    const req = (url.protocol === 'https:' ? https : http).request(url, { method, headers, signal, ...secure, timeout: file ? 3600000 : 15000 }, (res) => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; if (text.length > 1024 * 1024) res.destroy(fail('response_too_large')); });
      res.on('error', reject);
      res.on('end', () => {
        const responseError = (code) => Object.assign(fail(code), { statusCode: res.statusCode });
        let value = {}; try { if (text) value = JSON.parse(text); } catch { if (res.statusCode < 400) { reject(responseError('invalid_target_response')); return; } }
        if (res.statusCode === 401 || res.statusCode === 403) { reject(responseError('authentication_needed')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(responseError(['incorrect_password', 'backup_version_too_new', 'backup_no_core_archive', 'restore_failed'].includes(value.code) ? value.code : 'target_request_failed')); return; }
        resolve(value);
      });
    });
    req.on('timeout', () => req.destroy(fail('target_timeout'))); req.on('error', reject);
    if (file) {
      (async () => {
        req.write(prefix);
        for await (const chunk of fs.createReadStream(file)) { if (!req.write(chunk)) await once(req, 'drain'); }
        req.end(suffix);
      })().catch((e) => req.destroy(e));
    } else req.end(body);
  });
}

async function upload(base, file, agentId, signal, transport) {
  const boundary = 'ham-' + crypto.randomBytes(24).toString('hex');
  const prefix = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="backup.tar"\r\nContent-Type: application/x-tar\r\n\r\n');
  const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
  return request(base, '/api/onboarding/backup/upload?agent_id=' + encodeURIComponent(agentId), { method: 'POST', signal, transport, file, prefix, suffix, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': prefix.length + fs.statSync(file).size + suffix.length } });
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(fail('cancelled')); return; }
    const abort = () => { clearTimeout(timer); reject(fail('cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
const startupError = (error) => ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'EPIPE', 'target_timeout', 'invalid_target_response'].includes(error.code) || [401, 404, 503].includes(error.statusCode);

async function waitForFreshOnboarding({ base, transport = {}, signal, api = request, timeoutMs = 15 * 60000, intervalMs = 3000, now = () => performance.now(), sleep = delay, onWaiting = () => {} }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 30 * 60000 || !Number.isFinite(intervalMs) || intervalMs < 1) throw fail('invalid_onboarding_wait');
  const identity = Object.freeze({ ...transport }); const origin = targetUrl(base, identity).href; const end = now() + timeoutMs;
  const get = async (route) => {
    if (signal?.aborted) throw fail('cancelled');
    const left = end - now(); if (left <= 0) throw fail('onboarding_not_ready');
    const controller = new AbortController(); const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.min(15000, left));
    try {
      const result = await api(origin, route, { method: 'GET', signal: controller.signal, transport: identity });
      if (signal?.aborted) throw fail('cancelled');
      if (now() >= end) throw fail('onboarding_not_ready');
      return result;
    }
    catch (error) {
      if (signal?.aborted) throw fail('cancelled');
      if (controller.signal.aborted) throw fail(now() >= end ? 'onboarding_not_ready' : 'target_timeout');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
  while (now() < end) {
    if (signal?.aborted) throw fail('cancelled');
    onWaiting();
    try {
      const info = await get('/api/onboarding/backup/info');
      if (info && Array.isArray(info.backups)) return info;
      throw fail('invalid_target_response');
    } catch (error) {
      if (!startupError(error)) throw error;
      // A configured Core also closes the first-run API. Never treat it as a fresh target.
      let fresh = false;
      try {
        const steps = await get('/api/onboarding');
        const user = Array.isArray(steps) ? steps.find((step) => step?.step === 'user' && typeof step.done === 'boolean') : undefined;
        if (user?.done) throw fail('target_already_configured');
        fresh = user?.done === false;
      } catch (statusError) { if (!startupError(statusError)) throw statusError; }
      if (!fresh) {
        try { if (coreManifest(await get('/manifest.json'))) throw fail('target_already_configured'); }
        catch (manifestError) { if (!startupError(manifestError)) throw manifestError; }
      }
    }
    const remaining = end - now(); if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining), signal);
  }
  throw fail('onboarding_not_ready');
}

async function restoreHomeAssistantBackup({ base, file, password, journal, signal, transport = {}, agentId = 'hassio.local', api = request, uploadFile = upload, readiness = {} }) {
  // The caller supplies an independently provisioned, job-owned target, never the source.
  if (journal.phase === 'restore_submitted' || journal.phase === 'restore_accepted') return { reconciling: true };
  const identity = Object.freeze({ ...transport }); const origin = targetUrl(base, identity).href;
  await waitForFreshOnboarding({ ...readiness, base: origin, signal, transport: identity, api, onWaiting: () => journal.update({ state: 'running', phase: 'waiting_for_onboarding' }) });
  if (signal?.aborted) throw fail('cancelled');
  journal.update({ state: 'restoring', phase: journal.backup_id ? 'uploaded' : 'provisioned' });
  let backupId = journal.backup_id;
  if (!backupId) { const result = await uploadFile(origin, file, agentId, signal, identity); backupId = result.backup_id; if (typeof backupId !== 'string') throw fail('invalid_target_response'); journal.update({ backup_id: backupId, phase: 'uploaded' }); }
  if (signal?.aborted) throw fail('cancelled');
  const body = JSON.stringify({ backup_id: backupId, agent_id: agentId, ...(password ? { password } : {}), restore_database: true });
  // Persist before transmission. An uncertain response must be reconciled, never replayed.
  journal.update({ phase: 'restore_submitted' });
  try { await api(origin, '/api/onboarding/backup/restore', { method: 'POST', signal, transport: identity, headers: { 'Content-Type': 'application/json' }, body }); }
  catch (e) { if (['incorrect_password', 'backup_version_too_new', 'backup_no_core_archive', 'restore_failed', 'authentication_needed'].includes(e.code)) journal.update({ phase: 'restore_rejected', error_code: e.code }); throw e; }
  journal.update({ phase: 'restore_accepted', restore_accepted_at: new Date().toISOString() });
  return { accepted: true };
}
module.exports = { targetUrl, request, upload, restoreHomeAssistantBackup, lanOrigin, coreManifest, waitForFreshOnboarding };
