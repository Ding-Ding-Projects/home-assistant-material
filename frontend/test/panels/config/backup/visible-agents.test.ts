import { describe, expect, it } from "vitest";
import {
  CLOUD_AGENT,
  CORE_LOCAL_AGENT,
  type BackupAgent,
} from "../../../../src/data/backup";
import {
  getUnavailableBackupAgents,
  getVisibleBackupAgents,
} from "../../../../src/panels/config/backup/helper/visible-agents";

const agents: BackupAgent[] = [
  { agent_id: CORE_LOCAL_AGENT, name: "local" },
  { agent_id: CLOUD_AGENT, name: "cloud" },
  { agent_id: "cifs.nas", name: "nas" },
];

describe("backup location list", () => {
  it("never lists the cloud location", () => {
    expect(getVisibleBackupAgents(agents).map((a) => a.agent_id)).toEqual([
      CORE_LOCAL_AGENT,
      "cifs.nas",
    ]);
  });

  it("never offers deletion for a configured cloud location", () => {
    expect(
      getUnavailableBackupAgents([agents[0]], [CORE_LOCAL_AGENT, CLOUD_AGENT])
    ).toEqual([]);
    expect(
      getUnavailableBackupAgents(agents, [CLOUD_AGENT, "cifs.nas"])
    ).toEqual([]);
  });

  it("still lists a missing ordinary location as unavailable", () => {
    expect(
      getUnavailableBackupAgents(
        [agents[0]],
        [CORE_LOCAL_AGENT, CLOUD_AGENT, "cifs.gone"]
      )
    ).toEqual([{ agent_id: "cifs.gone", name: "gone" }]);
  });

  it("does not change the selected ids it is given", () => {
    const selected = [CORE_LOCAL_AGENT, CLOUD_AGENT];
    getUnavailableBackupAgents(agents, selected);
    expect(selected).toEqual([CORE_LOCAL_AGENT, CLOUD_AGENT]);
  });
});
