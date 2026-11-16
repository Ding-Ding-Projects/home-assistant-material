"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { probeCore, assessCandidates, localAddress } = require("../src/backend/pi-readiness");
const { waitForPi } = require("../src/backend/pi-writer");
const { Manager } = require("../src/backend/manager");
const onboarding = (done) => ["user", "core_config", "integration"].map((step) => ({ step, done }));
const known = { url: "http://homeassistant.local", address: "192.168.1.40", ownerSetup: "required", evidence: "onboarding" };

test("Core owner setup pending is already appliance-service readiness", async () => {
  const urls = [];
  const result = await probeCore(known.url, { requestJson: async (url) => { urls.push(url); return { body: onboarding(false), address: known.address }; } });
  assert.equal(result.ownerSetup, "required");
  assert.equal(result.evidence, "onboarding");
  assert.deepEqual(urls, ["http://homeassistant.local/api/onboarding"]);
});
test("preparation pages, unrelated JSON and incomplete onboarding shapes do not count", async () => {
  for (const body of ["<html>Preparing</html>", { ready: true }, [{ step: "user", done: false }], [{ step: "user", done: "false" }], []]) {
    assert.equal(await probeCore(known.url, { requestJson: async () => ({ body }) }), null);
  }
});
test("exact Core manifest is a fallback, never proof of owner completion", async () => {
  const result = await probeCore(known.url, { requestJson: async (url) => url.endsWith("/api/onboarding") ? null : { body: { name: "Home Assistant", short_name: "Home Assistant", id: "/?homescreen=1", start_url: "/?homescreen=1", icons: [{ src: "/static/icons/favicon-192x192.png" }] }, address: known.address } });
  assert.equal(result.ownerSetup, "unknown");
  assert.equal(result.evidence, "core-manifest");
});
test("pre-existing and distinct responders stay ambiguous until an address is selected", () => {
  assert.equal(assessCandidates([known], [known]).status, "ambiguous");
  assert.equal(assessCandidates([known, { ...known, address: "192.168.1.41" }]).status, "ambiguous");
  assert.equal(assessCandidates([known], []).piIdentity, "unverified");
  assert.equal(assessCandidates([known], [known], true).piIdentity, "address-selected");
});
test("manual address validation rejects credential-bearing or non-LAN targets", () => {
  for (const address of ["http://user:pass@192.168.1.40", "http://example.com", "file:///tmp", "http://192.168.1.40/api", "http://192.168.1.40/?token=value"]) assert.throws(() => localAddress(address));
  assert.equal(localAddress("http://192.168.1.40:8123/"), "http://192.168.1.40:8123");
});
test("discovery is bounded and never waits for browser owner completion", async () => {
  let clock = 0;
  const absent = await waitForPi(() => {}, 0.001, { probe: async () => null, now: () => clock, pause: async (ms) => { clock += ms; } });
  assert.equal(absent.status, "unreachable");
  const ready = await waitForPi(() => {}, 0, { probe: async (url) => url.endsWith(":8123") ? null : known });
  assert.equal(ready.status, "ready"); assert.equal(ready.ownerSetup, "required");
});
test("verification is durable before waiting, and Check never rewrites verified media", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-pi-readiness-test-"));
  try {
    let writes = 0; let waits = 0;
    const writer = {
      baseline: async () => [],
      write: async () => { writes++; return { state: "done", written: 4096, sha256: "a".repeat(64) }; },
      waitForPi: async (_log, _minutes, options) => {
        waits++;
        const stored = JSON.parse(fs.readFileSync(path.join(dir, "instances.json"), "utf8")).instances[0];
        assert.equal(stored.imagingVerified, true);
        assert.equal(stored.imagingVerification.written, 4096);
        assert.equal(stored.imagingVerification.sha256, "a".repeat(64));
        return waits === 1 ? { status: "unreachable", ownerSetup: "unknown" } : { status: "ready", ...known, url: options.url, piIdentity: "address-selected" };
      },
    };
    const manager = new Manager(dir, { piWriter: writer, imageFetcher: async () => ({ file: "synthetic-image.img" }) });
    const done = once(manager, "done");
    const id = await manager.writePi({ model: "rpi5", drive: { id: "test-only-not-a-device", name: "Synthetic" }, name: "Test Pi" });
    const [event] = await done;
    assert.equal(event.ok, false);
    assert.equal(manager.get(id).state, "awaiting-device");
    assert.equal(manager.get(id).piPhase, "unreachable");
    assert.equal(manager.get(id).imagingVerified, true);
    await manager.run(id, "check", { url: "http://192.168.1.40" });
    assert.equal(writes, 1);
    assert.equal(manager.get(id).state, "running");
    assert.equal(manager.get(id).ownerSetup, "required");
    assert.equal(manager.get(id).piIdentity, "address-selected");
    await manager.run(id, "check");
    assert.equal(manager.get(id).url, "http://192.168.1.40");
    assert.equal(writes, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test("HTTP readiness transport rejects redirects, authentication pages and oversized bodies", async (t) => {
  const http = require("node:http");
  const { EventEmitter } = require("node:events");
  const { readJson } = require("../src/backend/pi-readiness");
  let status = 302; let contentType = "application/json"; let body = "{}"; let requests = 0;
  t.mock.method(http, "get", (_url, _options, callback) => {
    requests++;
    const request = new EventEmitter(); request.destroy = () => {};
    queueMicrotask(() => {
      const response = new EventEmitter();
      Object.assign(response, { statusCode: status, headers: { "content-type": contentType }, socket: { remoteAddress: "192.168.1.40" }, resume() {}, setEncoding() {}, destroy() {} });
      callback(response); response.emit("data", body); response.emit("end");
    });
    return request;
  });
  for (const code of [302, 401, 404, 500]) { status = code; assert.equal(await readJson("http://homeassistant.local/api/onboarding"), null); }
  assert.equal(requests, 4);
  status = 200; contentType = "text/html"; assert.equal(await readJson("http://homeassistant.local/api/onboarding"), null);
  contentType = "application/json"; body = " ".repeat(65537); assert.equal(await readJson("http://homeassistant.local/api/onboarding"), null);
  body = JSON.stringify(onboarding(false));
  const result = await readJson("http://homeassistant.local/api/onboarding");
  assert.deepEqual(result.body, onboarding(false));
  assert.equal(result.address, "192.168.1.40");
});
