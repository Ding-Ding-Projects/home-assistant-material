const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");

function git(cwd, args, options = {}) {
  const result = spawnSync("git", args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.toString().trim() || "Git operation failed");
  return result.stdout;
}

function entries(cwd, revision) {
  const rows = git(cwd, ["ls-tree", "-rz", revision]).toString("utf8").split("\0").filter(Boolean);
  return rows.map(row => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(row);
    if (!match || /[\\:\x00-\x1f]/.test(match[3]) || match[3].split("/").some(p => !p || p === "." || p === ".." || /^\.git$/i.test(p))) {
      throw new Error("Unsupported or unsafe path in source snapshot");
    }
    return { path: match[3], mode: match[1], oid: match[2] };
  });
}

// Read exact blob bytes, including symlink targets, without Windows checkout filtering.
async function inventory(cwd, revision) {
  const rows = entries(cwd, revision);
  const ids = [...new Set(rows.map(row => row.oid))];
  const child = spawn("git", ["cat-file", "--batch"], { cwd, windowsHide: true });
  const done = once(child, "close");
  child.stdin.on("error", () => {});
  const hashes = new Map();
  let header = Buffer.alloc(0), remaining = 0, hash, index = 0;
  child.stdin.end(ids.join("\n") + "\n");
  try {
    for await (const chunk of child.stdout) {
      let pos = 0;
      while (pos < chunk.length) {
        if (!hash) {
          const endl = chunk.indexOf(10, pos);
          if (endl < 0) { header = Buffer.concat([header, chunk.subarray(pos)]); break; }
          const line = Buffer.concat([header, chunk.subarray(pos, endl)]).toString();
          const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(line);
          if (!match || match[1] !== ids[index]) throw new Error("Unexpected source object");
          remaining = Number(match[2]);
          header = Buffer.alloc(0);
          hash = crypto.createHash("sha256");
          pos = endl + 1;
        }
        const bytes = Math.min(remaining, chunk.length - pos);
        hash.update(chunk.subarray(pos, pos + bytes));
        remaining -= bytes;
        pos += bytes;
        if (!remaining && pos < chunk.length) {
          if (chunk[pos++] !== 10) throw new Error("Malformed source object");
          hashes.set(ids[index++], hash.digest("hex"));
          hash = undefined;
        }
      }
    }
    const [code] = await done;
    if (code !== 0 || hashes.size !== ids.length) throw new Error("Incomplete source inventory");
  } finally { if (child.exitCode === null) child.kill(); }
  return rows.map(row => ({ ...row, sha256: hashes.get(row.oid) }));
}

async function pack(cwd, destination) {
  const revision = git(cwd, ["rev-parse", "HEAD"]).toString().trim();
  const files = await inventory(cwd, revision);
  const treeAndBlobs = git(cwd, ["ls-tree", "-rt", "--format=%(objectname)", revision]).toString().trim().split("\n");
  const tree = git(cwd, ["rev-parse", revision + "^{tree}"]).toString().trim();
  const objects = [...new Set([revision, tree, ...treeAndBlobs])];
  fs.mkdirSync(destination, { recursive: true });
  const fd = fs.openSync(path.join(destination, "source.pack"), "w");
  try { git(cwd, ["pack-objects", "--stdout", "--threads=2"], { input: objects.join("\n") + "\n", stdio: ["pipe", fd, "pipe"] }); }
  finally { fs.closeSync(fd); }
  fs.writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({ revision, files }));
  console.log("Embedded " + files.length + " source files at " + revision);
}

async function restore(resources, cache) {
  const manifest = JSON.parse(fs.readFileSync(path.join(resources, "manifest.json"), "utf8"));
  const revision = manifest.revision;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid embedded revision");
  const target = path.join(cache, revision);
  if (fs.existsSync(target)) {
    if (git(target, ["rev-parse", "HEAD"]).toString().trim() !== revision) throw new Error("Cached source revision changed");
    return target;
  }
  fs.mkdirSync(cache, { recursive: true });
  const work = fs.mkdtempSync(path.join(cache, "extract-"));
  try {
    git(work, ["init", "--quiet"]);
    fs.writeFileSync(path.join(work, ".git", "shallow"), revision + "\n");
    const fd = fs.openSync(path.join(resources, "source.pack"), "r");
    try { git(work, ["index-pack", "--stdin"], { stdio: [fd, "pipe", "pipe"] }); }
    finally { fs.closeSync(fd); }
    if (JSON.stringify(await inventory(work, revision)) !== JSON.stringify(manifest.files)) throw new Error("Embedded file manifest mismatch");
    git(work, ["-c", "core.protectNTFS=true", "-c", "core.longpaths=true", "-c", "core.autocrlf=false", "-c", "core.symlinks=false", "checkout", "--detach", revision]);
    fs.renameSync(work, target);
    return target;
  } finally { fs.rmSync(work, { force: true, recursive: true }); }
}

module.exports = { inventory, pack, restore };
if (require.main === module && process.argv[2] === "pack") {
  pack(path.resolve(__dirname, ".."), path.join(__dirname, ".snapshot")).catch(err => { console.error(err.message); process.exitCode = 1; });
}
