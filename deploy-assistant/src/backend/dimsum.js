'use strict';
// Dim sum surprise and code names from the public catalog (Ding-Ding-Projects/dim-sum-photos).
// Names come from catalog/index.json; photos only from its published catalog-v1* release assets,
// downloaded once into this app's data folder. Nothing is bundled and nothing else is contacted.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { getJson } = require('./util');

const CATALOG = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const RELEASES = 'https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100';

function getBytes(url, max, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) { reject(new Error('Too many redirects.')); return; }
    const u = new URL(url);
    if (u.protocol !== 'https:') { reject(new Error('Only HTTPS is used.')); return; }
    https.get(url, { headers: { 'User-Agent': 'ham-deploy-assistant' }, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve(getBytes(new URL(res.headers.location, url).toString(), max, redirects + 1)); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Status ' + res.statusCode)); return; }
      const parts = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > max) res.destroy(new Error('Larger than allowed.')); else parts.push(c); });
      res.on('end', () => resolve(Buffer.concat(parts)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Timed out.')); });
  });
}

class DimSum {
  constructor(dir) { this.dir = path.join(dir, 'dimsum'); fs.mkdirSync(this.dir, { recursive: true }); this.file = path.join(this.dir, 'catalog.json'); }

  // Dishes whose photo is published, with the asset URL; refreshed at most once a day.
  async dishes() {
    try { const c = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (Date.now() - c.at < 864e5 && c.dishes.length) return c.dishes; } catch { /* first time */ }
    const cat = JSON.parse((await getBytes(CATALOG, 32 * 1024 * 1024)).toString('utf8'));
    const rels = await getJson(RELEASES);
    const assets = new Map();
    for (const r of rels) if (/^catalog-v1/.test(r.tag_name) && !r.draft) for (const a of r.assets || []) assets.set(a.name, a.browser_download_url);
    const dishes = (cat.dishes || []).map((d) => ({ id: d.id, en: d.name && d.name.en, zh: d.name && d.name.zhHant, altEn: d.image && d.image.alt && d.image.alt.en, altYue: d.image && d.image.alt && d.image.alt.yue, url: d.image && assets.get(path.basename(d.image.path)) }))
      .filter((d) => d.en && d.zh && d.url);
    fs.writeFileSync(this.file, JSON.stringify({ at: Date.now(), dishes }));
    return dishes;
  }

  // One random dish with its photo as a data URL (from the cache when it is there).
  async surprise() {
    const list = await this.dishes();
    if (!list.length) throw new Error('No dish has a published photo yet.');
    const d = list[Math.floor(Math.random() * list.length)];
    const f = path.join(this.dir, d.id + '.png');
    let bytes;
    try { bytes = fs.readFileSync(f); } catch { bytes = await getBytes(d.url, 12 * 1024 * 1024); fs.writeFileSync(f, bytes); }
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The photo is not a PNG.');
    return { id: d.id, en: d.en, zh: d.zh, altEn: d.altEn, altYue: d.altYue, image: 'data:image/png;base64,' + bytes.toString('base64') };
  }
}

module.exports = { DimSum };
