import {
  CLOUD_AGENT,
  CORE_LOCAL_AGENT,
  HASSIO_LOCAL_AGENT,
} from "../../../../data/backup";

// Locations that refuse to store an unencrypted backup. Home Assistant Cloud
// raises "Cloud backups must be protected" for an unprotected backup. The
// agent list the backend returns carries no such flag, so this list is
// explicit; every other location (local, network storage) accepts both.
export const AGENTS_REQUIRING_ENCRYPTION: readonly string[] = [CLOUD_AGENT];

export const agentRequiresEncryption = (agentId: string): boolean =>
  AGENTS_REQUIRING_ENCRYPTION.includes(agentId);

// A location can be newly chosen only if it does not need a key or a key is set.
export const isAgentSelectable = (
  agentId: string,
  hasEncryptionKey: boolean
): boolean => hasEncryptionKey || !agentRequiresEncryption(agentId);

export const agentsBlockedWithoutKey = (
  agentIds: readonly string[],
  hasEncryptionKey: boolean
): string[] =>
  hasEncryptionKey
    ? []
    : agentIds.filter((agentId) => agentRequiresEncryption(agentId));

export const dropAgentsRequiringEncryption = (
  agentIds: readonly string[],
  hasEncryptionKey: boolean
): string[] =>
  hasEncryptionKey
    ? [...agentIds]
    : agentIds.filter((agentId) => !agentRequiresEncryption(agentId));

export const defaultBackupAgentIds = (
  isHassio: boolean,
  cloudLoggedIn: boolean,
  hasEncryptionKey: boolean
): string[] => {
  const agents = [isHassio ? HASSIO_LOCAL_AGENT : CORE_LOCAL_AGENT];
  if (cloudLoggedIn && isAgentSelectable(CLOUD_AGENT, hasEncryptionKey)) {
    agents.push(CLOUD_AGENT);
  }
  return agents;
};

export type EncryptionToggleAction = "generate" | "confirm-off" | "none";

// Turning on never replaces an existing key; turning off an existing key
// always asks first.
export const encryptionToggleAction = (
  hasEncryptionKey: boolean,
  wantsOn: boolean
): EncryptionToggleAction => {
  if (wantsOn) {
    return hasEncryptionKey ? "none" : "generate";
  }
  return hasEncryptionKey ? "confirm-off" : "none";
};

export const canGenerateNewKey = (hasEncryptionKey: boolean): boolean =>
  !hasEncryptionKey;
