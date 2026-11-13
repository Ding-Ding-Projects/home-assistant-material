/**
 * Records how long a dashboard card took to draw for the first time: from the
 * moment its element was created to the moment the element reported its first
 * finished render. The performance tool reads the value back. The time
 * includes any wait for the card to be attached to the page, so a card that was
 * created but shown later reports a longer time; it is a measurement made in
 * this browser, never an estimate.
 */

import type { CardDrawInfo } from "./load-diagnostics";
import { recordCardDraw } from "./load-diagnostics";

interface FirstDrawElement extends HTMLElement {
  updateComplete?: Promise<unknown>;
}

const firstDraws = new WeakMap<object, number>();

/**
 * Starts timing one card element; the result is stored against `owner`. When
 * `info` is given, the draw also goes into the dashboard load sample that the
 * performance diagnostics page reads.
 */
export const trackFirstDraw = (
  owner: object,
  element: FirstDrawElement,
  info?: CardDrawInfo
) => {
  const start = performance.now();
  firstDraws.delete(owner);
  if (!(element.updateComplete instanceof Promise)) {
    return;
  }
  element.updateComplete
    .then(() => {
      const end = performance.now();
      firstDraws.set(owner, Math.round((end - start) * 10) / 10);
      if (info) {
        recordCardDraw(info, start, end);
      }
    })
    .catch(() => {
      // A card that failed to render has no first draw time.
    });
};

/** Milliseconds to the first draw of this card, or undefined when not known. */
export const getFirstDrawMs = (owner: object): number | undefined =>
  firstDraws.get(owner);
