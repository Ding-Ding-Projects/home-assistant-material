import { describe, expect, it, vi } from "vitest";
import {
  getObjectDraft,
  hasInvalidObjectDrafts,
  setObjectDraft,
} from "../../src/common/object-editor/object-model";
import { HaServiceAction } from "../../src/panels/config/automation/action/types/ha-automation-action-service";
import HaAutomationActionRow from "../../src/panels/config/automation/action/ha-automation-action-row";
import type { ServiceAction } from "../../src/data/script";

vi.mock("../../src/dialogs/generic/show-dialog-box", () => ({
  showPromptDialog: vi.fn().mockResolvedValue("Renamed"),
  showAlertDialog: vi.fn(),
  showConfirmationDialog: vi.fn(),
}));

const action = (): ServiceAction => ({
  action: "tts.speak",
  data: { options: { voice: "saved" } },
});
const recordDraft = (owner: ServiceAction) =>
  setObjectDraft(owner, "options", {
    mode: "yaml",
    valid: false,
    yaml: "voice: [unfinished",
  });
const internals = (element: unknown) =>
  element as Record<string, (...args: unknown[]) => unknown>;

describe("action metadata draft ownership", () => {
  it.each([
    "_onDisable",
    "_continueOnError",
    "_editNoteAction",
    "_renameAction",
  ])("preserves invalid drafts during %s", async (method) => {
    const row = new HaAutomationActionRow();
    row.action = action();
    row.hass = {
      localize: (key: string) => key,
      services: {},
      states: {},
      entities: {},
      devices: {},
      areas: {},
      floors: {},
      labels: {},
    } as never;
    recordDraft(row.action as ServiceAction);
    let next: unknown;
    row.addEventListener("value-changed", (event) => {
      next = (event as CustomEvent).detail.value;
    });
    await internals(row)[method]();
    expect(next).toBeDefined();
    expect(hasInvalidObjectDrafts({ actions: [next] })).toBe(true);
    expect(getObjectDraft(next as object, "options")?.yaml).toBe(
      "voice: [unfinished"
    );
  });

  it.each(["_responseVariableChanged", "_responseCheckboxChanged"])(
    "preserves invalid drafts during %s",
    (method) => {
      const element = new HaServiceAction();
      element.action = action();
      recordDraft(element.action);
      let next: unknown;
      element.addEventListener("value-changed", (event) => {
        next = (event as CustomEvent).detail.value;
      });
      internals(element)[method]({
        target: { value: "result", checked: false },
      });
      expect(hasInvalidObjectDrafts({ sequence: [next] })).toBe(true);
    }
  );
});
