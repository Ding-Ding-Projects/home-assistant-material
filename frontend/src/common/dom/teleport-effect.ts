/**
 * The teleport transition, shared by every control that jumps to an exact
 * element: Teleport on Repairs, search results that land on a setting, and
 * the card jumps in the dashboard editor.
 *
 * Departure: a ring bursts where the person clicked and a beam streaks to
 * the destination. Arrival: the element materialises out of a bright blur
 * while a scan line sweeps over it, then a glow fades. Reduce motion (the
 * system setting or the app's own accessibility tool) skips all of it.
 *
 * The effect layers are short-lived, fixed and ignore the pointer; nothing
 * of the element's own styling is changed once the animations finish.
 */

const ARRIVAL_MS = 720;
const DEPARTURE_MS = 420;

export const teleportMotionReduced = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.hasAttribute("data-a11y-reduce-motion");

const accent = (element?: Element): string => {
  const style = getComputedStyle(element || document.documentElement);
  return (
    style.getPropertyValue("--primary-color").trim() ||
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary-color")
      .trim() ||
    "#3b82f6"
  );
};

const layer = (css: Partial<CSSStyleDeclaration>): HTMLDivElement => {
  const div = document.createElement("div");
  div.setAttribute("aria-hidden", "true");
  Object.assign(div.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483000",
    ...css,
  });
  document.body.appendChild(div);
  return div;
};

const removeAfter = (animation: Animation, element: Element) => {
  const done = () => element.remove();
  animation.addEventListener("finish", done);
  animation.addEventListener("cancel", done);
};

/** A ring bursting at the point the teleport started from, with a beam to the target. */
export const playTeleportDeparture = (
  origin: { x: number; y: number },
  target?: Element
): void => {
  if (teleportMotionReduced()) {
    return;
  }
  const color = accent();
  const ring = layer({
    left: `${origin.x - 24}px`,
    top: `${origin.y - 24}px`,
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    border: `2px solid ${color}`,
    boxShadow: `0 0 18px ${color}, inset 0 0 12px ${color}`,
  });
  removeAfter(
    ring.animate(
      [
        { transform: "scale(0.3)", opacity: 1 },
        { transform: "scale(2.6)", opacity: 0 },
      ],
      { duration: DEPARTURE_MS, easing: "cubic-bezier(.2,.7,.2,1)" }
    ),
    ring
  );
  if (!target) {
    return;
  }
  const rect = target.getBoundingClientRect();
  const tx = rect.left + rect.width / 2;
  const ty = rect.top + rect.height / 2;
  const length = Math.hypot(tx - origin.x, ty - origin.y);
  if (length < 24) {
    return;
  }
  const angle = Math.atan2(ty - origin.y, tx - origin.x);
  const beam = layer({
    left: `${origin.x}px`,
    top: `${origin.y - 1.5}px`,
    width: `${length}px`,
    height: "3px",
    borderRadius: "3px",
    transformOrigin: "0 50%",
    background: `linear-gradient(90deg, transparent, ${color}, #fff)`,
    boxShadow: `0 0 12px ${color}`,
  });
  removeAfter(
    beam.animate(
      [
        { transform: `rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        {
          transform: `rotate(${angle}rad) scaleX(1)`,
          opacity: 1,
          offset: 0.6,
        },
        { transform: `rotate(${angle}rad) scaleX(1)`, opacity: 0 },
      ],
      { duration: DEPARTURE_MS, easing: "cubic-bezier(.3,0,.2,1)" }
    ),
    beam
  );
};

/** The element materialises: blur to sharp, a scan line, then a fading glow. */
export const playTeleportArrival = (element: Element, delay = 0): void => {
  if (teleportMotionReduced() || !(element instanceof HTMLElement)) {
    return;
  }
  const color = accent(element);
  element.animate(
    [
      {
        filter: "blur(8px) brightness(1.9) saturate(1.6)",
        clipPath: "inset(0 0 100% 0 round 16px)",
        opacity: 0.4,
      },
      {
        filter: "blur(2px) brightness(1.4) saturate(1.3)",
        clipPath: "inset(0 0 0 0 round 16px)",
        opacity: 1,
        offset: 0.55,
      },
      { filter: "none", clipPath: "inset(0 0 0 0 round 0)", opacity: 1 },
    ],
    {
      duration: ARRIVAL_MS,
      delay,
      easing: "cubic-bezier(.2,.8,.2,1)",
    }
  );
  element.animate(
    [
      { boxShadow: `0 0 0 2px ${color}, 0 0 32px ${color}` },
      { boxShadow: `0 0 0 2px ${color}, 0 0 32px ${color}`, offset: 0.5 },
      { boxShadow: "0 0 0 0 transparent" },
    ],
    { duration: ARRIVAL_MS * 2, delay, easing: "ease-out" }
  );
  const rect = element.getBoundingClientRect();
  const scan = layer({
    left: `${rect.left - 6}px`,
    top: `${rect.top}px`,
    width: `${rect.width + 12}px`,
    height: "2px",
    background: `linear-gradient(90deg, transparent, #fff, ${color}, #fff, transparent)`,
    boxShadow: `0 0 16px 2px ${color}`,
    opacity: "0",
  });
  removeAfter(
    scan.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: `translateY(${rect.height}px)`, opacity: 1, offset: 0.85 },
        { transform: `translateY(${rect.height}px)`, opacity: 0 },
      ],
      { duration: ARRIVAL_MS, delay, easing: "cubic-bezier(.4,0,.2,1)" }
    ),
    scan
  );
};

/** The last place the person pressed, so a teleport can start from there. */
let lastPress: { x: number; y: number } | undefined;
let tracking = false;

export const trackTeleportOrigin = (): void => {
  if (tracking) {
    return;
  }
  tracking = true;
  window.addEventListener(
    "pointerdown",
    (ev) => {
      lastPress = { x: ev.clientX, y: ev.clientY };
    },
    { capture: true, passive: true }
  );
};

/** Departure from where the person pressed, then arrival on the element. */
export const playTeleport = (element: Element): void => {
  if (lastPress) {
    playTeleportDeparture(lastPress, element);
    lastPress = undefined;
  }
  playTeleportArrival(element, 120);
};
