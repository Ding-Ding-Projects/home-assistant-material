import type { Point, Shape, TextMeasure } from "./model";
import { shapeBounds, strokeStyle, textBounds } from "./model";

/** Distance from a point to the segment a-b. */
export const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const nearPolyline = (p: Point, points: Point[], reach: number): boolean => {
  if (points.length === 1) {
    return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= reach;
  }
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(p, points[i - 1], points[i]) <= reach) {
      return true;
    }
  }
  return false;
};

/**
 * Whether a point is on a shape. `tolerance` is extra reach in drawing units
 * (callers pass a few screen pixels divided by the zoom).
 */
export const hitShape = (
  shape: Shape,
  p: Point,
  tolerance: number,
  measure?: TextMeasure
): boolean => {
  switch (shape.kind) {
    case "pen":
      return nearPolyline(p, shape.points, shape.width / 2 + tolerance);
    case "pencil":
    case "brush":
    case "highlighter":
      return nearPolyline(
        p,
        shape.points,
        strokeStyle(shape.kind, shape.width).width / 2 + tolerance
      );
    case "line":
    case "arrow":
      return (
        distanceToSegment(p, shape.from, shape.to) <=
        shape.width / 2 + tolerance
      );
    case "rect": {
      const { minX, minY, maxX, maxY } = shapeBounds(shape);
      const reach = shape.width / 2 + tolerance;
      const inside =
        p.x >= minX - reach &&
        p.x <= maxX + reach &&
        p.y >= minY - reach &&
        p.y <= maxY + reach;
      const innerSide =
        p.x > minX + reach &&
        p.x < maxX - reach &&
        p.y > minY + reach &&
        p.y < maxY - reach;
      // Only the outline counts, so shapes behind a box stay reachable.
      return inside && !innerSide;
    }
    case "ellipse": {
      const { minX, minY, maxX, maxY } = shapeBounds(shape);
      const rx = (maxX - minX) / 2;
      const ry = (maxY - minY) / 2;
      const cx = minX + rx;
      const cy = minY + ry;
      const reach = shape.width / 2 + tolerance;
      if (rx === 0 || ry === 0) {
        return (
          distanceToSegment(p, { x: minX, y: minY }, { x: maxX, y: maxY }) <=
          reach
        );
      }
      const outer =
        ((p.x - cx) / (rx + reach)) ** 2 + ((p.y - cy) / (ry + reach)) ** 2;
      const innerRx = rx - reach;
      const innerRy = ry - reach;
      const inner =
        innerRx > 0 && innerRy > 0
          ? ((p.x - cx) / innerRx) ** 2 + ((p.y - cy) / innerRy) ** 2
          : Infinity;
      return outer <= 1 && inner >= 1;
    }
    case "text": {
      const b = textBounds(shape, measure);
      return (
        p.x >= b.minX - tolerance &&
        p.x <= b.maxX + tolerance &&
        p.y >= b.minY - tolerance &&
        p.y <= b.maxY + tolerance
      );
    }
    default:
      return false;
  }
};

/** The id of the topmost shape at a point, or undefined. */
export const hitTest = (
  shapes: Shape[],
  p: Point,
  tolerance: number,
  measure?: TextMeasure
): string | undefined => {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(shapes[i], p, tolerance, measure)) {
      return shapes[i].id;
    }
  }
  return undefined;
};
