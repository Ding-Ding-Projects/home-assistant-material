import { describe, expect, test } from "vitest";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
} from "../../../src/common/drawing/history";
import { hitTest } from "../../../src/common/drawing/hit-test";
import type { Shape } from "../../../src/common/drawing/model";
import {
  addShape,
  constrainEnd,
  moveShape,
  removeShape,
} from "../../../src/common/drawing/model";
import {
  arrowHead,
  drawingToSvg,
  escapeXml,
  safeColor,
} from "../../../src/common/drawing/svg-export";
import {
  colorKey,
  describeShape,
  regionOf,
} from "../../../src/common/drawing/describe";
import {
  checkImageLimits,
  pageSizeForImage,
  sniffImageType,
} from "../../../src/common/drawing/image-type";

const rect: Shape = {
  id: "r",
  kind: "rect",
  color: "#ff0000",
  width: 4,
  from: { x: 10, y: 10 },
  to: { x: 110, y: 90 },
};
const line: Shape = {
  id: "l",
  kind: "line",
  color: "#0000ff",
  width: 4,
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
};

describe("history", () => {
  test("undo and redo walk the commits in order", () => {
    let h = createHistory<number[]>([]);
    h = commit(h, [1]);
    h = commit(h, [1, 2]);
    h = commit(h, [1, 2, 3]);
    expect(canUndo(h)).toBe(true);
    h = undo(undo(h));
    expect(h.present).toEqual([1]);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toEqual([1, 2]);
  });

  test("a new commit clears redo", () => {
    let h = commit(createHistory<number>(0), 1);
    h = undo(h);
    h = commit(h, 5);
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
  });

  test("undo at the start and a commit of the same value change nothing", () => {
    const h = createHistory<number>(0);
    expect(undo(h)).toBe(h);
    expect(commit(h, 0)).toBe(h);
  });

  test("depth is limited, dropping the oldest steps", () => {
    let h = createHistory<number>(0);
    for (let i = 1; i <= 10; i++) {
      h = commit(h, i, 3);
    }
    expect(h.past).toEqual([7, 8, 9]);
  });
});

describe("model", () => {
  test("add, move and remove return new lists", () => {
    const list = addShape([], rect);
    const moved = moveShape(list, "r", 5, -5);
    expect(list[0]).toBe(rect);
    expect((moved[0] as typeof rect).from).toEqual({ x: 15, y: 5 });
    expect(removeShape(moved, "r")).toEqual([]);
  });

  test("shift snaps lines to 45 degrees and boxes to squares", () => {
    const end = constrainEnd("line", { x: 0, y: 0 }, { x: 100, y: 10 });
    expect(end.x).toBeCloseTo(Math.hypot(100, 10), 5);
    expect(end.y).toBeCloseTo(0, 5);
    expect(constrainEnd("rect", { x: 0, y: 0 }, { x: 100, y: 40 })).toEqual({
      x: 100,
      y: 100,
    });
  });
});

describe("hit testing", () => {
  test("the topmost shape wins and a box is hit on its outline only", () => {
    const shapes = [rect, line];
    expect(hitTest(shapes, { x: 50, y: 1 }, 3)).toBe("l");
    expect(hitTest(shapes, { x: 10, y: 50 }, 3)).toBe("r");
    expect(hitTest(shapes, { x: 60, y: 50 }, 3)).toBeUndefined();
  });

  test("a stroke is hit near its path", () => {
    const pen: Shape = {
      id: "p",
      kind: "pen",
      color: "#000000",
      width: 4,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(hitTest([pen], { x: 50, y: 52 }, 2)).toBe("p");
    expect(hitTest([pen], { x: 50, y: 80 }, 2)).toBeUndefined();
  });

  test("an ellipse is hit on its outline", () => {
    const e: Shape = {
      id: "e",
      kind: "ellipse",
      color: "#000000",
      width: 4,
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
    };
    expect(hitTest([e], { x: 100, y: 50 }, 2)).toBe("e");
    expect(hitTest([e], { x: 50, y: 50 }, 2)).toBeUndefined();
  });
});

describe("svg export", () => {
  test("text is escaped", () => {
    expect(escapeXml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });

  test("control characters are dropped but tab and newline stay", () => {
    expect(escapeXml("a\u0000b\u0007c\u001fd\te\nf")).toBe("abcd\te\nf");
  });

  test("a text shape cannot break out of its element", () => {
    const svg = drawingToSvg(
      [
        {
          id: "t",
          kind: "text",
          color: '#ff0000" onload="x',
          width: 2,
          at: { x: 1, y: 2 },
          size: 20,
          text: '</text><script>alert("x")</script>\u0000',
        },
      ],
      200,
      100
    );
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("onload");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('fill="#000000"');
  });

  test("the file has no script, style, image or outside reference", () => {
    const svg = drawingToSvg([rect, line], 200, 100);
    expect(svg).not.toMatch(/<script|<style|<image|href=|url\(/i);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain("<rect");
  });

  test("safeColor accepts only hex", () => {
    expect(safeColor("#abc")).toBe("#abc");
    expect(safeColor("red")).toBe("#000000");
  });

  test("an arrow head has three points ending at the tip", () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(head).toHaveLength(3);
    expect(head[0]).toEqual([100, 0]);
  });
});

describe("descriptions", () => {
  test("regions and colour names", () => {
    expect(regionOf({ x: 1, y: 1 }, 300, 300)).toBe("top_left");
    expect(regionOf({ x: 150, y: 150 }, 300, 300)).toBe("centre");
    expect(colorKey("#ff0000")).toBe("red");
    expect(colorKey("nonsense")).toBe("black");
  });

  test("an arrow reads from where it starts to where it ends", () => {
    const d = describeShape(
      {
        id: "a",
        kind: "arrow",
        color: "#c81e1e",
        width: 4,
        from: { x: 10, y: 10 },
        to: { x: 150, y: 150 },
      },
      300,
      300
    );
    expect(d).toEqual({
      kind: "arrow",
      from: "top_left",
      to: "centre",
      color: "red",
    });
  });
});

describe("images", () => {
  test("types are read from the bytes", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg"
    );
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBP");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  test("SVG and other files are refused", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    expect(sniffImageType(svg)).toBeUndefined();
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
  });

  test("limits", () => {
    expect(checkImageLimits(20 * 1024 * 1024, 100, 100)).toEqual({
      ok: false,
      reason: "too_big",
    });
    expect(checkImageLimits(10, 20000, 100)).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(checkImageLimits(10, 100, 100)).toEqual({ ok: true });
    expect(pageSizeForImage(8192, 4096)).toEqual({ width: 4096, height: 2048 });
  });
});
