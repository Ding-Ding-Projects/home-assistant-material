'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { fail } = require('./backup-archive');
const { restoreHomeAssistantBackup, request, lanOrigin, coreManifest } = require('./backup-restore');
const { lanAddress } = require('./util');
const { discoverPi, validateAddresses } = require('./backup-appliance-discovery');

const TERMINAL = new Set(['ready', 'cancelled']);
const JOB_LIMITS = { active: 2, activePerOwner: 1, outstanding: 16, outstandingPerOwner: 4, history: 256 };
class BackupJobs extends EventEmitter {
  constructor(manager, uploads, { restore = restoreHomeAssistantBackup, probe = request, prepareBootstrap } = {}) {
    super(); this.manager = manager; this.uploads = uploads; this.restore = restore; this.probe = probe; this.prepareBootstrap = prepareBootstrap; this.piApprovals = new Map(); this.queue = new Map();
    this.file = path.join(manager.dir, 'backup-host-jobs.json'); this.running = new Map();
    this.jobs = [];
    try { const db = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (db.version !== 1 || !Array.isArray(db.jobs)) throw fail('invalid_job_journal'); this.jobs = db.jobs; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const job of this.jobs) if (!TERMINAL.has(job.state)) { job.state = 'needs_resume'; job.error_code = 'application_restarted'; }
    this.save();
    uploads.references = () => new Set(this.jobs.filter((job) => !TERMINAL.has(job.state)).map((job) => job.upload_handle));
  }
  save() { const temp = this.file + '.tmp'; fs.writeFileSync(temp, JSON.stringify({ version: 1, jobs: this.jobs }), { mode: 0o600 }); fs.renameSync(temp, this.file); }
  public(job) { const { id, request_id, upload_handle, state, phase, target, instance_id, lan_url, lan_url_verified, lan_url_verified_at, error_code, updated_at } = job; return { id, request_id, upload_handle, host_id: job.options?.hostId, can_resume: job.owner === 'native' && ['needs_resume', 'needs_attention'].includes(state), state, phase, target, instance_id, lan_url, lan_url_verified, lan_url_verified_at, error_code, updated_at }; }
  list() { return { jobs: this.jobs.map((j) => this.public(j)) }; }
  update(job, patch) { Object.assign(job, patch, { updated_at: new Date().toISOString() }); this.save(); this.emit('changed', this.public(job)); }
  start(input, { owner = 'native' } = {}) {
    if (!input || !/^[A-Za-z0-9_-]{8,100}$/.test(input.request_id || '') || !['docker', 'ssh', 'virtualbox', 'vmware', 'pi'].includes(input.target)) throw fail('invalid_request');
    if (input.password !== undefined && (typeof input.password !== 'string' || input.password.length > 16384)) throw fail('invalid_password');
    if (input.options !== undefined && (!input.options || typeof input.options !== 'object' || Array.isArray(input.options))) throw fail('invalid_options');
    if (input.options && 'port' in input.options) {
      if (!['docker', 'ssh', 'virtualbox'].includes(input.target)) throw fail('unsupported_option');
      if (!Number.isInteger(input.options.port) || input.options.port < 1 || input.options.port > 65535) throw fail('invalid_port');
    }
    if (input.options && 'tag' in input.options) {
      if (!['docker', 'ssh'].includes(input.target)) throw fail('unsupported_option');
      if (typeof input.options.tag !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(input.options.tag)) throw fail('invalid_tag');
    }
    const previous = this.jobs.find((j) => j.request_id === input.request_id);
    if (previous) {
      if (previous.owner !== owner) throw fail('unauthorized');
      if (previous.target !== input.target || previous.upload_handle !== input.upload_handle || ['name', 'hostId', 'memoryMb', 'cpus', 'diskGb', 'model', 'port', 'tag'].some((key) => input.options && key in input.options && input.options[key] !== previous.options[key])) throw fail('idempotency_conflict');
      if (input.options?.pi_addresses !== undefined) {
        if (previous.target !== 'pi' || !['waiting_for_boot', 'pending'].includes(previous.phase)) throw fail('idempotency_conflict');
        previous.options.pi_addresses = validateAddresses(input.options.pi_addresses); this.save();
      }
      if (!TERMINAL.has(previous.state) && !this.running.has(previous.id)) this.enqueue(previous, input.password); return this.public(previous);
    }
    const outstanding = this.jobs.filter((job) => !TERMINAL.has(job.state));
    if (this.jobs.length >= JOB_LIMITS.history || outstanding.length >= JOB_LIMITS.outstanding || outstanding.filter((job) => job.owner === owner).length >= JOB_LIMITS.outstandingPerOwner) throw fail('job_capacity');
    if (outstanding.some((job) => job.owner === owner && job.upload_handle === input.upload_handle)) throw fail('upload_job_exists');
    this.uploads.resolve(input.upload_handle);
    const allowed = ['name', 'hostId', 'memoryMb', 'cpus', 'diskGb', 'model', 'pi_addresses', 'port', 'tag'];
    const options = Object.fromEntries(allowed.filter((k) => input.options && k in input.options).map((k) => [k, input.options[k]]));
    if ('name' in options && (typeof options.name !== 'string' || options.name.length > 60 || /[\x00-\x1f]/.test(options.name))) throw fail('invalid_options');
    if ('hostId' in options && (typeof options.hostId !== 'string' || !this.manager.db.hosts.some((host) => host.id === options.hostId))) throw fail('invalid_host');
    for (const [key, minimum, maximum] of [['memoryMb', 2048, 65536], ['cpus', 1, 32], ['diskGb', 0, 2048]]) if (key in options && (!Number.isInteger(options[key]) || options[key] < minimum || options[key] > maximum)) throw fail('invalid_options');
    if ('model' in options && !['rpi3', 'rpi4', 'rpi5'].includes(options.model)) throw fail('invalid_pi_model');
    if ('pi_addresses' in options) options.pi_addresses = validateAddresses(options.pi_addresses);
    const job = { id: crypto.randomUUID(), owner, request_id: input.request_id, target: input.target, upload_handle: input.upload_handle, options, state: 'queued', phase: 'pending', created_at: new Date().toISOString() };
    this.jobs.push(job); this.update(job, {}); this.enqueue(job, input.password); return this.public(job);
  }
  enqueue(job, password) { this.queue.set(job.id, password); this.update(job, { state: 'queued' }); this.drain(); }
  drain() {
    for (const [id, password] of this.queue) {
      if (this.running.size >= JOB_LIMITS.active) return;
      const job = this.jobs.find((j) => j.id === id);
      const activeForOwner = [...this.running.keys()].filter((key) => this.jobs.find((j) => j.id === key)?.owner === job.owner).length;
      if (activeForOwner >= JOB_LIMITS.activePerOwner) continue;
      this.queue.delete(id); this.launch(job, password);
    }
  }
  launch(job, password) {
    const controller = new AbortController(); this.running.set(job.id, controller);
    this.execute(job, password, controller.signal).catch((e) => this.update(job, { state: controller.signal.aborted ? 'cancelled' : 'needs_attention', error_code: typeof e.code === 'string' && /^[a-z0-9_]{1,80}$/.test(e.code) ? e.code : 'hosting_failed' })).finally(() => {
      if (controller.signal.aborted && job.state === 'cancelling') this.update(job, { state: 'cancelled', error_code: 'cancelled' });
      this.running.delete(job.id); this.drain();
    });
  }
  cancel(id) { const job = this.jobs.find((j) => j.id === id); if (!job) throw fail('job_not_found'); if (job.phase === 'restore_submitted' || job.phase === 'restore_accepted') throw fail('restore_cannot_cancel'); if (job.phase === 'card_write_started') throw fail('write_cannot_cancel'); const running = this.running.get(id); this.queue.delete(id); running?.abort(); this.update(job, { state: running ? 'cancelling' : 'cancelled' }); return this.public(job); }
  async execute(job, password, signal) {
    const manager = this.manager;
    const item = this.uploads.handles.get(job.upload_handle);
    if (!item) throw fail('upload_unavailable');
    const adapter = manager.target(job.target);
    if (job.target === 'pi') {
      const writer = require('./pi-writer');
      if (!job.instance_id) {
        const recovered = manager.db.instances.find((instance) => instance.id === 'backup-' + job.id && instance.hostingJobId === job.id && instance.state === 'waiting_for_boot');
        if (recovered) this.update(job, { instance_id: recovered.id, phase: 'waiting_for_boot', state: 'waiting_for_boot' });
      }
      if (!job.instance_id) {
        if (job.phase === 'card_write_started') throw fail('card_write_reconciliation_required');
        const approval = this.piApprovals.get(job.request_id);
        if (!approval) { this.update(job, { state: 'waiting_for_hardware', error_code: 'native_drive_confirmation_required' }); return; }
        this.piApprovals.delete(job.request_id);
        const kind = require('./images').KINDS[job.options.model];
        if (!kind || !/^rpi/.test(job.options.model)) throw fail('invalid_pi_model');
        const image = await require('./images').fetchImage(kind.re, manager.cacheDir(), () => {}, () => {});
        if (!fs.existsSync(image.file + '.verified')) throw fail('image_verification_required');
        const recordedHash = fs.readFileSync(image.file + '.verified', 'utf8').trim();
        if (!/^[a-f0-9]{64}$/.test(recordedHash) || await require('./util').sha256File(image.file) !== recordedHash) throw fail('image_verification_failed');
        if (signal.aborted) throw fail('cancelled');
        if (!this.prepareBootstrap) throw fail('bootstrap_helper_unavailable');
        this.update(job, { phase: 'preparing_image', state: 'running' });
        const prepared = await this.prepareBootstrap({ jobId: job.id, image, format: 'raw' });
        this.update(job, { bootstrap_transport: prepared.transport, prepared_image: prepared.image, phase: 'image_prepared' });
        if (signal.aborted) throw fail('cancelled');
        await writer.write({ image: image.file, drive: approval, prepareImage: async () => { if (signal.aborted) throw fail('cancelled'); this.update(job, { phase: 'card_write_started', state: 'writing_card' }); return prepared; }, onProgress: (p) => this.emit('progress', { id: job.id, phase: p.state }), log: () => {} });
        const id = 'backup-' + job.id;
        manager.db.instances.push({ id, slug: id, name: job.options.name || 'Restored Home Assistant', target: 'pi', hostingJobId: job.id, port: 8123, restoreTransport: prepared.transport, backups: [], backupsOn: false, state: 'waiting_for_boot', dir: path.join(manager.dir, 'instances', id), url: '' }); manager.save();
        this.update(job, { instance_id: id, phase: 'waiting_for_boot', state: 'waiting_for_boot' });
      }
      if (job.phase === 'waiting_for_boot') {
        const instance = manager.get(job.instance_id);
        const found = await discoverPi({ addresses: job.options.pi_addresses || [], transport: instance.restoreTransport || job.bootstrap_transport, signal, onWaiting: () => this.update(job, { state: 'waiting_for_boot', error_code: 'verified_hardware_identity_required' }) });
        if (signal.aborted) throw fail('cancelled');
        if (!found) { this.update(job, { state: 'waiting_for_boot', error_code: 'verified_hardware_identity_required' }); return; }
        Object.assign(instance, { url: found.url, lanUrl: found.url, restoreTransport: found.transport, state: 'running' }); manager.save(); this.update(job, { phase: 'provisioned', state: 'running', error_code: undefined });
      }
    }
    if (!job.instance_id) {
      const check = await manager.check(job.target, job.options.hostId);
      if (signal.aborted) throw fail('cancelled');
      if (!check.ok) throw fail(['host_key_approval_required', 'host_key_changed'].includes(check.code) ? check.code : 'target_setup_needed');
      const id = 'backup-' + job.id;
      await manager.allocate({ ...job.options, target: job.target, backupsOn: false }, { id, hostingJobId: job.id, signal });
      this.update(job, { instance_id: id, phase: 'provision_pending' });
      if (signal.aborted) throw fail('cancelled');
    }
    const inst = manager.get(job.instance_id);
    if (inst.hostingJobId !== job.id) throw fail('resource_ownership_mismatch');
    if (signal.aborted) throw fail('cancelled');
    const full = manager.withSecrets(inst);
    if (job.phase === 'provision_pending' || job.phase === 'provision_started') {
      const state = await adapter.status(full);
      if (signal.aborted) throw fail('cancelled');
      if (job.phase === 'provision_started' && state === 'missing') throw fail('provision_reconciliation_required');
      if (state === 'missing') {
        this.update(job, { state: 'running', phase: 'provision_started' });
        const prepareBootstrap = this.prepareBootstrap ? async (input) => { const prepared = await this.prepareBootstrap(input); inst.restoreTransport = prepared.transport; manager.save(); this.update(job, { bootstrap_transport: prepared.transport }); return prepared; } : undefined;
        let savedRuntime = JSON.stringify([inst.ip, inst.bindAddress, inst.restoreTransport]);
        const persistRuntime = () => {
          const current = JSON.stringify([full.ip, full.bindAddress, full.restoreTransport]);
          if (current !== savedRuntime) { Object.assign(inst, { ip: full.ip, bindAddress: full.bindAddress, restoreTransport: full.restoreTransport }); manager.save(); savedRuntime = current; }
        };
        const result = await adapter.deploy(full, persistRuntime, (key) => { persistRuntime(); this.emit('progress', { id: job.id, phase: key }); }, { cacheDir: manager.cacheDir(), prepareBootstrap, signal });
        Object.assign(inst, result, { state: 'running', ip: full.ip || inst.ip }); manager.save();
        if (signal.aborted) throw fail('cancelled');
      } else if (state !== 'running') throw fail('target_not_running');
      if (job.target === 'vmware' && inst.restoreTransport && !inst.ip && typeof adapter.address === 'function') { inst.ip = await adapter.address(full); manager.save(); if (signal.aborted) throw fail('cancelled'); }
      Object.assign(inst, adapter.urls(full), { state: 'running' }); manager.save(); this.update(job, { phase: 'provisioned' });
    }
    let tunnel;
    try {
    if (job.target === 'ssh') {
      tunnel = await adapter.restoreTunnel(full);
      if (signal.aborted) throw fail('cancelled');
    }
    const base = tunnel ? tunnel.base : inst.url;
    if (signal.aborted) throw fail('cancelled');
    if (!base) throw fail('target_address_unavailable');
    const journal = { get phase() { return job.phase; }, get backup_id() { return job.backup_id; }, update: (patch) => this.update(job, patch) };
    this.update(job, { state: 'restoring', error_code: undefined });
    const transport = inst.restoreTransport || {};
    await this.restore({ base, file: item.file, password, journal, signal, transport });
    this.update(job, { state: 'waiting_for_restart' });
    const end = Date.now() + 30 * 60000;
    while (Date.now() < end && !signal.aborted) {
      try {
        const info = await this.probe(base, '/api/onboarding/backup/info', { signal, transport });
        const event = info.last_action_event;
        if (event && event.manager_state === 'restore_backup' && event.state === 'failed') throw fail('restore_failed');
        if (event && event.manager_state === 'restore_backup' && event.state === 'completed') this.update(job, { restore_completed: true });
      } catch (e) {
        if (e.code === 'authentication_needed' && (job.phase === 'restore_accepted' || job.phase === 'restore_submitted' || job.restore_completed)) {
          // Completed onboarding closes the unauthenticated restore API. Verify the actual LAN address.
          const candidate = inst.lanUrl || (job.target === 'docker' || job.target === 'virtualbox' ? (lanAddress() ? 'http://' + lanAddress() + ':' + inst.port + '/' : '') : job.target === 'ssh' ? inst.url : '');
          if (!candidate) throw fail('lan_address_unavailable');
          const lan = await lanOrigin(new URL(candidate).href);
          if (signal.aborted) throw fail('cancelled');
          const manifest = await this.probe(lan, '/manifest.json', { signal, allowLanProbe: true, transport });
          if (!coreManifest(manifest)) throw fail('core_readiness_unverified');
          const verified = { lan_url: lan, lan_url_verified: true, lan_url_verified_at: new Date().toISOString() };
          if (!job.restore_completed) { this.update(job, { state: 'authentication_needed', ...verified, error_code: 'restore_completion_requires_authentication' }); return; }
          this.update(job, { state: 'ready', phase: 'verified', ...verified }); return;
        }
        if (e.code === 'restore_failed') throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw fail('restore_readiness_unverified');
    } finally { if (tunnel) await tunnel.close(); }
  }
}
module.exports = { BackupJobs, JOB_LIMITS };
