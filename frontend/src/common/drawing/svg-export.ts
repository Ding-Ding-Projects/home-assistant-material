import type { Shape, StrokePoint } from "./model";
import { hasPressure, pressureWidth, strokeStyle } from "./model";

/** Escape text for an XML text node or a double-quoted attribute. */
export const escapeXml = (value: string): string => {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === "&") out += "&amp;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (char === '"') out += "&quot;";
    else if (char === "'") out += "&apos;";
    else if (
      // Characters XML 1.0 cannot hold at all are dropped.
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff ||
      code === 0x7f
    ) {
      continue;
    } else out += char;
  }
  return out;
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Only a plain hex colour reaches the file; anything else becomes black. */
export const safeColor = (color: string): string =>
  HEX_COLOR.test(color) ? color : "#000000";

const num = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  // Rounding a huge value can overflow, so the rounded result is checked.
  return Number.isFinite(rounded) ? String(rounded) : "0";
};

const strokePath = (points: StrokePoint[]): string => {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    const p = points[0];
    return `M${num(p.x)} ${num(p.y)}l0.01 0`;
  }
  let d = `M${num(points[0].x)} ${num(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += `Q${num(points[i].x)} ${num(points[i].y)} ${num(mx)} ${num(my)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${num(last.x)} ${num(last.y)}`;
};

/** The three points of an arrow head at `to`, pointing away from `from`. */
export const arrowHead = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number
): [number, number][] => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(12, width * 4);
  const spread = Math.PI / 7;
  return [
    [to.x, to.y],
    [
      to.x - size * Math.cos(angle - spread),
      to.y - size * Math.sin(angle - spread),
    ],
    [
      to.x - size * Math.cos(angle + spread),
      to.y - size * Math.sin(angle + spread),
    ],
  ];
};

const shapeToSvg = (shape: Shape): string => {
  const color = safeColor(shape.color);
  const width = num(shape.width);
  const stroke = `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape.kind) {
    case "pen":
    case "pencil":
    case "brush":
    case "highlighter": {
      const style = strokeStyle(shape.kind, shape.width);
      if (
        style.pressure &&
        hasPressure(shape.points) &&
        shape.points.length > 1
      ) {
        // Pen pressure is kept by drawing one segment at a time, as the canvas does.
        const pts = shape.points;
        let segments = "";
        for (let i = 1; i < pts.length; i++) {
          segments += `<line x1="${num(pts[i - 1].x)}" y1="${num(pts[i - 1].y)}" x2="${num(pts[i].x)}" y2="${num(pts[i].y)}" stroke-width="${num(pressureWidth(style.width, pts[i - 1].p, pts[i].p))}"/>`;
        }
        return `<g fill="none" stroke="${color}" stroke-linecap="${style.cap}" stroke-linejoin="round">${segments}</g>`;
      }
      const opacity =
        style.opacity < 1 ? ` stroke-opacity="${style.opacity}"` : "";
      return `<path d="${strokePath(shape.points)}" fill="none" stroke="${color}" stroke-width="${num(style.width)}" stroke-linecap="${style.cap}" stroke-linejoin="round"${opacity}/>`;
    }
    case "line":
      return `<line x1="${num(shape.from.x)}" y1="${num(shape.from.y)}" x2="${num(shape.to.x)}" y2="${num(shape.to.y)}" ${stroke}/>`;
    case "arrow": {
      const head = arrowHead(shape.from, shape.to, shape.width)
        .map(([x, y]) => `${num(x)},${num(y)}`)
        .join(" ");
      return (
        `<line x1="${num(shape.from.x)}" y1="${num(shape.from.y)}" x2="${num(shape.to.x)}" y2="${num(shape.to.y)}" ${stroke}/>` +
        `<polygon points="${head}" fill="${color}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`
      );
    }
    case "rect":
      return `<rect x="${num(Math.min(shape.from.x, shape.to.x))}" y="${num(Math.min(shape.from.y, shape.to.y))}" width="${num(Math.abs(shape.to.x - shape.from.x))}" height="${num(Math.abs(shape.to.y - shape.from.y))}" ${stroke}/>`;
    case "ellipse":
      return `<ellipse cx="${num((shape.from.x + shape.to.x) / 2)}" cy="${num((shape.from.y + shape.to.y) / 2)}" rx="${num(Math.abs(shape.to.x - shape.from.x) / 2)}" ry="${num(Math.abs(shape.to.y - shape.from.y) / 2)}" ${stroke}/>`;
    case "text": {
      const lines = shape.text.split("\n");
      // Each line has its own y, so an empty line still takes up its height.
      const spans = lines
        .map(
          (line, i) =>
            `<tspan x="${num(shape.at.x)}" y="${num(shape.at.y + i * shape.size * 1.2)}">${escapeXml(line)}</tspan>`
        )
        .join("");
      return `<text xml:space="preserve" x="${num(shape.at.x)}" y="${num(shape.at.y)}" font-family="sans-serif" font-size="${num(shape.size)}" dominant-baseline="hanging" fill="${color}">${spans}</text>`;
    }
    default:
      return "";
  }
};

/**
 * A standalone SVG document for a drawing. It holds a background rectangle,
 * shapes and text only: no script, no style sheet, no image and no reference
 * to anything outside the file.
 */
export const drawingToSvg = (
  shapes: Shape[],
  width: number,
  height: number,
  background = "#ffffff"
): string => {
  const w = num(width);
  const h = num(height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${safeColor(background)}"/>` +
    shapes.map(shapeToSvg).join("") +
    `</svg>`
  );
};
