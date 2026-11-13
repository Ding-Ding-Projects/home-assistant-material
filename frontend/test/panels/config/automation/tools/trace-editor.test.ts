import { describe, expect, it } from "vitest";
import { canShowTraceStep } from "../../../../../src/panels/config/automation/tools/trace-editor";

describe("canShowTraceStep", () => {
  const action = {
    action: "light.turn_on",
    target: { entity_id: "light.hall" },
  };

  it("accepts matching steps across legacy and current section names", () => {
    expect(
      canShowTraceStep({ action: [action] }, { actions: [action] }, "action/0")
    ).toBe(true);
  });

  it("rejects an old index after a step was edited, removed, or reordered", () => {
    const recorded = { actions: [action] };
    expect(canShowTraceStep(recorded, { actions: [] }, "action/0")).toBe(false);
    expect(
      canShowTraceStep(
        recorded,
        { actions: [{ ...action, alias: "New" }] },
        "action/0"
      )
    ).toBe(false);
    expect(
      canShowTraceStep(
        recorded,
        { actions: [{ delay: 5 }, action] },
        "action/0"
      )
    ).toBe(false);
  });

  it("does not mistake missing paths in both configurations for a match", () => {
    expect(canShowTraceStep({}, {}, "action/0")).toBe(false);
    expect(canShowTraceStep({}, {}, "trigger")).toBe(false);
  });

  it("accepts nested steps without requiring unrelated steps to match", () => {
    const recorded = {
      actions: [{ choose: [{ conditions: [], sequence: [action] }] }],
    };
    const current = { ...recorded, alias: "Updated automation name" };
    expect(
      canShowTraceStep(recorded, current, "action/0/choose/0/sequence/0")
    ).toBe(true);
  });
});
