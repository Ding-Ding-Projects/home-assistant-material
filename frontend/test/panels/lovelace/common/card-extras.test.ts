import { describe, expect, it } from "vitest";
import {
  parseDurationMs,
  parseFeedbackEffect,
  feedbackKeyframes,
} from "../../../../src/panels/lovelace/common/card-feedback";
import { computeCardStyleProperties } from "../../../../src/panels/lovelace/common/card-style";
import {
  resizeKeyDelta,
  rowsFromHeight,
  snapGridResize,
} from "../../../../src/panels/lovelace/common/snap-grid-resize";

describe("card style padding and shadow", () => {
  it("turns padding into the card padding property", () => {
    expect(computeCardStyleProperties({ padding: 16 })).toEqual({
      "--ha-card-padding": "16px",
    });
    expect(computeCardStyleProperties({ padding: "1rem" })).toEqual({
      "--ha-card-padding": "1rem",
    });
  });

  it("drops a padding value that is not a bounded length", () => {
    expect(computeCardStyleProperties({ padding: "1px; color: red" })).toEqual(
      {}
    );
    expect(computeCardStyleProperties({ padding: -4 })).toEqual({});
  });

  it("maps a named shadow to a fixed shadow and ignores unknown names", () => {
    const soft = computeCardStyleProperties({ shadow: "soft" });
    expect(soft["--ha-card-box-shadow"]).toContain("rgb(");
    expect(computeCardStyleProperties({ shadow: "none" })).toEqual({
      "--ha-card-box-shadow": "none",
    });
    expect(computeCardStyleProperties({ shadow: "0 0 9px red" })).toEqual({});
    expect(computeCardStyleProperties({ shadow: "constructor" })).toEqual({});
  });
});

describe("gesture feedback", () => {
  it("accepts only the known effect names", () => {
    expect(parseFeedbackEffect("ripple")).toBe("ripple");
    expect(parseFeedbackEffect("none")).toBe("none");
    expect(parseFeedbackEffect("spin")).toBeUndefined();
    expect(parseFeedbackEffect(3)).toBeUndefined();
  });

  it("reads CSS times in milliseconds", () => {
    expect(parseDurationMs("250ms")).toBe(250);
    expect(parseDurationMs(" 0.25s ")).toBe(250);
    expect(parseDurationMs("1ms")).toBe(1);
    expect(parseDurationMs("")).toBeUndefined();
    expect(parseDurationMs("fast")).toBeUndefined();
  });

  it("has keyframes for every effect except none", () => {
    expect(feedbackKeyframes("none")).toBeUndefined();
    expect(feedbackKeyframes("scale")?.length).toBeGreaterThan(1);
    expect(feedbackKeyframes("ripple")?.length).toBeGreaterThan(1);
    expect(feedbackKeyframes("glow")?.length).toBeGreaterThan(1);
  });
});

describe("snapGridResize", () => {
  const base = {
    startColumns: 6,
    startRows: 2,
    dx: 0,
    dy: 0,
    columnStep: 50,
    rowStep: 64,
    columnCount: 12,
  };

  it("snaps movement to whole columns and rows", () => {
    expect(snapGridResize({ ...base, dx: 120, dy: 70 })).toEqual({
      columns: 8,
      rows: 3,
    });
    expect(snapGridResize({ ...base, dx: 20, dy: 20 })).toEqual({
      columns: 6,
      rows: 2,
    });
  });

  it("stays inside the grid and the card's limits", () => {
    expect(snapGridResize({ ...base, dx: 1000, dy: -1000 })).toEqual({
      columns: 12,
      rows: 1,
    });
    expect(
      snapGridResize({
        ...base,
        dx: -1000,
        dy: 1000,
        minColumns: 3,
        maxRows: 4,
      })
    ).toEqual({ columns: 3, rows: 4 });
    expect(snapGridResize({ ...base, dx: 500, maxColumns: 9 }).columns).toBe(9);
  });

  it("reverses horizontal movement in a right to left layout", () => {
    expect(snapGridResize({ ...base, dx: -100, rtl: true }).columns).toBe(8);
  });

  it("maps arrow keys and swaps left and right when mirrored", () => {
    expect(resizeKeyDelta("ArrowRight")).toEqual({ columns: 1, rows: 0 });
    expect(resizeKeyDelta("ArrowRight", true)).toEqual({
      columns: -1,
      rows: 0,
    });
    expect(resizeKeyDelta("ArrowUp")).toEqual({ columns: 0, rows: -1 });
    expect(resizeKeyDelta("Enter")).toBeUndefined();
  });

  it("counts the rows a rendered height covers", () => {
    expect(rowsFromHeight(56, 56, 8)).toBe(1);
    expect(rowsFromHeight(120, 56, 8)).toBe(2);
    expect(rowsFromHeight(0, 56, 8)).toBe(1);
  });
});
