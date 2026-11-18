import { describe, expect, it } from "vitest";
import type { JobNode } from "../../../../src/panels/config/core/updates/update-job-tree";
import {
  flattenJobTree,
  updateJobFacts,
} from "../../../../src/panels/config/core/updates/update-job-tree";
import {
  resolveStart,
  startFoundLater,
} from "../../../../src/panels/config/core/updates/update-start-time";

const NOW = Date.parse("2026-11-18T18:54:00Z");

// The shape `/jobs/info` really returns while Core is updating: the tree is
// nested in child_jobs and no job has a parent_id.
const realTree = (backupDone = true): JobNode[] => [
  {
    name: "home_assistant_core_update",
    reference: null,
    uuid: "root",
    progress: 79,
    stage: null,
    done: null,
    created: "2026-11-18T18:51:59.250123+00:00",
    child_jobs: [
      {
        name: "backup_manager_partial_backup",
        reference: null,
        uuid: "backup",
        progress: 100,
        stage: null,
        done: backupDone ? true : null,
        created: "2026-11-18T18:52:00.100000+00:00",
        child_jobs: [],
      },
      {
        name: "docker_interface_install",
        reference: "homeassistant",
        uuid: "pull",
        progress: 79,
        stage: "Downloading",
        done: null,
        created: "2026-11-18T18:52:20.000000+00:00",
        child_jobs: [],
      },
    ],
  },
];

const load = (tree: JobNode[]) => {
  const jobs = new Map<string, JobNode>();
  flattenJobTree(tree, jobs);
  return jobs;
};

describe("flattenJobTree", () => {
  it("gives every child the id of its parent", () => {
    const jobs = load(realTree());
    expect(jobs.size).toBe(3);
    expect(jobs.get("backup")?.parent_id).toBe("root");
    expect(jobs.get("pull")?.parent_id).toBe("root");
    expect(jobs.get("root")?.parent_id).toBeUndefined();
  });
});

describe("updateJobFacts for a page opened in the middle of an update", () => {
  it("finds the running pull, the backup and the start", () => {
    const facts = updateJobFacts(load(realTree()), "core", undefined);
    expect(facts.root?.uuid).toBe("root");
    expect(facts.leaf?.uuid).toBe("pull");
    expect(facts.backupSeen).toBe(true);
    expect(facts.backupRunning).toBe(false);
    expect(facts.created).toBe("2026-11-18T18:51:59.250123+00:00");
  });

  it("sees a backup that is still running", () => {
    const facts = updateJobFacts(load(realTree(false)), "core", undefined);
    expect(facts.backupRunning).toBe(true);
    expect(facts.backupSeen).toBe(true);
  });

  it("says no backup was made when the tree holds no backup job", () => {
    const tree = realTree();
    tree[0].child_jobs = tree[0].child_jobs!.slice(1);
    const facts = updateJobFacts(load(tree), "core", undefined);
    expect(facts.backupSeen).toBe(false);
  });

  it("falls back to the earliest child when the update job has no time", () => {
    const tree = realTree();
    tree[0].created = null;
    const facts = updateJobFacts(load(tree), "core", undefined);
    expect(facts.created).toBe("2026-11-18T18:52:00.100000+00:00");
  });

  it("ignores another kind's job", () => {
    const facts = updateJobFacts(load(realTree()), "supervisor", undefined);
    expect(facts.root).toBeUndefined();
    expect(facts.backupSeen).toBe(false);
  });

  it("turns an unknown start into the job's start", () => {
    const facts = updateJobFacts(load(realTree()), "core", undefined);
    const start = startFoundLater(
      { startUnknown: true },
      { jobCreated: facts.created },
      NOW
    );
    expect(start).toBe(Date.parse("2026-11-18T18:51:59.250Z"));
    expect(resolveStart({ jobCreated: facts.created }, NOW).source).toBe("job");
  });
});
