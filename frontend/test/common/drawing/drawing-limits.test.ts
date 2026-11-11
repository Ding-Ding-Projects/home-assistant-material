import { describe, expect, test } from "vitest";
import {
  checkImageLimits,
  inspectImageHeader,
} from "../../../src/common/drawing/image-type";
import type { Shape, StrokePoint } from "../../../src/common/drawing/model";
import {
  MAX_STROKE_POINTS,
  simplifyStroke,
} from "../../../src/common/drawing/model";
import { drawingToSvg } from "../../../src/common/drawing/svg-export";

/** The first bytes of a PNG that claims the given size. */
const pngHeader = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

describe("picture size is judged before decoding", () => {
  test("a tiny file that claims 16,000 x 16,000 pixels is refused", () => {
    // About 1 GB once decoded, so it must not reach createImageBitmap.
    expect(checkImageLimits(300, 16000, 16000).ok).toBe(false);
  });

  test("the header of that picture is refused from its first bytes", () => {
    const result = inspectImageHeader(pngHeader(16000, 16000), 300);
    expect(result.ok).toBe(false);
  });

  test("an ordinary picture passes and reports its size", () => {
    const result = inspectImageHeader(pngHeader(1200, 800), 5000);
    expect(result).toEqual({ ok: true, width: 1200, height: 800 });
  });

  test("a file that is not a readable picture is refused", () => {
    expect(inspectImageHeader(new Uint8Array(40), 40).ok).toBe(false);
  });
});

describe("long pen strokes", () => {
  test("a stroke over the point cap keeps its last point", () => {
    const points: StrokePoint[] = [];
    for (let i = 0; i < 10000; i++) {
      points.push({ x: i * 10, y: 0 });
    }
    const out = simplifyStroke(points, 0.5);
    expect(out.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  test("a thinned long stroke still spans the whole gesture", () => {
    const points: StrokePoint[] = [];
    for (let i = 0; i < 9000; i++) {
      points.push({ x: i, y: Math.sin(i) * 5 });
    }
    const out = simplifyStroke(points, 0.1);
    expect(out.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(out[out.length - 1].x).toBe(8999);
  });
});

describe("svg export numbers and text", () => {
  test("a huge coordinate never becomes Infinity", () => {
    const shape: Shape = {
      id: "a",
      kind: "line",
      color: "#000000",
      width: 2,
      from: { x: 1e307, y: 0 },
      to: { x: 5, y: 5 },
    };
    expect(drawingToSvg([shape], 100, 100)).not.toMatch(/Infinity|NaN/);
  });

  test("text keeps its spaces and an empty line keeps its height", () => {
    const shape: Shape = {
      id: "t",
      kind: "text",
      color: "#000000",
      width: 4,
      at: { x: 10, y: 20 },
      text: "a  b\n\nc",
      size: 20,
    };
    const svg = drawingToSvg([shape], 200, 200);
    expect(svg).toContain('xml:space="preserve"');
    // The third line sits two full line heights (1.2 x 20) below the first.
    expect(svg).toContain('y="68"');
  });
});
