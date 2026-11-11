import { describe, expect, it } from "vitest";
import {
  CLOUD_AGENT,
  CORE_LOCAL_AGENT,
  HASSIO_LOCAL_AGENT,
} from "../../../../src/data/backup";
import {
  agentRequiresEncryption,
  agentsBlockedWithoutKey,
  canGenerateNewKey,
  defaultBackupAgentIds,
  dropAgentsRequiringEncryption,
  encryptionToggleAction,
  isAgentSelectable,
} from "../../../../src/panels/config/backup/helper/backup-encryption";

describe("backup encryption decisions", () => {
  it("knows which locations refuse unencrypted backups", () => {
    expect(agentRequiresEncryption(CLOUD_AGENT)).toBe(true);
    expect(agentRequiresEncryption(CORE_LOCAL_AGENT)).toBe(false);
    expect(agentRequiresEncryption("hassio.my_share")).toBe(false);
  });

  it("only allows a protected-only location when a key is set", () => {
    expect(isAgentSelectable(CLOUD_AGENT, false)).toBe(false);
    expect(isAgentSelectable(CLOUD_AGENT, true)).toBe(true);
    expect(isAgentSelectable(CORE_LOCAL_AGENT, false)).toBe(true);
  });

  it("drops blocked locations only without a key", () => {
    const ids = [CORE_LOCAL_AGENT, CLOUD_AGENT];
    expect(dropAgentsRequiringEncryption(ids, false)).toEqual([
      CORE_LOCAL_AGENT,
    ]);
    expect(dropAgentsRequiringEncryption(ids, true)).toEqual(ids);
    expect(agentsBlockedWithoutKey(ids, false)).toEqual([CLOUD_AGENT]);
    expect(agentsBlockedWithoutKey(ids, true)).toEqual([]);
  });

  it("does not default to the cloud location without a key", () => {
    expect(defaultBackupAgentIds(false, true, false)).toEqual([
      CORE_LOCAL_AGENT,
    ]);
    expect(defaultBackupAgentIds(true, true, false)).toEqual([
      HASSIO_LOCAL_AGENT,
    ]);
    expect(defaultBackupAgentIds(false, true, true)).toEqual([
      CORE_LOCAL_AGENT,
      CLOUD_AGENT,
    ]);
    expect(defaultBackupAgentIds(false, false, true)).toEqual([
      CORE_LOCAL_AGENT,
    ]);
  });

  it("never regenerates over an existing key and confirms turning off", () => {
    expect(encryptionToggleAction(false, true)).toBe("generate");
    expect(encryptionToggleAction(true, true)).toBe("none");
    expect(encryptionToggleAction(true, false)).toBe("confirm-off");
    expect(encryptionToggleAction(false, false)).toBe("none");
    expect(canGenerateNewKey(true)).toBe(false);
    expect(canGenerateNewKey(false)).toBe(true);
  });
});
