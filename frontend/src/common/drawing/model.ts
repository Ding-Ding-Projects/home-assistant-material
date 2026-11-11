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

export type StrokeKind = "pen" | "pencil" | "brush" | "highlighter";

export interface StrokeShape extends ShapeBase {
  kind: StrokeKind;
  points: StrokePoint[];
}

/** How a kind of stroke is drawn: width, opacity, line cap and pressure use. */
export interface StrokeStyle {
  width: number;
  opacity: number;
  cap: "round" | "butt";
  /** Whether a pen's pressure varies the width along the stroke. */
  pressure: boolean;
}

export const isStrokeKind = (kind: string): kind is StrokeKind =>
  kind === "pen" ||
  kind === "pencil" ||
  kind === "brush" ||
  kind === "highlighter";

/**
 * The look of each stroke kind, made only of width, opacity and line cap so
 * the canvas and the SVG export agree. The pencil is thin and slightly
 * see-through; the brush is wide, opaque and follows pen pressure.
 */
export const strokeStyle = (kind: StrokeKind, width: number): StrokeStyle => {
  switch (kind) {
    case "highlighter":
      return { width: width * 3, opacity: 0.4, cap: "butt", pressure: false };
    case "pencil":
      return {
        width: Math.max(1, width * 0.5),
        opacity: 0.7,
        cap: "round",
        pressure: false,
      };
    case "brush":
      return { width: width * 2, opacity: 1, cap: "round", pressure: true };
    default:
      return { width, opacity: 1, cap: "round", pressure: true };
  }
};

/** The width of one segment of a pressure-sensitive stroke. */
export const pressureWidth = (base: number, a?: number, b?: number): number =>
  base * (0.4 + (((a ?? 0.5) + (b ?? 0.5)) / 2) * 1.2);

/** Whether any point carries pen pressure. */
export const hasPressure = (points: StrokePoint[]): boolean =>
  points.some((p) => p.p !== undefined && p.p > 0);

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
/** How many drawings the session gallery holds at once. */
export const MAX_GALLERY_ITEMS = 12;

/**
 * Close a picture bitmap that nothing uses any more. `inUse` lists the
 * bitmaps that are still needed (the page background, gallery entries).
 */
export const closeIfUnused = (
  bitmap: { close(): void } | undefined,
  inUse: ({ close(): void } | undefined)[]
): void => {
  if (bitmap && !inUse.includes(bitmap)) {
    bitmap.close();
  }
};

export const textSizeForWidth = (width: number): number =>
  Math.round(Math.max(16, width * 5 + 12));

/** The width a highlighter stroke is drawn with. */
export const highlighterWidth = (width: number): number => width * 3;

/** Measures the width of one line of text at a font size, in drawing units. */
export type TextMeasure = (line: string, size: number) => number;

const WIDE_CHAR =
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;

/**
 * Estimated width of a line when no canvas is at hand: full-width characters
 * (Chinese, Japanese, Korean, emoji) count a full em, the rest 0.6 em.
 */
export const estimateTextWidth: TextMeasure = (line, size) => {
  let units = 0;
  for (const char of line) {
    units += WIDE_CHAR.test(char) ? 1 : 0.6;
  }
  return units * size;
};

/** Text box. Pass a canvas-backed `measure` for an exact width. */
export const textBounds = (
  shape: TextShape,
  measure: TextMeasure = estimateTextWidth
): Bounds => {
  const lines = shape.text.split("\n");
  const longest = Math.max(...lines.map((l) => measure(l, shape.size)), 1);
  return {
    minX: shape.at.x,
    minY: shape.at.y,
    maxX: shape.at.x + longest,
    maxY: shape.at.y + lines.length * shape.size * 1.2,
  };
};

export const shapeBounds = (shape: Shape, measure?: TextMeasure): Bounds => {
  const pad =
    isStrokeKind(shape.kind) && shape.kind !== "pen"
      ? strokeStyle(shape.kind, shape.width).width
      : 0;
  switch (shape.kind) {
    case "pen":
    case "pencil":
    case "brush":
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
      return textBounds(shape, measure);
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
    case "pencil":
    case "brush":
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
  kind: TwoPointShape["kind"] | StrokeKind,
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
  let distance = Math.max(minDistance, 0);
  for (let attempt = 0; attempt < 64; attempt++) {
    const out: StrokePoint[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const last = out[out.length - 1];
      if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= distance) {
        out.push(points[i]);
      }
    }
    out.push(points[points.length - 1]);
    if (out.length <= MAX_STROKE_POINTS) {
      return out;
    }
    // Too many points: thin harder instead of cutting the end off.
    distance = distance > 0 ? distance * 2 : 0.5;
  }
  // Even evenly spaced fallback, ends included.
  const step = (points.length - 1) / (MAX_STROKE_POINTS - 1);
  const out: StrokePoint[] = [];
  for (let i = 0; i < MAX_STROKE_POINTS - 1; i++) {
    out.push(points[Math.floor(i * step)]);
  }
  out.push(points[points.length - 1]);
  return out;
};
