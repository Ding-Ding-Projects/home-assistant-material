import { describe, expect, it } from "vitest";
import {
  isCloudEngine,
  listOfferedEngines,
} from "../../src/data/engine-picker-options";

const engines = [
  { engine_id: "tts.piper", name: "Piper" },
  { engine_id: "tts.home_assistant_cloud", name: "Hosted" },
  { engine_id: "cloud", name: "Legacy hosted" },
  { engine_id: "old", name: "Old", deprecated: true },
];
const ids = (list: { engine: { engine_id: string } }[]) =>
  list.map((item) => item.engine.engine_id);

describe("engine picker options", () => {
  it("never offers a cloud engine as a new choice", () => {
    expect(
      ids(
        listOfferedEngines(engines, undefined, "tts.home_assistant_cloud", true)
      )
    ).toEqual(["tts.piper"]);
  });

  it("hides the legacy id even when no cloud entity is known", () => {
    expect(isCloudEngine("cloud", undefined)).toBe(true);
    expect(
      ids(listOfferedEngines(engines, undefined, undefined, false))
    ).toEqual(["tts.piper", "tts.home_assistant_cloud", "old"]);
  });

  it("keeps a cloud engine that is the saved value, marked as kept", () => {
    const list = listOfferedEngines(
      engines,
      "tts.home_assistant_cloud",
      "tts.home_assistant_cloud",
      true
    );
    expect(ids(list)).toEqual(["tts.piper", "tts.home_assistant_cloud"]);
    expect(list.map((item) => item.keptForCurrentValue)).toEqual([false, true]);
    expect(
      listOfferedEngines(engines, "cloud", undefined, true).find(
        (item) => item.engine.engine_id === "cloud"
      )?.keptForCurrentValue
    ).toBe(true);
  });

  it("hides deprecated engines unless they are the saved value", () => {
    expect(ids(listOfferedEngines(engines, "old", undefined, true))).toContain(
      "old"
    );
    expect(
      ids(listOfferedEngines(engines, undefined, undefined, true))
    ).not.toContain("old");
  });
});
