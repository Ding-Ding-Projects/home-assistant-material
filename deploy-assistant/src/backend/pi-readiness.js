"use strict";
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const DEFAULT_URLS = ["http://homeassistant.local", "http://homeassistant.local:8123"];
function localAddress(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const privateV4 = net.isIP(host) === 4 && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname) || !(privateV4 || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local$/.test(host))) {
    throw new Error("Enter the device's http:// or https:// LAN address, without credentials, a path, query or fragment.");
  }
  return url.origin;
}

// Bounded, unauthenticated, no redirects. A response body is never logged.
function readJson(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const request = (url.startsWith("https:") ? https : http).get(url, { timeout: 5000, headers: { Accept: "application/json, application/manifest+json" } }, (response) => {
      if (response.statusCode !== 200 || !/^application\/(?:json|manifest\+json)(?:;|$)/i.test(response.headers["content-type"] || "")) { response.resume(); finish(null); return; }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; if (Buffer.byteLength(body) > 65536) { response.destroy(); finish(null); } });
      response.on("error", () => finish(null));
      response.on("end", () => { try { finish({ body: JSON.parse(body), address: response.socket?.remoteAddress || "" }); } catch { finish(null); } });
    });
    const timer = setTimeout(() => { request.destroy(); finish(null); }, 5000);
    request.on("error", () => finish(null));
    request.on("timeout", () => { request.destroy(); finish(null); });
  });
}
function onboardingState(body) {
  if (!Array.isArray(body) || body.length < 3 || body.length > 8) return undefined;
  if (body.some((row) => !row || typeof row.step !== "string" || typeof row.done !== "boolean")) return undefined;
  if (new Set(body.map((row) => row.step)).size !== body.length) return undefined;
  if (!["user", "core_config", "integration"].every((step) => body.some((row) => row.step === step))) return undefined;
  return body.find((row) => row.step === "user").done ? "complete" : "required";
}
function coreManifest(body) {
  return !!body && body.name === "Home Assistant" && body.short_name === "Home Assistant" && body.start_url === "/?homescreen=1" && body.id === "/?homescreen=1" && Array.isArray(body.icons) && body.icons.length > 0;
}
async function probeCore(url, { requestJson = readJson } = {}) {
  const base = localAddress(url);
  const status = await requestJson(base + "/api/onboarding");
  const ownerSetup = onboardingState(status?.body);
  if (ownerSetup) return { url: base, address: status.address || "", ownerSetup, evidence: "onboarding" };
  // Completed onboarding is no longer registered after a subsequent Core restart.
  // The preparation service returns 401 for /api/* and 404 for /manifest.json.
  const manifest = await requestJson(base + "/manifest.json");
  if (coreManifest(manifest?.body)) return { url: base, address: manifest.address || "", ownerSetup: "unknown", evidence: "core-manifest" };
  return null;
}
async function candidates(urls = DEFAULT_URLS, probe = probeCore) {
  return (await Promise.all(urls.map((url) => probe(url).catch(() => null)))).filter(Boolean);
}
function assessCandidates(found, baseline = [], explicit = false) {
  if (!found.length) return { status: "unreachable", ownerSetup: "unknown", piIdentity: "unverified" };
  const distinct = new Set(found.map((item) => item.address || item.url));
  if (!explicit && (distinct.size > 1 || found.some((item) => baseline.some((old) => old.url === item.url || (old.address && old.address === item.address))))) {
    return { status: "ambiguous", candidateUrl: found[0].url, ownerSetup: found[0].ownerSetup, piIdentity: "unverified" };
  }
  return { status: "ready", ...found[0], piIdentity: explicit ? "address-selected" : "unverified" };
}
module.exports = { DEFAULT_URLS, readJson, localAddress, probeCore, candidates, assessCandidates, onboardingState, coreManifest };
