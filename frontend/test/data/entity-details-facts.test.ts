import { describe, expect, it } from "vitest";
import { listFacts, userFacts } from "../../src/data/entity-details";

describe("listFacts", () => {
  it("leaves out empty values and writes yes/no as true or false", () => {
    expect(
      listFacts([
        ["label_id", "kitchen"],
        ["description", null, "text"],
        ["icon", ""],
        ["require_admin", false, "yesno"],
        ["groups", []],
        ["device_trackers", ["device_tracker.a", "device_tracker.b"]],
      ])
    ).toEqual([
      { key: "label_id", value: "kitchen", kind: "mono" },
      { key: "require_admin", value: "false", kind: "yesno" },
      {
        key: "device_trackers",
        value: "device_tracker.a\ndevice_tracker.b",
        kind: "mono",
      },
    ]);
  });

  it("keeps a link's address", () => {
    expect(
      listFacts([["source_url", "https://a.b/c", "link", "https://a.b/c"]])
    ).toEqual([
      {
        key: "source_url",
        value: "https://a.b/c",
        kind: "link",
        href: "https://a.b/c",
      },
    ]);
  });
});

describe("userFacts", () => {
  it("shows only the safe fields of a user, whatever else it holds", () => {
    const user = {
      id: "abc",
      name: "Sam",
      group_ids: ["system-admin"],
      is_owner: true,
      is_active: true,
      local_only: false,
      system_generated: false,
      credentials: [{ type: "homeassistant" }],
      password: "secret",
      mfa_modules: [{ id: "totp", enabled: true }],
    };
    const facts = userFacts(user);
    expect(facts.map((item) => item.key)).toEqual([
      "user_id",
      "name",
      "groups",
      "is_owner",
      "is_active",
      "local_only",
      "system_generated",
    ]);
    const text = JSON.stringify(facts);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("totp");
    expect(text).not.toContain("homeassistant");
  });
});
