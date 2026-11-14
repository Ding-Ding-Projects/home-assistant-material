import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import {
  numberActionInputValue,
  numberActionValueSelector,
} from "../../../src/common/entity/number-action-value";

const states = (attributes: Record<string, unknown>[]): HassEntities =>
  Object.fromEntries(
    attributes.map((attrs, index) => [
      `number.test_${index}`,
      {
        entity_id: `number.test_${index}`,
        state: "1",
        attributes: attrs,
        last_changed: "",
        last_updated: "",
        context: { id: "", user_id: null, parent_id: null },
      },
    ])
  );
const base = {
  min: 0,
  max: 10,
  step: 0.5,
  mode: "slider",
  unit_of_measurement: "V",
};
const select = (attrs: Record<string, unknown>[], value?: unknown) => {
  const entities = states(attrs);
  return numberActionValueSelector(Object.keys(entities), entities, value)
    .number;
};

describe("number action value presentation", () => {
  it("uses published single-target bounds, unit, step and mode", () => {
    expect(select([base])).toMatchObject({ mode: "box", step: "any" });
    expect(select([base], 2)).toEqual({
      min: 0,
      max: 10,
      step: 0.5,
      mode: "slider",
      unit_of_measurement: "V",
    });
    expect(select([{ ...base, mode: "box" }], 2)?.mode).toBe("box");
    expect(select([{ ...base, mode: "auto" }], 2)?.mode).toBe("slider");
    expect(select([{ ...base, mode: "auto", step: 0.001 }], 2)?.mode).toBe(
      "box"
    );
  });

  it("intersects all selected ranges without inventing a common step", () => {
    expect(select([base, { ...base, min: 3, max: 20, step: 2 }])).toEqual({
      min: 3,
      max: 10,
      step: "any",
      mode: "box",
      unit_of_measurement: "V",
    });
    expect(
      select([base, { ...base, unit_of_measurement: "A" }])?.unit_of_measurement
    ).toBeUndefined();
    expect(
      select([base, { ...base, unit_of_measurement: undefined }])
        ?.unit_of_measurement
    ).toBeUndefined();
    expect(select([base, { ...base, min: 11, max: 20 }])?.min).toBeUndefined();
  });

  it("does not derive bounds from only the available subset", () => {
    const entities = states([base]);
    const fallback = { number: { mode: "box", step: "any" } };
    for (const ids of [
      undefined,
      null,
      [],
      ["number.missing"],
      ["number.test_0", "number.missing"],
      ["{{ target }}"],
    ]) {
      expect(numberActionValueSelector(ids, entities)).toEqual(fallback);
    }
    entities["number.test_0"].state = "unavailable";
    expect(numberActionValueSelector(["number.test_0"], entities)).toEqual(
      fallback
    );
    entities["number.test_0"].state = "unknown";
    expect(numberActionValueSelector(["number.test_0"], entities)).toEqual(
      fallback
    );
  });

  it.each([0, -1, NaN, Infinity, "0.5", undefined, 11])(
    "uses a float box for unusable published step %s",
    (step) => {
      expect(select([{ ...base, step }])).toMatchObject({
        mode: "box",
        step: "any",
      });
    }
  );

  it("keeps zero-width and overflowing ranges away from the slider", () => {
    expect(select([{ ...base, min: 10, max: 10 }])).toMatchObject({
      min: 10,
      max: 10,
      mode: "box",
      step: "any",
    });
    expect(
      select([{ ...base, min: -Number.MAX_VALUE, max: Number.MAX_VALUE }])?.mode
    ).toBe("box");
    for (const min of [NaN, Infinity, "0", undefined, 11]) {
      expect(select([{ ...base, min }])?.min).toBeUndefined();
    }
  });

  it("accepts finite historical numeric strings without changing source data", () => {
    expect(numberActionInputValue(" 02.50 ")).toBe(2.5);
    expect(numberActionInputValue("-1.2e2")).toBe(-120);
    for (const invalid of [
      "",
      " ",
      "0x2",
      "NaN",
      "Infinity",
      "{{ value }}",
      null,
      true,
      {},
      [],
      Infinity,
    ]) {
      expect(numberActionInputValue(invalid)).toBeUndefined();
    }
    const value = " 02.50 ";
    const attrs = [base];
    const snapshot = structuredClone(attrs);
    expect(select(attrs, value)?.mode).toBe("slider");
    expect(value).toBe(" 02.50 ");
    expect(attrs).toEqual(snapshot);
    expect(select([{ ...base, step: 0.1 }], "0.3")?.mode).toBe("slider");
  });

  it.each([
    0.25,
    "0.25",
    -1,
    11,
    "{{ value }}",
    "",
    "Infinity",
    "0x2",
    null,
    {},
    [],
  ])(
    "keeps saved off-grid or nonnumeric value %s editable without snapping",
    (value) => {
      expect(select([base], value)).toMatchObject({
        mode: "box",
        step: "any",
        min: 0,
        max: 10,
      });
    }
  );
});
