/**
 * The drawing model: a drawing is a list of shape objects, held as plain data
 * and drawn from. Nothing here touches the DOM or a canvas.
 */

export interface Point {
  x: number;
  y: number;
}

export interface StrokePoint extends Point {
  /** Pen pressure from 0 to 1, when the device reports it. */
  p?: number;
}

interface ShapeBase {
  id: string;
  color: string;
  width: number;
}

export interface StrokeShape extends ShapeBase {
  kind: "pen" | "highlighter";
  points: StrokePoint[];
}

export interface TwoPointShape extends ShapeBase {
  kind: "line" | "arrow" | "rect" | "ellipse";
  from: Point;
  to: Point;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  at: Point;
  text: string;
  /** Font size in drawing units. */
  size: number;
}

export type Shape = StrokeShape | TwoPointShape | TextShape;

export type ShapeKind = Shape["kind"];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MAX_TEXT_LENGTH = 500;
export const MAX_SHAPES = 5000;
export const MAX_STROKE_POINTS = 4000;

export const textSizeForWidth = (width: number): number =>
  Math.round(Math.max(16, width * 5 + 12));

/** The width a highlighter stroke is drawn with. */
export const highlighterWidth = (width: number): number => width * 3;

/** Approximate text box. A canvas measures exactly; this is for hit tests. */
export const textBounds = (shape: TextShape): Bounds => {
  const lines = shape.text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    minX: shape.at.x,
    minY: shape.at.y,
    maxX: shape.at.x + longest * shape.size * 0.6,
    maxY: shape.at.y + lines.length * shape.size * 1.2,
  };
};

export const shapeBounds = (shape: Shape): Bounds => {
  const pad = shape.kind === "highlighter" ? highlighterWidth(shape.width) : 0;
  switch (shape.kind) {
    case "pen":
    case "highlighter": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of shape.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      if (!shape.points.length) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }
      return {
        minX: minX - pad / 2,
        minY: minY - pad / 2,
        maxX: maxX + pad / 2,
        maxY: maxY + pad / 2,
      };
    }
    case "text":
      return textBounds(shape);
    default:
      return {
        minX: Math.min(shape.from.x, shape.to.x),
        minY: Math.min(shape.from.y, shape.to.y),
        maxX: Math.max(shape.from.x, shape.to.x),
        maxY: Math.max(shape.from.y, shape.to.y),
      };
  }
};

/** Move a shape by a distance. Returns a new shape. */
export const translateShape = (shape: Shape, dx: number, dy: number): Shape => {
  switch (shape.kind) {
    case "pen":
    case "highlighter":
      return {
        ...shape,
        points: shape.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      };
    case "text":
      return { ...shape, at: { x: shape.at.x + dx, y: shape.at.y + dy } };
    default:
      return {
        ...shape,
        from: { x: shape.from.x + dx, y: shape.from.y + dy },
        to: { x: shape.to.x + dx, y: shape.to.y + dy },
      };
  }
};

export const addShape = (shapes: Shape[], shape: Shape): Shape[] =>
  shapes.length >= MAX_SHAPES ? shapes : [...shapes, shape];

export const removeShape = (shapes: Shape[], id: string): Shape[] =>
  shapes.filter((s) => s.id !== id);

export const replaceShape = (shapes: Shape[], next: Shape): Shape[] =>
  shapes.map((s) => (s.id === next.id ? next : s));

export const moveShape = (
  shapes: Shape[],
  id: string,
  dx: number,
  dy: number
): Shape[] => shapes.map((s) => (s.id === id ? translateShape(s, dx, dy) : s));

/** Clamp a point to the page. */
export const clampPoint = (p: Point, width: number, height: number): Point => ({
  x: Math.min(width, Math.max(0, p.x)),
  y: Math.min(height, Math.max(0, p.y)),
});

/**
 * Make an end point snap to the nearest 45 degrees (lines, arrows) or to a
 * square (boxes), as when Shift is held.
 */
export const constrainEnd = (
  kind: TwoPointShape["kind"] | "pen" | "highlighter",
  from: Point,
  to: Point
): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (kind === "rect" || kind === "ellipse") {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: from.x + Math.sign(dx || 1) * size,
      y: from.y + Math.sign(dy || 1) * size,
    };
  }
  const length = Math.hypot(dx, dy);
  if (!length) {
    return to;
  }
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: from.x + Math.cos(angle) * length,
    y: from.y + Math.sin(angle) * length,
  };
};

let counter = 0;

/** A fresh id for a shape. */
export const newShapeId = (): string => {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
};

/** Thin a stroke: drop points closer than the given distance to the last kept. */
export const simplifyStroke = (
  points: StrokePoint[],
  minDistance: number
): StrokePoint[] => {
  if (points.length <= 2) {
    return points;
  }
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistance) {
      out.push(points[i]);
    }
  }
  out.push(points[points.length - 1]);
  return out.slice(0, MAX_STROKE_POINTS);
};
