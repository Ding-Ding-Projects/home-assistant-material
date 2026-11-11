import type { Point, Shape } from "./model";
import { shapeBounds } from "./model";

export type Region =
  | "top_left"
  | "top"
  | "top_right"
  | "left"
  | "centre"
  | "right"
  | "bottom_left"
  | "bottom"
  | "bottom_right";

/** Which ninth of the page a point sits in. */
export const regionOf = (p: Point, width: number, height: number): Region => {
  const col = p.x < width / 3 ? 0 : p.x < (2 * width) / 3 ? 1 : 2;
  const row = p.y < height / 3 ? 0 : p.y < (2 * height) / 3 ? 1 : 2;
  const grid: Region[][] = [
    ["top_left", "top", "top_right"],
    ["left", "centre", "right"],
    ["bottom_left", "bottom", "bottom_right"],
  ];
  return grid[row][col];
};

export const NAMED_COLORS: { key: string; rgb: [number, number, number] }[] = [
  { key: "black", rgb: [0, 0, 0] },
  { key: "white", rgb: [255, 255, 255] },
  { key: "grey", rgb: [128, 128, 128] },
  { key: "red", rgb: [200, 30, 30] },
  { key: "orange", rgb: [240, 130, 20] },
  { key: "yellow", rgb: [245, 200, 40] },
  { key: "green", rgb: [40, 160, 70] },
  { key: "blue", rgb: [0, 99, 155] },
  { key: "purple", rgb: [130, 60, 180] },
  { key: "pink", rgb: [235, 110, 170] },
  { key: "brown", rgb: [120, 75, 40] },
];

const parseHex = (hex: string): [number, number, number] | undefined => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    return undefined;
  }
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

/** The key of the nearest named colour to a hex colour. */
export const colorKey = (hex: string): string => {
  const rgb = parseHex(hex);
  if (!rgb) {
    return "black";
  }
  let best = NAMED_COLORS[0];
  let bestDistance = Infinity;
  for (const named of NAMED_COLORS) {
    const d =
      (named.rgb[0] - rgb[0]) ** 2 +
      (named.rgb[1] - rgb[1]) ** 2 +
      (named.rgb[2] - rgb[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = named;
    }
  }
  return best.key;
};

export interface ShapeDescription {
  kind: Shape["kind"];
  /** Region of the first point (or of the centre for a box or ellipse). */
  from: Region;
  /** Region of the last point, for shapes that go from one place to another. */
  to?: Region;
  color: string;
  text?: string;
}

/** A structured description of a shape; the page turns it into a sentence. */
export const describeShape = (
  shape: Shape,
  width: number,
  height: number
): ShapeDescription => {
  const color = colorKey(shape.color);
  switch (shape.kind) {
    case "pen":
    case "pencil":
    case "brush":
    case "highlighter": {
      const first = shape.points[0] ?? { x: 0, y: 0 };
      const last = shape.points[shape.points.length - 1] ?? first;
      return {
        kind: shape.kind,
        from: regionOf(first, width, height),
        to: regionOf(last, width, height),
        color,
      };
    }
    case "line":
    case "arrow":
      return {
        kind: shape.kind,
        from: regionOf(shape.from, width, height),
        to: regionOf(shape.to, width, height),
        color,
      };
    case "text":
      return {
        kind: "text",
        from: regionOf(shape.at, width, height),
        color,
        text:
          shape.text.length > 60 ? `${shape.text.slice(0, 60)}…` : shape.text,
      };
    default: {
      const b = shapeBounds(shape);
      return {
        kind: shape.kind,
        from: regionOf(
          { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
          width,
          height
        ),
        color,
      };
    }
  }
};
