/**
 * Records how long a dashboard card took to draw for the first time: from the
 * moment its element was created to the moment the element reported its first
 * finished render. The performance tool reads the value back. The time
 * includes any wait for the card to be attached to the page, so a card that was
 * created but shown later reports a longer time; it is a measurement made in
 * this browser, never an estimate.
 */

interface FirstDrawElement extends HTMLElement {
  updateComplete?: Promise<unknown>;
}

const firstDraws = new WeakMap<object, number>();

/** Starts timing one card element; the result is stored against `owner`. */
export const trackFirstDraw = (owner: object, element: FirstDrawElement) => {
  const start = performance.now();
  firstDraws.delete(owner);
  if (!(element.updateComplete instanceof Promise)) {
    return;
  }
  element.updateComplete
    .then(() => {
      firstDraws.set(owner, Math.round((performance.now() - start) * 10) / 10);
    })
    .catch(() => {
      // A card that failed to render has no first draw time.
    });
};

/** Milliseconds to the first draw of this card, or undefined when not known. */
export const getFirstDrawMs = (owner: object): number | undefined =>
  firstDraws.get(owner);
