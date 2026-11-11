import { describe, expect, test, vi } from "vitest";
import { isEditableTarget } from "../../../src/common/drawing/editable-target";
import { hitTest } from "../../../src/common/drawing/hit-test";
import type { Shape } from "../../../src/common/drawing/model";
import {
  closeIfUnused,
  estimateTextWidth,
  strokeStyle,
  textBounds,
} from "../../../src/common/drawing/model";
import { drawingToSvg } from "../../../src/common/drawing/svg-export";

const text = (value: string): Shape => ({
  id: "t",
  kind: "text",
  color: "#000000",
  width: 4,
  at: { x: 0, y: 0 },
  text: value,
  size: 20,
});

describe("text boxes", () => {
  test("wide characters count a full em, narrow ones 0.6", () => {
    expect(estimateTextWidth("abc", 20)).toBeCloseTo(36);
    expect(estimateTextWidth("日本語", 20)).toBe(60);
  });

  test("a click on the right end of wide text hits it", () => {
    const shapes = [text("日本語日本語")];
    // Six wide characters are 120 units wide; the old 0.6 estimate gave 72.
    expect(hitTest(shapes, { x: 110, y: 10 }, 0)).toBe("t");
  });

  test("a measuring function replaces the estimate", () => {
    const measure = vi.fn(() => 500);
    const bounds = textBounds(text("x") as never, measure);
    expect(bounds.maxX).toBe(500);
  });
});

describe("pen kinds", () => {
  test("each kind has its own width, opacity and cap", () => {
    expect(strokeStyle("pen", 6)).toMatchObject({ width: 6, opacity: 1 });
    expect(strokeStyle("pencil", 6)).toMatchObject({
      width: 3,
      cap: "round",
    });
    expect(strokeStyle("pencil", 6).opacity).toBeLessThan(1);
    expect(strokeStyle("brush", 6).width).toBe(12);
    expect(strokeStyle("highlighter", 6)).toMatchObject({
      width: 18,
      cap: "butt",
      opacity: 0.4,
    });
  });

  test("the SVG export draws each kind with its style", () => {
    const stroke = (kind: "pencil" | "brush"): Shape => ({
      id: kind,
      kind,
      color: "#000000",
      width: 6,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ],
    });
    const pencil = drawingToSvg([stroke("pencil")], 100, 100);
    expect(pencil).toContain('stroke-width="3"');
    expect(pencil).toContain("stroke-opacity");
    const brush = drawingToSvg([stroke("brush")], 100, 100);
    expect(brush).toContain('stroke-width="12"');
    expect(brush).not.toContain("stroke-opacity");
  });

  test("pen pressure is kept in the SVG as one line per segment", () => {
    const shape: Shape = {
      id: "p",
      kind: "pen",
      color: "#000000",
      width: 10,
      points: [
        { x: 0, y: 0, p: 0.1 },
        { x: 10, y: 0, p: 0.9 },
        { x: 20, y: 0, p: 0.9 },
      ],
    };
    const svg = drawingToSvg([shape], 100, 100);
    expect(svg.match(/<line /g)).toHaveLength(2);
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) =>
      Number(m[1])
    );
    expect(widths[0]).not.toBe(widths[1]);
  });
});

describe("editable targets", () => {
  test("form fields, content-editable elements and the code editor", () => {
    expect(isEditableTarget([{ tagName: "INPUT" }])).toBe(true);
    expect(
      isEditableTarget([{ tagName: "div", isContentEditable: true }])
    ).toBe(true);
    expect(
      isEditableTarget([{ tagName: "div" }, { tagName: "HA-CODE-EDITOR" }])
    ).toBe(true);
    expect(
      isEditableTarget([
        {
          tagName: "DIV",
          classList: { contains: (n: string) => n === "cm-content" },
        },
      ])
    ).toBe(true);
  });

  test("a button or the canvas is not editable", () => {
    expect(
      isEditableTarget([{ tagName: "BUTTON" }, { tagName: "CANVAS" }])
    ).toBe(false);
    expect(isEditableTarget([])).toBe(false);
  });
});

describe("closing pictures", () => {
  test("a bitmap nothing uses is closed, one still in use is not", () => {
    const a = { close: vi.fn() };
    const b = { close: vi.fn() };
    closeIfUnused(a, [b, undefined]);
    closeIfUnused(b, [b]);
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).not.toHaveBeenCalled();
    closeIfUnused(undefined, []);
  });
});
