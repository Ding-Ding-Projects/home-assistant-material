import { describe, expect, it } from "vitest";
import type { AutoUpdateInfo } from "../../src/data/auto-update";
import {
  autoUpdateRowState,
  formatAutoUpdateTime,
} from "../../src/data/auto-update";

const info = (all: boolean): AutoUpdateInfo => ({
  all,
  backup: true,
  entities: [
    {
      entity_id: "update.plain",
      enabled: all,
      override: null,
      allowed: true,
      protected_reason: null,
      last_result: null,
    },
    {
      entity_id: "update.chosen_on",
      enabled: true,
      override: true,
      allowed: true,
      protected_reason: null,
      last_result: null,
    },
    {
      entity_id: "update.chosen_off",
      enabled: false,
      override: false,
      allowed: true,
      protected_reason: null,
      last_result: null,
    },
    {
      entity_id: "update.home_assistant_core_update",
      enabled: false,
      override: null,
      allowed: false,
      protected_reason: "restarts_system",
      last_result: null,
    },
  ],
});

describe("autoUpdateRowState", () => {
  it("follows the switch for everything when the row has no choice", () => {
    expect(autoUpdateRowState(info(false), "update.plain").checked).toBe(false);
    expect(autoUpdateRowState(info(true), "update.plain").checked).toBe(true);
  });

  it("lets the row's own choice win over the switch for everything", () => {
    expect(autoUpdateRowState(info(false), "update.chosen_on").checked).toBe(
      true
    );
    expect(autoUpdateRowState(info(true), "update.chosen_off").checked).toBe(
      false
    );
  });

  it("keeps the updates that restart the system off and disabled", () => {
    expect(
      autoUpdateRowState(info(true), "update.home_assistant_core_update")
    ).toEqual({ checked: false, disabled: true, reason: "restarts_system" });
  });

  it("disables the row when the server does not know the entity", () => {
    expect(autoUpdateRowState(info(true), "update.missing").disabled).toBe(
      true
    );
    expect(autoUpdateRowState(undefined, "update.plain").disabled).toBe(true);
  });
});

describe("formatAutoUpdateTime", () => {
  it("uses 24-hour time", () => {
    const iso = new Date(2026, 10, 13, 14, 5).toISOString();
    expect(formatAutoUpdateTime(iso, "en-US")).toBe("14:05");
  });

  it("returns nothing for an invalid time", () => {
    expect(formatAutoUpdateTime("not a time", "en")).toBe("");
  });
});
