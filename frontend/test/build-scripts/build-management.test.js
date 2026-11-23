/**
 * @vitest-environment node
 */

import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireProcessRecord,
  processStartTime,
  releaseProcessRecord,
} from "../../build-scripts/managed-process.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const temporaryDirectories = [];

const runNode = (args, env = {}) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        cwd: repoRoot,
        env: { ...process.env, ...env },
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      }
    );
  });

const temporaryDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ha-build-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

const writeOwner = async (owner) => {
  const cache = await temporaryDirectory();
  const lockFile = path.join(cache, "ha-workflow.lock");
  const record = {
    pid: process.pid,
    startTime: processStartTime(process.pid),
    ...owner,
  };
  await writeFile(lockFile, JSON.stringify(record));
  return { cache, lockFile, record };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("build management CLIs", () => {
  it("keeps type checking out of a gallery build that owns the generated files", async () => {
    const { cache, lockFile, record } = await writeOwner({
      kind: "output",
      target: "build-gallery",
      token: "gallery",
    });
    const result = await runNode(["build-scripts/check-types.mjs"], {
      HA_BUILD_CACHE_DIR: cache,
    });
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("already owns");
    expect(JSON.parse(await readFile(lockFile, "utf8"))).toEqual(record);
  }, 30_000);

  it("blocks a managed workflow when another owns the output", async () => {
    const { cache } = await writeOwner({ kind: "build", token: "build" });

    const result = await runNode(
      ["build-scripts/dev-server.mjs", "--suite", "app", "--background"],
      { HA_BUILD_CACHE_DIR: cache }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Frontend build already running");
  });

  it("does not stop another development suite", async () => {
    const { cache, lockFile, record } = await writeOwner({
      kind: "dev",
      suite: "demo",
      token: "demo",
    });

    const result = await runNode(
      ["build-scripts/dev-server.mjs", "--suite", "gallery", "--stop"],
      { HA_BUILD_CACHE_DIR: cache }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dev server (gallery) not running");
    expect(JSON.parse(await readFile(lockFile, "utf8"))).toEqual(record);
  });

  it("keeps an exact process suite start idempotent", async () => {
    const { cache } = await writeOwner({
      kind: "dev",
      suite: "app",
      token: "app",
    });

    const result = await runNode(
      ["build-scripts/dev-server.mjs", "--suite", "app", "--background"],
      { HA_BUILD_CACHE_DIR: cache }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dev server (app) already running");
  });
});

describe("workflow ownership", () => {
  const startLockOwner = async () => {
    const cache = await temporaryDirectory();
    const lockFile = path.join(cache, "ha-workflow.lock");
    const script = [
      'import { createWorkflowLockTask } from "./build-scripts/output-lock.mjs";',
      'await createWorkflowLockTask("test")();',
      'process.once("message", () => process.exit(0));',
      'process.stdout.write("ready\\n");',
      "setInterval(() => {}, 10000);",
    ].join("");
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: repoRoot,
        env: { ...process.env, HA_BUILD_CACHE_DIR: cache },
        stdio: ["ignore", "pipe", "inherit", "ipc"],
      }
    );
    await new Promise((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("error", reject);
    });

    const exited = new Promise((resolve) => child.once("exit", resolve));
    return { child, exited, lockFile };
  };

  it("removes its lock on graceful process exit", async () => {
    const { child, exited, lockFile } = await startLockOwner();
    // Windows terminates immediately on SIGTERM. Use a cooperative exit there.
    if (process.platform === "win32") {
      child.send("finish");
    } else {
      child.kill("SIGTERM");
    }
    await exited;
    await expect(readFile(lockFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reclaims a lock after a forced exit through the next normal acquisition", async () => {
    const { child, exited, lockFile } = await startLockOwner();
    child.kill("SIGKILL");
    await exited;
    const next = {
      pid: process.pid,
      startTime: processStartTime(process.pid),
      token: "next",
    };
    expect(acquireProcessRecord(lockFile, next).acquired).toBe(true);
    expect(JSON.parse(await readFile(lockFile, "utf8"))).toEqual(next);
    releaseProcessRecord(lockFile, next.token);
    await expect(readFile(lockFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps type-check ownership while either the compiler or coordinator is alive", async () => {
    const { child, exited, lockFile } = await startLockOwner();
    const ended = JSON.parse(await readFile(lockFile, "utf8"));
    child.kill("SIGKILL");
    await exited;
    const live = { pid: process.pid, startTime: processStartTime(process.pid) };
    for (const [compiler, coordinator] of [
      [live, ended],
      [ended, live],
    ]) {
      const entry = {
        ...compiler,
        coordinator,
        token: "type-check",
        kind: "output",
      };
      await writeFile(lockFile, JSON.stringify(entry));
      expect(
        acquireProcessRecord(lockFile, { ...live, token: "other" }).acquired
      ).toBe(false);
      expect(JSON.parse(await readFile(lockFile, "utf8"))).toEqual(entry);
    }
    await writeFile(
      lockFile,
      JSON.stringify({ ...ended, coordinator: ended, token: "type-check" })
    );
    expect(
      acquireProcessRecord(lockFile, { ...live, token: "other" }).acquired
    ).toBe(true);
    releaseProcessRecord(lockFile, "other");
  });

  it("preserves a live owner without a recorded start time", async () => {
    const { lockFile } = await writeOwner({
      startTime: undefined,
      token: "old",
    });
    const original = await readFile(lockFile, "utf8");
    expect(() =>
      acquireProcessRecord(lockFile, { pid: process.pid, token: "new" })
    ).toThrow(/Cannot verify the start time/);
    expect(await readFile(lockFile, "utf8")).toBe(original);
  });

  it("retains a live owner when its stored clock uses a different representation", async () => {
    const currentStart = processStartTime(process.pid);
    const otherClock = currentStart.startsWith("ps-utc:")
      ? "123"
      : "ps-utc:Sun Nov 22 12:00:00 2026";
    const { lockFile } = await writeOwner({
      startTime: otherClock,
      token: "old",
    });
    const original = await readFile(lockFile, "utf8");
    expect(() =>
      acquireProcessRecord(lockFile, { pid: process.pid, token: "new" })
    ).toThrow(/Cannot verify the start time/);
    expect(await readFile(lockFile, "utf8")).toBe(original);
  });
});
