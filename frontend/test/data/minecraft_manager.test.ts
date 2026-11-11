import { describe, expect, it } from "vitest";
import {
  authorizedKeysCommand,
  emptyMinecraftDraft,
  emptyMinecraftHostDraft,
  filterMinecraftVersions,
  minecraftDraftPayload,
  minecraftJoinAddress,
  parseMinecraftNumber,
  validateMinecraftDraft,
  validateMinecraftHostDraft,
  versionsForFlavour,
} from "../../src/data/minecraft_manager";
import type { MinecraftServerDraft } from "../../src/data/minecraft_manager";

const valid = (): MinecraftServerDraft => ({
  ...emptyMinecraftDraft(),
  name: "Family survival",
});

describe("validateMinecraftDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateMinecraftDraft(valid())).toEqual([]);
  });

  it("requires a name and rejects odd characters", () => {
    expect(validateMinecraftDraft({ ...valid(), name: "  " })).toContainEqual({
      field: "name",
      code: "required",
    });
    expect(validateMinecraftDraft({ ...valid(), name: "-x" })).toContainEqual({
      field: "name",
      code: "invalid_characters",
    });
    expect(
      validateMinecraftDraft({ ...valid(), name: "x".repeat(49) })
    ).toContainEqual({ field: "name", code: "too_long" });
  });

  it("checks the flavour against the edition", () => {
    expect(
      validateMinecraftDraft({
        ...valid(),
        edition: "bedrock",
        flavour: "paper",
      })
    ).toContainEqual({ field: "flavour", code: "invalid_choice" });
  });

  it("rejects a version that is not a plain version string", () => {
    expect(
      validateMinecraftDraft({ ...valid(), version: "1.21; rm" })
    ).toContainEqual({ field: "version", code: "invalid_version" });
  });

  it("limits the port and the memory", () => {
    const errors = validateMinecraftDraft({
      ...valid(),
      port: 80,
      memory_mb: undefined,
    });
    expect(errors).toContainEqual({ field: "port", code: "out_of_range" });
    expect(errors).toContainEqual({ field: "memory_mb", code: "out_of_range" });
  });
});

describe("helpers", () => {
  it("parses whole numbers only", () => {
    expect(parseMinecraftNumber("25565")).toBe(25565);
    expect(parseMinecraftNumber("")).toBeUndefined();
    expect(parseMinecraftNumber("12.5")).toBeUndefined();
    expect(parseMinecraftNumber("-4")).toBeUndefined();
  });

  it("trims the name in the payload", () => {
    expect(minecraftDraftPayload({ ...valid(), name: "  Spawn  " }).name).toBe(
      "Spawn"
    );
  });
});

describe("host validation", () => {
  const host = () => ({
    ...emptyMinecraftHostDraft(),
    name: "Garage",
    address: "192.168.1.20",
    user: "docker",
  });

  it("accepts a complete host", () => {
    expect(validateMinecraftHostDraft(host())).toEqual([]);
  });

  it.each(["999.1.1.1", "a b", "-oProxyCommand=x", "host_name", ""])(
    "rejects the address %s",
    (address) => {
      expect(
        validateMinecraftHostDraft({ ...host(), address }).some(
          (error) => error.field === "address"
        )
      ).toBe(true);
    }
  );

  it("accepts a name, an IPv4 and an IPv6 address", () => {
    for (const address of ["garage.local", "10.0.0.5", "fd00::5"]) {
      expect(validateMinecraftHostDraft({ ...host(), address })).toEqual([]);
    }
  });

  it("rejects a bad user and port", () => {
    const errors = validateMinecraftHostDraft({
      ...host(),
      user: "root; id",
      port: 0,
    });
    expect(errors).toContainEqual({ field: "user", code: "invalid_user" });
    expect(errors).toContainEqual({ field: "port", code: "out_of_range" });
  });
});

describe("version list", () => {
  const entries = [
    { id: "25w45a", type: "snapshot" as const },
    { id: "1.21.4", type: "release" as const },
    { id: "1.20.6", type: "release" as const },
  ];

  it("filters by kind and by typed text, ignoring case", () => {
    expect(filterMinecraftVersions(entries, "release", "")).toHaveLength(2);
    expect(filterMinecraftVersions(entries, "all", "25W")).toEqual([
      entries[0],
    ]);
    expect(filterMinecraftVersions(entries, "release", "1.21")).toEqual([
      entries[1],
    ]);
  });

  it("has a list only for flavours that have a source", () => {
    const lists = { fetched_at: null, vanilla: entries, paper: [] };
    expect(versionsForFlavour(lists, "vanilla")).toBe(entries);
    expect(versionsForFlavour(lists, "fabric")).toBeUndefined();
    expect(versionsForFlavour(undefined, "paper")).toBeUndefined();
  });
});

describe("addresses", () => {
  it("brackets an IPv6 join address", () => {
    expect(minecraftJoinAddress("192.168.1.20", 25565)).toBe(
      "192.168.1.20:25565"
    );
    expect(minecraftJoinAddress("fd00::5", 25565)).toBe("[fd00::5]:25565");
  });

  it("builds the authorized_keys line from the public key only", () => {
    expect(authorizedKeysCommand("ssh-ed25519 AAAA comment")).toBe(
      "mkdir -p ~/.ssh && chmod 700 ~/.ssh && " +
        "printf '\\n%s\\n' 'restrict ssh-ed25519 AAAA comment' >> ~/.ssh/authorized_keys && " +
        "chmod 600 ~/.ssh/authorized_keys"
    );
  });

  it("keeps a quote in the key comment inside the quoted entry", () => {
    expect(authorizedKeysCommand("ssh-ed25519 AAAA it's")).toContain(
      "'restrict ssh-ed25519 AAAA it'\\''s'"
    );
  });
});
