'use strict';
// Minecraft server creator and manager. Four targets with their own adapters: Java processes on this
// computer, Docker containers on this computer, and the same two on SSH hosts. Versions come from
// the official catalogues (Mojang's version manifest, the PaperMC, Fabric and Purpur APIs); plugins
// and mods from Modrinth with their SHA-512. Every server lives in its own folder.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { run, getJson, download, slug: slugify, uniqueSlug, freePort, stamp, findProgram } = require('./util');
const ssh = require('./ssh');

const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FLAVOURS = {
  vanilla: { name: 'Vanilla', edition: 'java', docker: 'VANILLA', local: true, folder: null },
  paper: { name: 'Paper', edition: 'java', docker: 'PAPER', local: true, folder: 'plugins', loader: 'paper' },
  purpur: { name: 'Purpur', edition: 'java', docker: 'PURPUR', local: true, folder: 'plugins', loader: 'purpur' },
  fabric: { name: 'Fabric', edition: 'java', docker: 'FABRIC', local: true, folder: 'mods', loader: 'fabric' },
  quilt: { name: 'Quilt', edition: 'java', docker: 'QUILT', local: false, folder: 'mods', loader: 'quilt', why: 'Quilt needs its installer; use a Docker target.' },
  forge: { name: 'Forge', edition: 'java', docker: 'FORGE', local: false, folder: 'mods', loader: 'forge', why: 'Forge needs its installer; use a Docker target.' },
  neoforge: { name: 'NeoForge', edition: 'java', docker: 'NEOFORGE', local: false, folder: 'mods', loader: 'neoforge', why: 'NeoForge needs its installer; use a Docker target.' },
  bedrock: { name: 'Bedrock Dedicated Server', edition: 'bedrock', docker: null, local: false, why: 'The Bedrock server runs here through Docker only.' }
};
const TARGETS = { process: 'Java on this computer', docker: 'Docker on this computer', 'ssh-process': 'Java on an SSH host', 'ssh-docker': 'Docker on an SSH host' };

// server.properties for current Java servers: type, default, bounds, choices, whether it needs a
// restart, and help. Keys not listed here are kept exactly as they are and shown as other values.
const PROPS = [
  ['motd', 'text', 'A Minecraft Server', 'Message in the server list', { max: 59 }],
  ['server-port', 'int', 25565, 'Port players connect to', { min: 1, max: 65535 }],
  ['max-players', 'int', 20, 'Most players at once', { min: 0, max: 1000 }],
  ['gamemode', 'enum', 'survival', 'Game mode for new players', { choices: ['survival', 'creative', 'adventure', 'spectator'] }],
  ['difficulty', 'enum', 'easy', 'How hard the world is', { choices: ['peaceful', 'easy', 'normal', 'hard'] }],
  ['hardcore', 'bool', false, 'One life; the world is locked to hard', {}],
  ['pvp', 'bool', true, 'Players can hurt each other', {}],
  ['online-mode', 'bool', true, 'Check every player with Mojang; off lets anyone in under any name', { warn: true }],
  ['white-list', 'bool', false, 'Only players on the allowlist can join', {}],
  ['enforce-whitelist', 'bool', false, 'Remove players not on the allowlist when it reloads', {}],
  ['view-distance', 'int', 10, 'Chunks sent to players, in each direction', { min: 3, max: 32 }],
  ['simulation-distance', 'int', 10, 'Chunks that keep ticking around players', { min: 3, max: 32 }],
  ['spawn-protection', 'int', 16, 'Blocks around spawn only operators can change (0 for none)', { min: 0, max: 1000 }],
  ['allow-flight', 'bool', false, 'Do not kick players who fly in survival (needed for some mods)', {}],
  ['allow-nether', 'bool', true, 'The Nether exists', {}],
  ['spawn-monsters', 'bool', true, 'Monsters appear', {}],
  ['generate-structures', 'bool', true, 'Villages, temples and the rest are built (new chunks only)', {}],
  ['level-name', 'text', 'world', 'Folder of the world to load', { max: 80 }],
  ['level-seed', 'text', '', 'Seed for a new world (empty is random)', { max: 120 }],
  ['level-type', 'enum', 'minecraft:normal', 'World type for a new world', { choices: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'] }],
  ['max-world-size', 'int', 29999984, 'World border radius in blocks', { min: 1, max: 29999984 }],
  ['op-permission-level', 'int', 4, 'Power of new operators', { min: 1, max: 4 }],
  ['function-permission-level', 'int', 2, 'Power of functions', { min: 1, max: 4 }],
  ['player-idle-timeout', 'int', 0, 'Minutes before idle players are kicked (0 never)', { min: 0, max: 1440 }],
  ['entity-broadcast-range-percentage', 'int', 100, 'How far entities are sent, in percent', { min: 10, max: 1000 }],
  ['max-tick-time', 'int', 60000, 'Milliseconds one tick may take before the watchdog stops the server (-1 off)', { min: -1, max: 600000 }],
  ['network-compression-threshold', 'int', 256, 'Packets larger than this are compressed (-1 off)', { min: -1, max: 65535 }],
  ['rate-limit', 'int', 0, 'Packets per second before a player is kicked (0 off)', { min: 0, max: 100000 }],
  ['enable-command-block', 'bool', false, 'Command blocks work', {}],
  ['enable-rcon', 'bool', false, 'Remote console over the network', { warn: true }],
  ['rcon.port', 'int', 25575, 'Remote console port', { min: 1, max: 65535 }],
  ['enable-query', 'bool', false, 'Answer GameSpy4 status queries', {}],
  ['query.port', 'int', 25565, 'Query port', { min: 1, max: 65535 }],
  ['enable-status', 'bool', true, 'Show in the server list', {}],
  ['hide-online-players', 'bool', false, 'Hide who is on from the server list', {}],
  ['force-gamemode', 'bool', false, 'Put players in the default game mode every time they join', {}],
  ['require-resource-pack', 'bool', false, 'Kick players who decline the resource pack', {}],
  ['resource-pack', 'text', '', 'Address of a resource pack (https)', { max: 500 }],
  ['resource-pack-sha1', 'text', '', 'SHA-1 of the resource pack', { max: 40 }],
  ['resource-pack-prompt', 'text', '', 'Message shown when offering the pack', { max: 200 }],
  ['enforce-secure-profile', 'bool', true, 'Only players with signed chat can join', {}],
  ['log-ips', 'bool', true, 'Write player addresses to the log', {}],
  ['sync-chunk-writes', 'bool', true, 'Write chunks synchronously (safer, slower)', {}],
  ['server-ip', 'text', '', 'Listen only on this address (empty for every address)', { max: 64 }],
  ['initial-enabled-packs', 'text', 'vanilla', 'Data packs on for a new world', { max: 300 }],
  ['initial-disabled-packs', 'text', '', 'Data packs off for a new world', { max: 300 }],
  ['generator-settings', 'json', '{}', 'Settings for a flat or single-biome world (built in the world generator)', { max: 20000 }]
].map(([key, type, def, help, o]) => Object.assign({ key, type, def, help, restart: true }, o));

// Game rules with their types, applied live with /gamerule while the server runs.
const RULES = [['announceAdvancements', 'bool', true], ['commandBlockOutput', 'bool', true], ['disableElytraMovementCheck', 'bool', false], ['disableRaids', 'bool', false], ['doDaylightCycle', 'bool', true], ['doEntityDrops', 'bool', true], ['doFireTick', 'bool', true], ['doImmediateRespawn', 'bool', false], ['doInsomnia', 'bool', true], ['doLimitedCrafting', 'bool', false], ['doMobLoot', 'bool', true], ['doMobSpawning', 'bool', true], ['doPatrolSpawning', 'bool', true], ['doTileDrops', 'bool', true], ['doTraderSpawning', 'bool', true], ['doVinesSpread', 'bool', true], ['doWardenSpawning', 'bool', true], ['doWeatherCycle', 'bool', true], ['drowningDamage', 'bool', true], ['fallDamage', 'bool', true], ['fireDamage', 'bool', true], ['forgiveDeadPlayers', 'bool', true], ['freezeDamage', 'bool', true], ['keepInventory', 'bool', false], ['logAdminCommands', 'bool', true], ['maxCommandChainLength', 'int', 65536, 0, 10000000], ['maxEntityCramming', 'int', 24, 0, 1000], ['mobGriefing', 'bool', true], ['naturalRegeneration', 'bool', true], ['playersSleepingPercentage', 'int', 100, 0, 100], ['randomTickSpeed', 'int', 3, 0, 4096], ['reducedDebugInfo', 'bool', false], ['sendCommandFeedback', 'bool', true], ['showDeathMessages', 'bool', true], ['spawnRadius', 'int', 10, 0, 1000], ['spectatorsGenerateChunks', 'bool', true], ['universalAnger', 'bool', false]]
  .map(([name, type, def, min, max]) => ({ name, type, def, min, max }));

function parseProps(text) {
  const out = []; for (const line of String(text).split(/\r?\n/)) { if (!line || /^\s*#/.test(line)) { out.push({ raw: line }); continue; } const i = line.indexOf('='); if (i < 0) { out.push({ raw: line }); continue; } out.push({ key: line.slice(0, i).trim(), value: line.slice(i + 1) }); }
  return out;
}
function propsObject(text) { const o = {}; for (const l of parseProps(text)) if (l.key) o[l.key] = l.value; return o; }
// Writes changes back while keeping comments, order and every key it does not know.
function updateProps(text, changes) {
  const lines = parseProps(text); while (lines.length && lines[lines.length - 1].raw === '') lines.pop(); const seen = new Set();
  for (const l of lines) if (l.key && Object.prototype.hasOwnProperty.call(changes, l.key)) { l.value = String(changes[l.key]); seen.add(l.key); }
  for (const k of Object.keys(changes)) if (!seen.has(k)) lines.push({ key: k, value: String(changes[k]) });
  return lines.map((l) => (l.key ? l.key + '=' + l.value : l.raw)).join('\n') + '\n';
}
function validateProp(key, value) {
  const d = PROPS.find((p) => p.key === key); if (!d) return String(value);
  if (d.type === 'bool') { if (value !== true && value !== false && value !== 'true' && value !== 'false') throw new Error(key + ' must be true or false.'); return String(value === true || value === 'true'); }
  if (d.type === 'int') { const n = Number(value); if (!Number.isInteger(n) || n < d.min || n > d.max) throw new Error(key + ' must be a whole number from ' + d.min + ' to ' + d.max + '.'); return String(n); }
  if (d.type === 'enum') { if (!d.choices.includes(value)) throw new Error(key + ' must be one of ' + d.choices.join(', ') + '.'); return value; }
  if (d.type === 'json') { JSON.parse(value || '{}'); if (value.length > d.max) throw new Error(key + ' is too long.'); return value; }
  if (/[\r\n]/.test(value) || String(value).length > d.max) throw new Error(key + ' must be one line of at most ' + d.max + ' characters.'); return String(value);
}

// The Java runtime a version needs, from the version's own metadata when known.
function javaFor(version, meta) { if (meta && meta.javaVersion && meta.javaVersion.majorVersion) return meta.javaVersion.majorVersion; const m = /^1\.(\d+)(?:\.(\d+))?/.exec(version); if (!m) return 21; const minor = +m[1], patch = +(m[2] || 0); return minor < 17 ? 8 : minor < 20 || (minor === 20 && patch < 5) ? 17 : 21; }
const dockerTag = (j) => (j <= 8 ? 'java8' : j <= 11 ? 'java11' : j <= 17 ? 'java17' : j <= 21 ? 'java21' : 'latest');

class Minecraft extends EventEmitter {
  constructor(mgr) {
    super(); this.m = mgr; this.dir = path.join(mgr.dir, 'minecraft'); fs.mkdirSync(this.dir, { recursive: true });
    this.db = mgr.db.minecraft = mgr.db.minecraft || { servers: [], catalog: {} };
    this.procs = new Map(); this.consoles = new Map(); this.followers = new Map();
  }
  list() { return this.db.servers.map((s) => Object.assign({}, s, { running: this.procs.has(s.id) || s.lastState === 'running' })); }
  get(id) { const s = this.db.servers.find((x) => x.id === id); if (!s) throw new Error('There is no such server.'); return s; }
  host(s) { if (!/^ssh/.test(s.target)) return null; const w = this.m.withSecrets({ hostId: s.hostId }); const h = w && w.host; if (!h) throw new Error('Its SSH host is no longer saved.'); return h; }
  say(id, line) { const c = this.consoles.get(id) || []; c.push(line); if (c.length > 2000) c.splice(0, c.length - 2000); this.consoles.set(id, c); this.emit('console', { id, line }); }

  // ---------- Catalogue ----------
  async catalog(force) {
    const c = this.db.catalog; if (!force && c.at && Date.now() - Date.parse(c.at) < 6 * 3600e3) return c;
    const out = { at: new Date().toISOString(), sources: {}, errors: {} };
    try { const m = await getJson(MOJANG); out.java = m.versions.map((v) => ({ id: v.id, type: v.type, released: v.releaseTime, url: v.url, sha1: v.sha1 })); out.latest = m.latest; out.sources.java = { url: MOJANG, count: m.versions.length, complete: true }; } catch (e) { out.errors.java = e.message; out.java = c.java || []; }
    const side = async (k, url, pick) => { try { out[k] = pick(await getJson(url)); out.sources[k] = { url, count: out[k].length, complete: true }; } catch (e) { out.errors[k] = e.message; out[k] = c[k] || []; } };
    await side('paper', 'https://api.papermc.io/v2/projects/paper', (j) => j.versions.slice().reverse());
    await side('purpur', 'https://api.purpurmc.org/v2/purpur', (j) => j.versions.slice().reverse());
    await side('fabric', 'https://meta.fabricmc.net/v2/versions/game', (j) => j.map((v) => v.version));
    out.bedrock = ['LATEST', 'PREVIEW']; out.sources.bedrock = { url: 'https://www.minecraft.net/en-us/download/server/bedrock', count: 2, complete: false, note: 'Bedrock servers run from the itzg/minecraft-bedrock-server image, which resolves LATEST and PREVIEW from minecraft.net when it starts; older Bedrock builds are not offered.' };
    this.db.catalog = out; this.m.save(); return out;
  }
  // Exactly where a server jar for one flavour and version comes from, with its checksum.
  async jarFor(flavour, version) {
    if (flavour === 'vanilla') { const cat = await this.catalog(); const v = (cat.java || []).find((x) => x.id === version); if (!v) throw new Error('Version ' + version + ' is not in the Mojang catalogue.'); const meta = await getJson(v.url); if (!meta.downloads || !meta.downloads.server) throw new Error('Mojang published no server for ' + version + '.'); return { url: meta.downloads.server.url, sha1: meta.downloads.server.sha1, size: meta.downloads.server.size, java: javaFor(version, meta) }; }
    if (flavour === 'paper') { const b = await getJson('https://api.papermc.io/v2/projects/paper/versions/' + encodeURIComponent(version) + '/builds'); const last = b.builds[b.builds.length - 1]; if (!last) throw new Error('Paper has no build for ' + version + '.'); const app = last.downloads.application; return { url: 'https://api.papermc.io/v2/projects/paper/versions/' + version + '/builds/' + last.build + '/downloads/' + app.name, sha256: app.sha256, build: last.build, java: javaFor(version) }; }
    if (flavour === 'purpur') { const b = await getJson('https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(version) + '/latest'); return { url: 'https://api.purpurmc.org/v2/purpur/' + version + '/latest/download', md5: b.md5, build: b.build, java: javaFor(version) }; }
    if (flavour === 'fabric') { const l = await getJson('https://meta.fabricmc.net/v2/versions/loader/' + encodeURIComponent(version)); const i = await getJson('https://meta.fabricmc.net/v2/versions/installer'); if (!l[0] || !i[0]) throw new Error('Fabric has no loader for ' + version + '.'); return { url: 'https://meta.fabricmc.net/v2/versions/loader/' + version + '/' + l[0].loader.version + '/' + i[0].version + '/server/jar', java: javaFor(version), note: 'Fabric publishes no checksum for its server launcher.' }; }
    throw new Error(FLAVOURS[flavour] ? FLAVOURS[flavour].why : 'Unknown flavour.');
  }
  async fetchJar(s, log) {
    const j = await this.jarFor(s.flavour, s.version); const dest = path.join(this.localDir(s), 'server.jar'); const tmp = dest + '.download';
    log('Downloading the ' + FLAVOURS[s.flavour].name + ' ' + s.version + ' server');
    await download(j.url, tmp, (got, total) => { if (total) this.emit('progress', { id: s.id, text: 'Downloading the server', fraction: got / total }); });
    const buf = fs.readFileSync(tmp);
    const check = j.sha1 ? ['sha1', j.sha1] : j.sha256 ? ['sha256', j.sha256] : j.md5 ? ['md5', j.md5] : null;
    if (check && crypto.createHash(check[0]).update(buf).digest('hex') !== check[1].toLowerCase()) { fs.rmSync(tmp, { force: true }); throw new Error('The downloaded server does not match its ' + check[0].toUpperCase() + '. Nothing was changed.'); }
    fs.renameSync(tmp, dest); s.java = j.java; s.jar = { url: j.url, check: check ? check[0] + ':' + check[1] : 'none: ' + (j.note || 'no checksum published'), build: j.build || '' };
    log(check ? 'Checked its ' + check[0].toUpperCase() : (j.note || 'No checksum is published for it'));
  }
  localDir(s) { return path.join(this.dir, s.slug); }
  remoteDir(s) { return '$HOME/home-assistant-material/minecraft/' + s.slug; }
  container(s) { return 'ham-mc-' + s.slug; }

  // ---------- Files, through the target ----------
  async readFile(s, name) {
    if (!/^[\w.-]+(\/[\w.-]+)*$/.test(name)) throw new Error('That file name is not allowed.');
    if (/^ssh/.test(s.target)) return ssh.withHost({ host: this.host(s) }, (c) => ssh.exec(c, 'cat ' + this.remoteDir(s) + '/' + name + ' 2>/dev/null || true')).then((r) => r.out || '');
    try { return fs.readFileSync(path.join(this.localDir(s), name), 'utf8'); } catch { return ''; }
  }
  async writeFile(s, name, text) {
    if (!/^[\w.-]+(\/[\w.-]+)*$/.test(name)) throw new Error('That file name is not allowed.');
    if (/^ssh/.test(s.target)) return ssh.withHost({ host: this.host(s) }, (c) => ssh.exec(c, 'mkdir -p ' + this.remoteDir(s) + ' && cat > ' + this.remoteDir(s) + '/' + name + '.tmp && mv ' + this.remoteDir(s) + '/' + name + '.tmp ' + this.remoteDir(s) + '/' + name, { input: text }));
    const f = path.join(this.localDir(s), name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f);
  }

  // ---------- Create ----------
  async create(o) {
    const fl = FLAVOURS[o.flavour]; if (!fl) throw new Error('Choose a flavour.'); if (!TARGETS[o.target]) throw new Error('Choose where it runs.');
    if (!o.eula) throw new Error('The server only starts after you accept the Minecraft EULA.');
    if (o.target === 'process' && !fl.local) throw new Error(fl.why);
    if (/process/.test(o.target) && fl.edition === 'bedrock') throw new Error(fl.why);
    if (/^ssh/.test(o.target) && !o.hostId) throw new Error('Choose the SSH host.');
    const taken = this.db.servers.map((x) => x.slug);
    const portsTaken = this.db.servers.filter((x) => x.target === o.target && x.hostId === o.hostId).map((x) => x.port);
    const s = { id: crypto.randomUUID(), name: String(o.name || 'Minecraft').trim().slice(0, 60), slug: uniqueSlug(slugify(o.name || 'minecraft'), taken), edition: fl.edition, flavour: o.flavour, version: o.version || 'LATEST', target: o.target, hostId: o.hostId || '', port: Number(o.port) || (/^ssh/.test(o.target) ? 25565 : await freePort(25565, portsTaken)), memoryMb: Math.max(512, Math.min(65536, Number(o.memoryMb) || 2048)), created: new Date().toISOString(), backups: [], schedule: { restart: '', backup: '' }, lastState: 'created' };
    if (fl.edition === 'java' && s.port === 25565 && portsTaken.includes(25565)) throw new Error('Port 25565 is taken by another server on that target.');
    this.db.servers.push(s); this.m.save('created');
    const log = (l) => this.say(s.id, '[Deploy Assistant] ' + l);
    try {
      if (/^ssh/.test(s.target)) await ssh.withHost({ host: this.host(s) }, (c) => ssh.exec(c, 'mkdir -p ' + this.remoteDir(s)));
      else fs.mkdirSync(this.localDir(s), { recursive: true });
      await this.writeFile(s, 'eula.txt', '# Accepted in Home Assistant Material Deploy Assistant on ' + new Date().toISOString() + '\neula=true\n');
      const props = Object.assign({ 'server-port': fl.edition === 'java' ? (/docker/.test(s.target) ? 25565 : s.port) : s.port, motd: s.name }, o.props || {});
      const clean = {}; for (const k of Object.keys(props)) clean[k] = validateProp(k, props[k]);
      if (fl.edition === 'java') await this.writeFile(s, 'server.properties', updateProps('', clean));
      if (s.target === 'process' || s.target === 'ssh-process') {
        if (s.target === 'process') await this.fetchJar(s, log);
        else { const j = await this.jarFor(s.flavour, s.version); s.java = j.java; await ssh.withHost({ host: this.host(s) }, (c) => ssh.exec(c, 'cd ' + this.remoteDir(s) + ' && curl -fsSL -o server.jar.download ' + JSON.stringify(j.url) + ' && ' + (j.sha1 ? 'echo ' + j.sha1 + '  server.jar.download | sha1sum -c - && ' : j.sha256 ? 'echo ' + j.sha256 + '  server.jar.download | sha256sum -c - && ' : '') + 'mv server.jar.download server.jar', { onLine: log })); }
      }
      log('Created. Start it when you are ready.');
      s.lastState = 'stopped'; this.m.save();
      return s;
    } catch (e) { s.lastState = 'failed'; s.error = e.message; this.m.save(); throw e; }
  }

  // ---------- Run ----------
  dockerArgs(s) {
    const fl = FLAVOURS[s.flavour], mount = /^ssh/.test(s.target) ? this.remoteDir(s) : this.localDir(s);
    if (fl.edition === 'bedrock') return ['run', '-d', '--name', this.container(s), '--restart', 'unless-stopped', '-p', s.port + ':19132/udp', '-v', mount + ':/data', '-e', 'EULA=TRUE', '-e', 'VERSION=' + (s.version || 'LATEST'), '-e', 'SERVER_NAME=' + s.name, '-it', 'itzg/minecraft-bedrock-server'];
    return ['run', '-d', '--name', this.container(s), '--restart', 'unless-stopped', '-p', s.port + ':25565', '-v', mount + ':/data', '-e', 'EULA=TRUE', '-e', 'TYPE=' + fl.docker, '-e', 'VERSION=' + (s.version || 'LATEST'), '-e', 'MEMORY=' + s.memoryMb + 'M', '-e', 'ENABLE_RCON=true', '-e', 'CREATE_CONSOLE_IN_PIPE=true', '-e', 'OVERRIDE_SERVER_PROPERTIES=false', 'itzg/minecraft-server:' + dockerTag(s.java || javaFor(s.version))];
  }
  async remote(s, cmd, opts) { return ssh.withHost({ host: this.host(s) }, (c) => ssh.exec(c, cmd, opts)); }
  async start(id) {
    const s = this.get(id); const log = (l) => this.say(id, l);
    if (s.target === 'process') {
      if (this.procs.has(id)) throw new Error('It is already running.');
      const java = findProgram(['java']) || 'java'; const chk = await run(java, ['-version']).catch(() => ({ code: 1 }));
      if (chk.code !== 0) throw new Error('Java was not found on this computer. Install Java ' + (s.java || 21) + ' (for example Eclipse Temurin) or use a Docker target.');
      const want = s.java || 21; const have = Number((/version "(?:1\.)?(\d+)/.exec((chk.err || '') + (chk.out || '')) || [])[1] || 0);
      if (have && have < want) throw new Error('This server needs Java ' + want + '; this computer has Java ' + have + '.');
      const p = spawn(java, ['-Xms' + Math.min(1024, s.memoryMb) + 'M', '-Xmx' + s.memoryMb + 'M', '-jar', 'server.jar', 'nogui'], { cwd: this.localDir(s), windowsHide: true });
      this.procs.set(id, p); s.lastState = 'starting'; s.startedAt = new Date().toISOString(); this.m.save();
      const lines = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => { this.say(id, l); if (/Done \(/.test(l)) { s.lastState = 'running'; this.m.save(); this.emit('state', { id, state: 'running' }); } });
      p.stdout.on('data', lines); p.stderr.on('data', lines);
      p.on('exit', (code) => { this.procs.delete(id); s.lastState = code === 0 ? 'stopped' : 'crashed'; this.m.save(); this.say(id, '[Deploy Assistant] The server stopped' + (code ? ' with code ' + code : '') + '.'); this.emit('state', { id, state: s.lastState }); });
      return 'starting';
    }
    if (s.target === 'docker') {
      const exists = await run('docker', ['inspect', this.container(s)]).catch(() => ({ code: 1 }));
      const r = exists.code === 0 ? await run('docker', ['start', this.container(s)]) : await run('docker', this.dockerArgs(s), { onLine: log });
      if (r.code !== 0) throw new Error((r.err || r.out || 'Docker did not start it.').trim().split('\n').pop());
      s.lastState = 'starting'; s.startedAt = new Date().toISOString(); this.m.save(); this.follow(s); return 'starting';
    }
    if (s.target === 'ssh-docker') {
      const r = await this.remote(s, 'docker start ' + this.container(s) + ' 2>/dev/null || docker ' + this.dockerArgs(s).map((a) => (/^[\w./:=@%+-]+$/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'")).join(' ').replace("'" + this.remoteDir(s) + ":/data'", '"' + this.remoteDir(s) + ':/data"'), { onLine: log });
      if (r.code) throw new Error('Docker on the host did not start it.'); s.lastState = 'starting'; this.m.save(); return 'starting';
    }
    const d = this.remoteDir(s);
    await this.remote(s, 'cd ' + d + ' && (test -p console.in || mkfifo console.in) && nohup sh -c "tail -f console.in | java -Xmx' + s.memoryMb + 'M -jar server.jar nogui" > console.log 2>&1 & echo $! > server.pid', { onLine: log });
    s.lastState = 'starting'; this.m.save(); return 'starting';
  }
  async command(id, cmd) {
    const s = this.get(id); cmd = String(cmd).replace(/^\//, '').trim();
    if (!cmd || /[\r\n]/.test(cmd) || cmd.length > 1000) throw new Error('Give one command of at most 1000 characters.');
    this.say(id, '> ' + cmd);
    if (s.target === 'process') { const p = this.procs.get(id); if (!p) throw new Error('The server is not running.'); p.stdin.write(cmd + '\n'); return true; }
    if (s.target === 'docker') { const r = await run('docker', ['exec', this.container(s), FLAVOURS[s.flavour].edition === 'bedrock' ? 'send-command' : 'rcon-cli', ...cmd.split(' ')]); (r.out || '').split('\n').filter(Boolean).forEach((l) => this.say(id, l)); if (r.code) throw new Error('The server did not take the command. Is it running?'); return true; }
    if (s.target === 'ssh-docker') { const r = await this.remote(s, 'docker exec ' + this.container(s) + ' rcon-cli ' + cmd.split(' ').map((a) => "'" + a.replace(/'/g, "'\\''") + "'").join(' ')); (r.out || '').split('\n').filter(Boolean).forEach((l) => this.say(id, l)); return true; }
    await this.remote(s, 'cd ' + this.remoteDir(s) + ' && cat > console.in', { input: cmd + '\n' }); return true;
  }
  async stop(id) {
    const s = this.get(id); this.say(id, '[Deploy Assistant] Saving the world and stopping');
    if (s.target === 'process') { const p = this.procs.get(id); if (!p) { s.lastState = 'stopped'; this.m.save(); return 'stopped'; } p.stdin.write('stop\n'); await new Promise((r) => { const t = setTimeout(() => { p.kill(); r(); }, 90000); p.once('exit', () => { clearTimeout(t); r(); }); }); return 'stopped'; }
    if (s.target === 'docker') { await run('docker', ['stop', '-t', '90', this.container(s)]); }
    else if (s.target === 'ssh-docker') await this.remote(s, 'docker stop -t 90 ' + this.container(s));
    else { await this.command(id, 'stop').catch(() => {}); await this.remote(s, 'cd ' + this.remoteDir(s) + ' && sleep 15; kill $(cat server.pid) 2>/dev/null; rm -f server.pid'); }
    s.lastState = 'stopped'; this.m.save(); this.emit('state', { id, state: 'stopped' }); return 'stopped';
  }
  async restart(id) { await this.stop(id); return this.start(id); }
  follow(s) {
    if (s.target !== 'docker' || this.followers.has(s.id)) return;
    const p = spawn('docker', ['logs', '-f', '--tail', '200', this.container(s)], { windowsHide: true }); this.followers.set(s.id, p);
    const on = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => { this.say(s.id, l); if (/Done \(|Server started/.test(l)) { s.lastState = 'running'; this.m.save(); this.emit('state', { id: s.id, state: 'running' }); } });
    p.stdout.on('data', on); p.stderr.on('data', on); p.on('exit', () => this.followers.delete(s.id));
  }
  async status(id) {
    const s = this.get(id);
    if (s.target === 'process') return { state: this.procs.has(id) ? (s.lastState === 'running' ? 'running' : 'starting') : s.lastState };
    if (s.target === 'docker') { const r = await run('docker', ['inspect', '-f', '{{.State.Status}} {{.State.Health.Status}}', this.container(s)]).catch(() => ({ code: 1 })); if (r.code) return { state: 'stopped' }; const st = r.out.trim().split(' ')[0]; if (st === 'running') this.follow(s); return { state: st === 'running' ? (s.lastState === 'running' ? 'running' : 'starting') : 'stopped' }; }
    try { const r = await this.remote(s, s.target === 'ssh-docker' ? 'docker inspect -f {{.State.Status}} ' + this.container(s) : 'cd ' + this.remoteDir(s) + ' && test -f server.pid && kill -0 $(cat server.pid) && echo running || echo stopped'); return { state: /running/.test(r.out) ? 'running' : 'stopped' }; } catch (e) { return { state: 'unreachable', error: e.message }; }
  }
  async stats(id) {
    const s = this.get(id);
    if (s.target === 'docker') { const r = await run('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}};{{.MemUsage}}', this.container(s)]).catch(() => ({ code: 1 })); if (r.code) return null; const [cpu, mem] = r.out.trim().split(';'); return { cpu: parseFloat(cpu) || 0, mem: mem }; }
    if (s.target === 'process') { const p = this.procs.get(id); if (!p) return null; return { pid: p.pid }; }
    return null;
  }
  // Live facts for the overview, gathered quietly (nothing is written to the console).
  async live(id) {
    const s = this.get(id); const out = { state: (await this.status(id)).state, at: Date.now() };
    const parse = (t) => { const m = /There are (\d+) (?:of a max of|\/) ?(\d+) players online:?\s*(.*)$/m.exec(t || ''); return m ? { online: +m[1], max: +m[2], names: m[3].split(',').map((x) => x.trim()).filter(Boolean) } : null; };
    if (out.state === 'running') {
      try {
        if (s.target === 'docker') { const r = await run('docker', ['exec', this.container(s), 'rcon-cli', 'list'], { timeout: 8000 }); Object.assign(out, parse(r.out) || {}); if (s.flavour === 'paper' || s.flavour === 'purpur') { const t = await run('docker', ['exec', this.container(s), 'rcon-cli', 'tps'], { timeout: 8000 }); const m = /:\s*\*?([\d.]+)/.exec((t.out || '').replace(/\u00a7./g, '')); if (m) out.tps = +m[1]; } }
        else if (s.target === 'ssh-docker') { const r = await this.remote(s, 'docker exec ' + this.container(s) + ' rcon-cli list'); Object.assign(out, parse(r.out) || {}); }
        else { const c = (this.consoles.get(id) || []).slice().reverse().find((l) => /There are \d+/.test(l)); Object.assign(out, parse(c) || {}); }
      } catch { /* the facts stay unknown */ }
      const st = await this.stats(id).catch(() => null); if (st) Object.assign(out, st);
    }
    if (!/^ssh/.test(s.target)) { let size = 0, n = 0; const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (++n > 200000) return; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { try { size += fs.statSync(f).size; } catch { /* gone */ } } } }; walk(path.join(this.localDir(s), 'world')); out.worldBytes = size; }
    if (!out.max) { try { out.max = +(propsObject(await this.readFile(s, 'server.properties'))['max-players'] || 20); } catch { out.max = 20; } }
    out.uptimeSince = s.startedAt || null;
    return out;
  }
  logs(id) { return (this.consoles.get(id) || []).slice(-500); }

  // ---------- Players ----------
  async players(id) {
    const s = this.get(id); const j = async (f) => { try { return JSON.parse((await this.readFile(s, f)) || '[]'); } catch { return []; } };
    return { ops: await j('ops.json'), allow: await j('whitelist.json'), bans: await j('banned-players.json'), ipBans: await j('banned-ips.json') };
  }
  async lookup(name) { if (!/^\w{3,16}$/.test(name)) throw new Error('Player names are 3 to 16 letters, digits or underscores.'); const r = await getJson('https://api.mojang.com/users/profiles/minecraft/' + name).catch(() => null); if (!r || !r.id) throw new Error('Mojang knows no player called ' + name + '.'); return { name: r.name, uuid: r.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') }; }
  // Live command when running (the server writes its own files); otherwise the file directly.
  async playerAction(id, list, action, who, extra) {
    const s = this.get(id); const st = await this.status(id); const live = st.state === 'running';
    const cmds = { ops: { add: 'op ' + who, remove: 'deop ' + who }, allow: { add: 'whitelist add ' + who, remove: 'whitelist remove ' + who }, bans: { add: 'ban ' + who + (extra ? ' ' + extra : ''), remove: 'pardon ' + who }, ipBans: { add: 'ban-ip ' + who, remove: 'pardon-ip ' + who } };
    if (!cmds[list]) throw new Error('Unknown list.');
    if (list === 'ipBans' ? !/^[0-9a-fA-F:.]{3,45}$/.test(who) : !/^\w{3,16}$/.test(who)) throw new Error(list === 'ipBans' ? 'Give an IP address.' : 'Player names are 3 to 16 letters, digits or underscores.');
    if (live) { await this.command(id, cmds[list][action]); return 'Done live on the running server.'; }
    const file = { ops: 'ops.json', allow: 'whitelist.json', bans: 'banned-players.json', ipBans: 'banned-ips.json' }[list];
    let arr = []; try { arr = JSON.parse((await this.readFile(s, file)) || '[]'); } catch { arr = []; }
    if (action === 'remove') arr = arr.filter((e) => (e.name || e.ip) !== who);
    else if (list === 'ipBans') arr.push({ ip: who, created: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +0000', source: 'Deploy Assistant', expires: 'forever', reason: extra || 'Banned by an operator.' });
    else { const p = await this.lookup(who); if (arr.some((e) => e.uuid === p.uuid)) return p.name + ' is already on the list.'; const e = { uuid: p.uuid, name: p.name }; if (list === 'ops') Object.assign(e, { level: 4, bypassesPlayerLimit: false }); if (list === 'bans') Object.assign(e, { created: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +0000', source: 'Deploy Assistant', expires: 'forever', reason: extra || 'Banned by an operator.' }); arr.push(e); }
    await this.writeFile(s, file, JSON.stringify(arr, null, 2)); return 'Written to ' + file + '; the server reads it when it starts.';
  }

  // ---------- Settings ----------
  async properties(id) { const s = this.get(id); const text = await this.readFile(s, 'server.properties'); const o = propsObject(text); return { known: PROPS.map((p) => Object.assign({}, p, { value: Object.prototype.hasOwnProperty.call(o, p.key) ? o[p.key] : null })), other: Object.keys(o).filter((k) => !PROPS.some((p) => p.key === k)).map((k) => ({ key: k, value: o[k] })) }; }
  async setProperties(id, changes) { const s = this.get(id); const clean = {}; for (const k of Object.keys(changes)) clean[k] = validateProp(k, changes[k]); const before = await this.readFile(s, 'server.properties'); await this.writeFile(s, 'server.properties.before-' + stamp(), before); await this.writeFile(s, 'server.properties', updateProps(before, clean)); if (clean['server-port'] && s.target !== 'docker' && s.target !== 'ssh-docker') { s.port = Number(clean['server-port']); this.m.save(); } return 'Saved. ' + Object.keys(clean).length + ' changed; they take effect when the server restarts. The previous file was kept beside it.'; }
  async gamerule(id, name, value) { const r = RULES.find((x) => x.name === name); if (!r) throw new Error('Unknown game rule.'); if (r.type === 'bool' && !/^(true|false)$/.test(String(value))) throw new Error(name + ' is true or false.'); if (r.type === 'int' && (!Number.isInteger(+value) || +value < r.min || +value > r.max)) throw new Error(name + ' is a whole number from ' + r.min + ' to ' + r.max + '.'); return this.command(id, 'gamerule ' + name + ' ' + value); }

  // ---------- Plugins and mods from Modrinth ----------
  async search(id, q, kind) {
    const s = this.get(id); const fl = FLAVOURS[s.flavour]; if (!fl.loader) throw new Error(fl.name + ' takes no plugins or mods.');
    const facets = [['project_type:' + (kind === 'modpack' ? 'modpack' : fl.folder === 'plugins' ? 'plugin' : 'mod')], ['categories:' + fl.loader], ['server_side:required', 'server_side:optional']]; if (s.version && s.version !== 'LATEST') facets.push(['versions:' + s.version]);
    const r = await getJson('https://api.modrinth.com/v2/search?limit=30&index=relevance&query=' + encodeURIComponent(q || '') + '&facets=' + encodeURIComponent(JSON.stringify(facets)));
    return { total: r.total_hits, hits: r.hits.map((h) => ({ id: h.project_id, slug: h.slug, title: h.title, description: h.description, downloads: h.downloads, author: h.author, license: h.license, icon: h.icon_url, versions: (h.versions || []).slice(-5) })) };
  }
  async install(id, projectId) {
    const s = this.get(id); const fl = FLAVOURS[s.flavour];
    const q = '?loaders=' + encodeURIComponent(JSON.stringify([fl.loader])) + (s.version && s.version !== 'LATEST' ? '&game_versions=' + encodeURIComponent(JSON.stringify([s.version])) : '');
    const vs = await getJson('https://api.modrinth.com/v2/project/' + encodeURIComponent(projectId) + '/version' + q);
    if (!vs.length) throw new Error('No version of it is marked for ' + fl.name + ' ' + s.version + '. Compatibility is unknown, so it was not installed.');
    const v = vs[0]; const f = v.files.find((x) => x.primary) || v.files[0];
    if (!/^[\w.+() -]+\.jar$/.test(f.filename)) throw new Error('The file name ' + f.filename + ' is not a plain .jar.');
    const tmp = path.join(this.dir, '.dl-' + crypto.randomUUID()); await download(f.url, tmp);
    const sha = crypto.createHash('sha512').update(fs.readFileSync(tmp)).digest('hex'); if (sha !== f.hashes.sha512) { fs.rmSync(tmp, { force: true }); throw new Error('The download does not match its SHA-512 from Modrinth. Nothing was installed.'); }
    const rel = fl.folder + '/' + f.filename;
    if (/^ssh/.test(s.target)) { await this.remote(s, 'mkdir -p ' + this.remoteDir(s) + '/' + fl.folder + ' && cat > ' + this.remoteDir(s) + '/' + rel + '.tmp && mv ' + this.remoteDir(s) + '/' + rel + '.tmp ' + this.remoteDir(s) + '/' + rel, { input: fs.readFileSync(tmp) }); fs.rmSync(tmp); }
    else { fs.mkdirSync(path.join(this.localDir(s), fl.folder), { recursive: true }); fs.renameSync(tmp, path.join(this.localDir(s), rel)); }
    s.addons = (s.addons || []).filter((a) => a.project !== projectId).concat([{ project: projectId, name: v.name, version: v.version_number, file: rel, sha512: sha, deps: (v.dependencies || []).filter((d) => d.dependency_type === 'required').map((d) => d.project_id), at: new Date().toISOString() }]);
    this.m.save(); return { file: rel, version: v.version_number, requires: (v.dependencies || []).filter((d) => d.dependency_type === 'required').length };
  }
  async addons(id) {
    const s = this.get(id); const fl = FLAVOURS[s.flavour]; if (!fl.folder) return [];
    let names = [];
    if (/^ssh/.test(s.target)) names = ((await this.remote(s, 'ls -1 ' + this.remoteDir(s) + '/' + fl.folder + ' 2>/dev/null || true')).out || '').split('\n').filter(Boolean);
    else { try { names = fs.readdirSync(path.join(this.localDir(s), fl.folder)); } catch { names = []; } }
    return names.filter((n) => /\.jar(\.disabled)?$/.test(n)).map((n) => { const known = (s.addons || []).find((a) => a.file === fl.folder + '/' + n.replace(/\.disabled$/, '')); return { file: n, enabled: !/\.disabled$/.test(n), managed: !!known, name: known ? known.name : n, version: known ? known.version : 'unknown: not installed here, so not managed' }; });
  }
  async toggleAddon(id, file, on) {
    const s = this.get(id); const fl = FLAVOURS[s.flavour]; if (!/^[\w.+() -]+\.jar(\.disabled)?$/.test(file)) throw new Error('That file name is not allowed.');
    const from = fl.folder + '/' + file, to = fl.folder + '/' + (on ? file.replace(/\.disabled$/, '') : file.replace(/(\.disabled)?$/, '.disabled'));
    if (/^ssh/.test(s.target)) await this.remote(s, 'cd ' + this.remoteDir(s) + " && mv '" + from + "' '" + to + "'"); else fs.renameSync(path.join(this.localDir(s), from), path.join(this.localDir(s), to));
    return 'Changed; it takes effect when the server restarts.';
  }
  async removeAddon(id, file) { const s = this.get(id); const fl = FLAVOURS[s.flavour]; if (!/^[\w.+() -]+\.jar(\.disabled)?$/.test(file)) throw new Error('That file name is not allowed.'); if (/^ssh/.test(s.target)) await this.remote(s, 'rm -f ' + this.remoteDir(s) + "/'" + fl.folder + '/' + file + "'"); else fs.rmSync(path.join(this.localDir(s), fl.folder, file), { force: true }); s.addons = (s.addons || []).filter((a) => !a.file.endsWith(file.replace(/\.disabled$/, ''))); this.m.save(); return 'Removed.'; }

  // ---------- Worlds and backups ----------
  async backup(id, note) {
    const s = this.get(id); const wasRunning = (await this.status(id)).state === 'running';
    if (wasRunning) { await this.command(id, 'save-off').catch(() => {}); await this.command(id, 'save-all flush').catch(() => {}); await new Promise((r) => setTimeout(r, 3000)); }
    const dest = path.join(this.dir, 'backups', s.slug); fs.mkdirSync(dest, { recursive: true }); const file = path.join(dest, s.slug + '-' + stamp() + '.tar.gz');
    try {
      if (/^ssh/.test(s.target)) { const out = fs.createWriteStream(file); await ssh.withHost({ host: this.host(s) }, (c) => new Promise((res, rej) => c.exec('cd ' + this.remoteDir(s) + ' && tar czf - --exclude=server.jar --exclude=console.in .', (err, st) => { if (err) return rej(err); st.pipe(out); st.on('close', res); }))); }
      else { const r = await run('tar', ['czf', file, '--exclude=server.jar', '-C', this.localDir(s), '.']); if (r.code) throw new Error('tar failed: ' + (r.err || '').trim()); }
    } finally { if (wasRunning) await this.command(id, 'save-on').catch(() => {}); }
    const b = { id: crypto.randomUUID(), at: new Date().toISOString(), file, size: fs.statSync(file).size, note: note || 'Manual' }; s.backups.unshift(b); this.m.save(); return b;
  }
  async restore(id, backupId) {
    const s = this.get(id); const b = s.backups.find((x) => x.id === backupId); if (!b) throw new Error('No such backup.');
    if ((await this.status(id)).state === 'running') throw new Error('Stop the server first.');
    await this.backup(id, 'Before restoring ' + b.at.slice(0, 16));
    if (/^ssh/.test(s.target)) await this.remote(s, 'cd ' + this.remoteDir(s) + ' && tar xzf -', { input: fs.readFileSync(b.file) });
    else { const r = await run('tar', ['xzf', b.file, '-C', this.localDir(s)]); if (r.code) throw new Error('tar failed: ' + (r.err || '').trim()); }
    return 'Restored. A backup from just before is kept.';
  }
  deleteBackup(id, backupId) { const s = this.get(id); const b = s.backups.find((x) => x.id === backupId); if (!b) return; fs.rmSync(b.file, { force: true }); s.backups = s.backups.filter((x) => x.id !== backupId); this.m.save(); }

  // Version or flavour change: a backup first, then the new server, with the old jar kept to roll back.
  async switchVersion(id, flavour, version) {
    const s = this.get(id); const fl = FLAVOURS[flavour]; if (!fl || fl.edition !== FLAVOURS[s.flavour].edition) throw new Error('Choose a flavour of the same edition.');
    if (s.target === 'process' && !fl.local) throw new Error(fl.why);
    if ((await this.status(id)).state === 'running') throw new Error('Stop the server first.');
    const b = await this.backup(id, 'Before changing to ' + fl.name + ' ' + version);
    const prev = { flavour: s.flavour, version: s.version, at: new Date().toISOString(), backup: b.id };
    if (s.target === 'process') { const jar = path.join(this.localDir(s), 'server.jar'); if (fs.existsSync(jar)) fs.renameSync(jar, path.join(this.localDir(s), 'server.jar.before-' + stamp())); s.flavour = flavour; s.version = version; try { await this.fetchJar(s, (l) => this.say(id, l)); } catch (e) { Object.assign(s, { flavour: prev.flavour, version: prev.version }); throw e; } }
    else if (/docker/.test(s.target)) { s.flavour = flavour; s.version = version; s.java = javaFor(version); if (s.target === 'docker') await run('docker', ['rm', '-f', this.container(s)]); else await this.remote(s, 'docker rm -f ' + this.container(s)); }
    else { s.flavour = flavour; s.version = version; }
    s.history = (s.history || []).concat([prev]); this.m.save();
    return 'Changed to ' + fl.name + ' ' + version + '. A backup from before is kept; going back to an older version is only safe by restoring it.';
  }
  setSchedule(id, sch) { const s = this.get(id); const t = (v) => { if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('Times are HH:MM, 24-hour.'); return v || ''; }; s.schedule = { restart: t(sch.restart), backup: t(sch.backup), keep: Math.max(1, Math.min(100, Number(sch.keep) || 7)) }; this.m.save(); return s.schedule; }
  // Called every minute: daily restarts and backups at their times, keeping the newest N backups.
  async tick() {
    const hm = new Date().toTimeString().slice(0, 5); const day = new Date().toDateString();
    for (const s of this.db.servers) {
      const sch = s.schedule || {};
      if (sch.backup === hm && s.lastBackupDay !== day) { s.lastBackupDay = day; try { await this.backup(s.id, 'Scheduled'); const auto = s.backups.filter((b) => b.note === 'Scheduled'); auto.slice(sch.keep || 7).forEach((b) => this.deleteBackup(s.id, b.id)); } catch (e) { this.say(s.id, '[Deploy Assistant] Scheduled backup failed: ' + e.message); } }
      if (sch.restart === hm && s.lastRestartDay !== day && (await this.status(s.id)).state === 'running') { s.lastRestartDay = day; this.command(s.id, 'say Restarting in 60 seconds for the daily restart').catch(() => {}); setTimeout(() => this.restart(s.id).catch((e) => this.say(s.id, '[Deploy Assistant] Scheduled restart failed: ' + e.message)), 60000); }
    }
  }
  async remove(id, keep) {
    const s = this.get(id); await this.stop(id).catch(() => {});
    if (s.target === 'docker') await run('docker', ['rm', '-f', this.container(s)]); else if (s.target === 'ssh-docker') await this.remote(s, 'docker rm -f ' + this.container(s)).catch(() => {});
    if (!keep) { if (/^ssh/.test(s.target)) await this.remote(s, 'rm -rf ' + this.remoteDir(s)).catch(() => {}); else fs.rmSync(this.localDir(s), { recursive: true, force: true }); }
    this.db.servers = this.db.servers.filter((x) => x.id !== id); this.m.save('deleted'); return true;
  }

  // ---------- World generator: a separate Paper server in Docker pre-generates the chosen area with Chunky ----------
  async generate(o, writeOut) {
    if (!o.eula) throw new Error('Accept the Minecraft EULA first.');
    const w = Math.max(1, Math.min(2000, Math.round(o.width || 100))), h = Math.max(1, Math.min(2000, Math.round(o.height || 100)));
    const slug = 'gen-' + stamp().replace(/\D/g, '').slice(-10); const dir = path.join(this.dir, '.generate', slug); fs.mkdirSync(dir, { recursive: true });
    const say = (l) => this.emit('generate', { line: l });
    const props = { 'level-seed': o.seed || '', 'level-type': o.levelType || 'minecraft:normal', difficulty: o.difficulty || 'normal', gamemode: o.gamemode || 'survival', hardcore: !!o.hardcore, 'generate-structures': o.structures !== false, 'spawn-protection': 0, 'online-mode': true, 'max-players': 1 };
    if (o.generatorSettings) props['generator-settings'] = o.generatorSettings;
    const clean = {}; for (const k of Object.keys(props)) clean[k] = validateProp(k, props[k]);
    fs.writeFileSync(path.join(dir, 'server.properties'), updateProps('', clean)); fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
    const chunky = await getJson('https://api.modrinth.com/v2/project/chunky/version?loaders=' + encodeURIComponent('["paper"]') + '&game_versions=' + encodeURIComponent(JSON.stringify([o.version])));
    if (!chunky.length) throw new Error('Chunky, which pre-generates the area, has no build for ' + o.version + '. Choose another version.');
    const cf = chunky[0].files.find((f) => f.primary) || chunky[0].files[0]; fs.mkdirSync(path.join(dir, 'plugins')); await download(cf.url, path.join(dir, 'plugins', cf.filename));
    if (crypto.createHash('sha512').update(fs.readFileSync(path.join(dir, 'plugins', cf.filename))).digest('hex') !== cf.hashes.sha512) throw new Error('Chunky did not match its SHA-512.');
    const name = 'ham-' + slug; say('Starting a Paper ' + o.version + ' server to build the world');
    const r = await run('docker', ['run', '-d', '--name', name, '-v', dir + ':/data', '-e', 'EULA=TRUE', '-e', 'TYPE=PAPER', '-e', 'VERSION=' + o.version, '-e', 'MEMORY=' + Math.max(2048, Number(o.memoryMb) || 3072) + 'M', '-e', 'ENABLE_RCON=true', '-e', 'OVERRIDE_SERVER_PROPERTIES=false', 'itzg/minecraft-server:' + dockerTag(javaFor(o.version))]);
    if (r.code) throw new Error('Docker did not start the generator: ' + (r.err || '').trim().split('\n').pop());
    const rcon = (c) => run('docker', ['exec', name, 'rcon-cli', ...c.split(' ')]);
    try {
      await this.waitLog(name, /Done \(/, 900000, say);
      const cx = Math.round(o.centerX || 0), cz = Math.round(o.centerZ || 0);
      for (const c of ['chunky world world', 'chunky shape rectangle', 'chunky center ' + (cx * 16 + 8) + ' ' + (cz * 16 + 8), 'chunky radius ' + (w * 8) + ' ' + (h * 8), 'chunky start']) { const x = await rcon(c); say('> ' + c + '  ' + (x.out || '').trim()); }
      for (const g of o.gamerules || []) await rcon('gamerule ' + g.name + ' ' + g.value);
      if (o.border) { await rcon('worldborder center ' + (cx * 16 + 8) + ' ' + (cz * 16 + 8)); await rcon('worldborder set ' + Math.max(w, h) * 16); }
      await this.waitLog(name, /Task finished for world/i, 6 * 3600e3, say);
      await rcon('save-all flush'); await run('docker', ['stop', '-t', '120', name]);
      say('Copying the world out'); const out = await writeOut(path.join(dir, 'world'), o.output, slug);
      return out;
    } finally { await run('docker', ['rm', '-f', name]).catch(() => {}); }
  }
  waitLog(container, re, ms, say) {
    return new Promise((resolve, reject) => {
      const p = spawn('docker', ['logs', '-f', container]); const t = setTimeout(() => { p.kill(); reject(new Error('It took too long.')); }, ms);
      const on = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => { say(l); if (re.test(l)) { clearTimeout(t); p.kill(); resolve(); } });
      p.stdout.on('data', on); p.stderr.on('data', on); p.on('exit', (c) => { if (c && c !== null) { clearTimeout(t); reject(new Error('The generator stopped.')); } });
    });
  }
  // A worldgen preview of which version capabilities exist: presets come from the version data.
  presets(version) { const v = /^1\.(\d+)/.exec(version); const minor = v ? +v[1] : 99; return ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'].concat(minor >= 19 || !v ? ['minecraft:single_biome_surface'] : []); }
}

module.exports = { Minecraft, FLAVOURS, TARGETS, PROPS, RULES, parseProps, propsObject, updateProps, validateProp, javaFor, dockerTag };
