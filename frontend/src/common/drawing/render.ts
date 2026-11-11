import type { Shape, StrokePoint, TextMeasure } from "./model";
import { hasPressure, pressureWidth, shapeBounds, strokeStyle } from "./model";
import { arrowHead } from "./svg-export";

type Ctx = CanvasRenderingContext2D;

const smoothPath = (ctx: Ctx, points: StrokePoint[]): void => {
  ctx.beginPath();
  if (points.length === 1) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[0].x + 0.01, points[0].y);
    return;
  }
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    ctx.quadraticCurveTo(
      points[i].x,
      points[i].y,
      (points[i].x + points[i + 1].x) / 2,
      (points[i].y + points[i + 1].y) / 2
    );
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
};

/** Draw one shape in drawing units. The context transform sets the zoom. */
export const drawShape = (ctx: Ctx, shape: Shape): void => {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = shape.width;
  switch (shape.kind) {
    case "pen":
    case "pencil":
    case "brush":
    case "highlighter": {
      const pts = shape.points;
      if (!pts.length) {
        break;
      }
      const style = strokeStyle(shape.kind, shape.width);
      ctx.globalAlpha = style.opacity;
      ctx.lineCap = style.cap;
      ctx.lineWidth = style.width;
      if (style.pressure && hasPressure(pts) && pts.length > 1) {
        // A pen that reports pressure draws segment by segment.
        for (let i = 1; i < pts.length; i++) {
          ctx.lineWidth = pressureWidth(style.width, pts[i - 1].p, pts[i].p);
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      } else {
        smoothPath(ctx, pts);
        ctx.stroke();
      }
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(shape.to.x, shape.to.y);
      ctx.stroke();
      break;
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(shape.to.x, shape.to.y);
      ctx.stroke();
      const head = arrowHead(shape.from, shape.to, shape.width);
      ctx.beginPath();
      ctx.moveTo(head[0][0], head[0][1]);
      ctx.lineTo(head[1][0], head[1][1]);
      ctx.lineTo(head[2][0], head[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "rect":
      ctx.strokeRect(
        Math.min(shape.from.x, shape.to.x),
        Math.min(shape.from.y, shape.to.y),
        Math.abs(shape.to.x - shape.from.x),
        Math.abs(shape.to.y - shape.from.y)
      );
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(
        (shape.from.x + shape.to.x) / 2,
        (shape.from.y + shape.to.y) / 2,
        Math.abs(shape.to.x - shape.from.x) / 2,
        Math.abs(shape.to.y - shape.from.y) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      break;
    case "text": {
      ctx.font = `${shape.size}px sans-serif`;
      ctx.textBaseline = "top";
      shape.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, shape.at.x, shape.at.y + i * shape.size * 1.2);
      });
      break;
    }
    default:
  }
  ctx.restore();
};

/** Draw the page: white ground, the picture scaled to the page, then shapes. */
export const drawPage = (
  ctx: Ctx,
  shapes: Shape[],
  page: { width: number; height: number },
  background?: CanvasImageSource
): void => {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  if (background) {
    ctx.drawImage(background, 0, 0, page.width, page.height);
  }
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  for (const shape of shapes) {
    drawShape(ctx, shape);
  }
  ctx.restore();
};

/** A dashed outline around a shape, for the selection. */
export const drawSelection = (
  ctx: Ctx,
  shape: Shape,
  scale: number,
  measure?: TextMeasure
): void => {
  const b = shapeBounds(shape, measure);
  const pad = 6 / scale;
  ctx.save();
  ctx.strokeStyle = "#1a73e8";
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeRect(
    b.minX - pad,
    b.minY - pad,
    b.maxX - b.minX + pad * 2,
    b.maxY - b.minY + pad * 2
  );
  ctx.restore();
};
