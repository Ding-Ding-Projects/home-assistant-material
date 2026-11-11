import { describe, expect, it } from "vitest";
import type { AutomationRepository } from "../../../../src/data/automation_repos";
import {
  describeRepoStrip,
  readUnpushed,
  remoteHost,
} from "../../../../src/panels/config/automation/repo-strip-logic";

const repo = (
  extra: Partial<AutomationRepository> & Record<string, unknown> = {}
): AutomationRepository => ({
  id: "a1",
  alias: "Lights",
  repository: "automations/a1",
  head: "0123456789abcdef",
  commits: 4,
  dirty: false,
  remote: null,
  remote_unsafe: false,
  ...extra,
});

describe("remoteHost", () => {
  it("returns only the host of each kind of address", () => {
    expect(remoteHost("https://git.example.com/me/repo.git")).toBe(
      "git.example.com"
    );
    expect(remoteHost("ssh://git@host.example:2222/me/repo")).toBe(
      "host.example"
    );
    expect(remoteHost("git@github.com:me/repo.git")).toBe("github.com");
  });

  it("never returns a credential, even one that should not be there", () => {
    expect(remoteHost("https://user:secret@git.example.com/x")).toBe(
      "git.example.com"
    );
  });

  it("never shows part of a password that holds an unescaped @", () => {
    expect(remoteHost("https://user:p@ss@host.example/repo")).toBe(
      "host.example"
    );
    expect(remoteHost("https://user:p@ss@host.example:8443/a@b")).toBe(
      "host.example"
    );
    expect(remoteHost("https://user:pw@[2001:db8::1]:443/x")).toBe(
      "[2001:db8::1]"
    );
  });

  it("has no host for a folder or nothing", () => {
    expect(remoteHost("/srv/backup/repo.git")).toBeUndefined();
    expect(remoteHost(null)).toBeUndefined();
    expect(remoteHost("  ")).toBeUndefined();
    expect(remoteHost("not an address")).toBeUndefined();
  });
});

describe("readUnpushed", () => {
  it("reads only a whole number that is not negative", () => {
    expect(readUnpushed({ unpushed: 3 })).toBe(3);
    expect(readUnpushed({ unpushed: 0 })).toBe(0);
    expect(readUnpushed({ unpushed: -1 })).toBeUndefined();
    expect(readUnpushed({ unpushed: 1.5 })).toBeUndefined();
    expect(readUnpushed({ unpushed: "2" })).toBeUndefined();
    expect(readUnpushed({})).toBeUndefined();
    expect(readUnpushed(undefined)).toBeUndefined();
  });
});

describe("describeRepoStrip", () => {
  it("reports a working copy that matches the last commit", () => {
    const state = describeRepoStrip(repo());
    expect(state.match).toBe("matches");
    expect(state.headShort).toBe("0123456");
    expect(state.versions).toBe(4);
  });

  it("reports a diverged working copy", () => {
    expect(describeRepoStrip(repo({ dirty: true })).match).toBe("diverged");
  });

  it("says nothing about matching when there is no commit yet", () => {
    const state = describeRepoStrip(repo({ head: null, commits: 0 }));
    expect(state.match).toBe("unknown");
    expect(state.headShort).toBeUndefined();
    expect(state.versions).toBe(0);
  });

  it("has no remote", () => {
    const state = describeRepoStrip(repo({ unpushed: 2 }));
    expect(state.remoteKind).toBe("none");
    expect(state.remoteHost).toBeUndefined();
    expect(state.unpushed).toBeUndefined();
  });

  it("shows the host and the unpushed count of a remote", () => {
    const state = describeRepoStrip(
      repo({ remote: "https://git.example.com/me/a1.git", unpushed: 2 })
    );
    expect(state.remoteKind).toBe("host");
    expect(state.remoteHost).toBe("git.example.com");
    expect(state.unpushed).toBe(2);
  });

  it("does not guess an unpushed count the server did not report", () => {
    const state = describeRepoStrip(
      repo({ remote: "git@github.com:me/a1.git" })
    );
    expect(state.unpushed).toBeUndefined();
  });

  it("hides a remote the server marked unsafe", () => {
    const state = describeRepoStrip(
      repo({ remote: "https://x.example/y", remote_unsafe: true })
    );
    expect(state.remoteKind).toBe("unsafe");
    expect(state.remoteHost).toBeUndefined();
  });

  it("treats a folder remote as local", () => {
    const state = describeRepoStrip(repo({ remote: "/srv/a1.git" }));
    expect(state.remoteKind).toBe("local");
    expect(state.remoteHost).toBeUndefined();
  });
});
