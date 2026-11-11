import { describe, expect, it } from "vitest";
import {
  emptyMinecraftDraft,
  minecraftDraftPayload,
  parseMinecraftNumber,
  validateMinecraftDraft,
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
