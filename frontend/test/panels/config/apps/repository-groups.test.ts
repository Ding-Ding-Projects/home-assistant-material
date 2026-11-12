import { describe, expect, it } from "vitest";
import { groupRepositories } from "../../../../src/panels/config/apps/repository-groups";

// Protects the repositories page: the five repositories that come with the
// Supervisor are listed as built in (never removable), and only the ones a
// person added are in the removable list.

const repo = (slug: string, name: string) => ({ slug, name });
const compare = (a: string, b: string) => a.localeCompare(b);

describe("groupRepositories", () => {
  it("separates the five built-in repositories from the added ones", () => {
    const { builtIn, own } = groupRepositories(
      [
        repo("local", "Local apps"),
        repo("zzz11111", "Zebra apps"),
        repo("core", "Official apps"),
        repo("a0d7b954", "Community apps"),
        repo("5c53de3b", "ESPHome"),
        repo("d5369777", "Music Assistant"),
        repo("aaa22222", "Alpha apps"),
      ],
      compare
    );
    expect(builtIn.map((r) => r.slug).sort()).toEqual(
      ["5c53de3b", "a0d7b954", "core", "d5369777", "local"].sort()
    );
    expect(own.map((r) => r.name)).toEqual(["Alpha apps", "Zebra apps"]);
  });

  it("sorts each group by name", () => {
    const { builtIn } = groupRepositories(
      [repo("local", "Local"), repo("core", "Core")],
      compare
    );
    expect(builtIn.map((r) => r.name)).toEqual(["Core", "Local"]);
  });

  it("leaves the own list empty when nothing was added", () => {
    const { builtIn, own } = groupRepositories([repo("core", "Core")], compare);
    expect(builtIn).toHaveLength(1);
    expect(own).toEqual([]);
  });
});
