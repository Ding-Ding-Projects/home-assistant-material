import type { BackupAgent } from "../../../../data/backup";
import { CLOUD_AGENT } from "../../../../data/backup";

// The hosted cloud location is never listed, never offered for deletion and
// never described. A server that already has it in its configuration keeps
// it: only the list shown to the person is filtered, never the stored value.
export const isHiddenBackupAgent = (agentId: string): boolean =>
  agentId === CLOUD_AGENT;

export const getVisibleBackupAgents = (agents: BackupAgent[]): BackupAgent[] =>
  agents.filter((agent) => !isHiddenBackupAgent(agent.agent_id));

// Selected locations the server no longer reports, which the person may clear.
// A hidden location is not "unavailable": it is simply not shown.
export const getUnavailableBackupAgents = (
  agents: BackupAgent[],
  selectedAgentIds: string[]
): BackupAgent[] => {
  const reported = new Set(agents.map((agent) => agent.agent_id));
  return selectedAgentIds
    .filter((id) => !reported.has(id) && !isHiddenBackupAgent(id))
    .map<BackupAgent>((id) => ({
      agent_id: id,
      // The id is the only name there is for a location that is not reported
      name: id.split(".")[1] || id,
    }));
};
