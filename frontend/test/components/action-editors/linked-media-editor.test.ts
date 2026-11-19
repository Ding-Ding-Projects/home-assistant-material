import { describe, expect, it } from "vitest";
import { buildQuickControls } from "../../../src/components/action-editors/descriptors";
import type { QuickContext } from "../../../src/components/action-editors/quick-types";

// Protects the rule that the linked file of the fetch action is picked by
// name from the owner's list, and that a stored file that left the list
// stays visible instead of being silently replaced.

const context = (
  data: Record<string, unknown>,
  linkedFiles?: { id: string; name: string }[]
): QuickContext => ({
  action: "linked_media.fetch",
  data,
  fields: {
    file_id: { selector: { text: null }, required: true },
    seconds: { selector: { number: { min: 1, max: 3600 } } },
  },
  domainServices: ["fetch", "release"],
  entities: [],
  linkedFiles,
});

describe("linked media fetch editor", () => {
  it("offers the linked files by name", () => {
    const controls = buildQuickControls(
      context({}, [
        { id: "01A", name: "Doorbell chime" },
        { id: "01B", name: "Weather radar picture" },
      ])
    );
    const picker = controls.find((control) => control.key === "file_id");
    expect(picker).toMatchObject({
      kind: "tiles",
      options: [
        { value: "01A", label: "Doorbell chime" },
        { value: "01B", label: "Weather radar picture" },
      ],
    });
    expect(controls.find((control) => control.key === "seconds")).toMatchObject(
      { kind: "slider", min: 1, max: 3600 }
    );
  });

  it("keeps a stored file that is no longer on the list", () => {
    const controls = buildQuickControls(
      context({ file_id: "01GONE" }, [{ id: "01A", name: "Doorbell chime" }])
    );
    const picker = controls.find((control) => control.key === "file_id");
    expect(picker).toMatchObject({
      kind: "tiles",
      value: "01GONE",
      options: [
        { value: "01A", label: "Doorbell chime" },
        { value: "01GONE", label: "01GONE" },
      ],
    });
  });

  it("falls back to a text box before the list is loaded", () => {
    const controls = buildQuickControls(context({}));
    expect(controls.find((control) => control.key === "file_id")?.kind).toBe(
      "text"
    );
  });
});
