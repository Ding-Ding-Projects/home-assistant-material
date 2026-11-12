import { describe, expect, it } from "vitest";
import {
  isErrorScreenShown,
  isServerBusy,
} from "../../../src/common/dim-sum/dim-sum-state";
import type { HomeAssistant } from "../../../src/types";

const hassWith = (
  state: string,
  states: Record<string, unknown> = {},
  recovery = false
) =>
  ({
    config: { state, recovery_mode: recovery },
    states,
  }) as unknown as HomeAssistant;

// Protects "not while an update or restart is in progress": the surprise
// reads the server state, recovery mode and running update entities.
describe("isServerBusy", () => {
  it("is false for a running server with no update running", () => {
    expect(isServerBusy(hassWith("RUNNING"))).toBe(false);
  });

  it.each(["NOT_RUNNING", "STARTING", "STOPPING", "FINAL_WRITE"])(
    "is true while the server is %s",
    (state) => {
      expect(isServerBusy(hassWith(state))).toBe(true);
    }
  );

  it("is true in recovery mode", () => {
    expect(isServerBusy(hassWith("RUNNING", {}, true))).toBe(true);
  });

  it("is true while an update entity installs", () => {
    expect(
      isServerBusy(
        hassWith("RUNNING", {
          "update.core": {
            entity_id: "update.core",
            attributes: { in_progress: true },
          },
        })
      )
    ).toBe(true);
    expect(
      isServerBusy(
        hassWith("RUNNING", {
          "update.core": {
            entity_id: "update.core",
            attributes: { in_progress: false },
          },
          "light.kitchen": {
            entity_id: "light.kitchen",
            attributes: { in_progress: true },
          },
        })
      )
    ).toBe(false);
  });
});

describe("isErrorScreenShown", () => {
  it("finds an error screen, also inside a shadow root", () => {
    const host = document.createElement("div");
    const inner = document.createElement("section");
    inner
      .attachShadow({ mode: "open" })
      .appendChild(document.createElement("hass-error-screen"));
    host.appendChild(inner);
    expect(isErrorScreenShown(host)).toBe(true);
  });

  it("is false when there is none", () => {
    const host = document.createElement("div");
    host.appendChild(document.createElement("section"));
    expect(isErrorScreenShown(host)).toBe(false);
  });
});
