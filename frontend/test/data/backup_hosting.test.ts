import { describe, expect, it } from "vitest";
import {
  availableHostingTargets,
  hostingJobNeedsKey,
  readyHostingUrl,
} from "../../src/data/backup_hosting";
import type {
  BackupHostingBridge,
  BackupHostingJob,
} from "../../src/data/backup_hosting";

const job = (
  state: string,
  lan_url = "http://192.168.1.20:8123/"
): BackupHostingJob => ({
  id: "job-1",
  request_id: "request-1",
  target: "docker",
  state,
  phase: "verified",
  updated_at: "2026-11-15T00:00:00Z",
  lan_url,
});

describe("backup hosting safety boundaries", () => {
  it("withholds a stale URL until the restored instance is ready", () => {
    for (const state of [
      "queued",
      "running",
      "restoring",
      "waiting_for_restart",
      "needs_attention",
      "cancelled",
      "failed",
    ]) {
      expect(readyHostingUrl(job(state))).toBeUndefined();
    }
    expect(readyHostingUrl(job("ready"))).toBe("http://192.168.1.20:8123/");
  });
  it("rejects executable links and URLs containing credentials", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///config",
      "https://user:password@192.168.1.20/",
      "not a URL",
    ]) {
      expect(readyHostingUrl(job("ready", url))).toBeUndefined();
    }
  });
  it("does not mistake protocol support for an installed runtime", () => {
    const bridge: BackupHostingBridge = {
      id: "computer",
      url: "https://192.168.1.20:48321",
      paired: true,
      capabilities: { targets: ["docker", "virtualbox", "vmware"] },
    };
    expect(availableHostingTargets(bridge)).toEqual([]);
    bridge.capabilities.target_status = {
      docker: { available: true },
      virtualbox: { available: false },
    };
    expect(availableHostingTargets(bridge)).toEqual(["docker"]);
  });
  it("offers key retry only for the explicit incorrect-password result", () => {
    expect(
      hostingJobNeedsKey({
        ...job("needs_attention"),
        error_code: "incorrect_password",
      })
    ).toBe(true);
    expect(
      hostingJobNeedsKey({
        ...job("running"),
        error_code: "incorrect_password",
      })
    ).toBe(false);
    expect(
      hostingJobNeedsKey({
        ...job("needs_attention"),
        error_code: "restore_rejected",
      })
    ).toBe(false);
  });
});
