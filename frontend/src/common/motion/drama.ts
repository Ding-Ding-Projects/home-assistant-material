import type {
  MotionKindId,
  MotionProfile,
} from "../appearance/motion-profiles";
import {
  activeProfile,
  curveToCss,
  effectiveCurve,
  effectiveDuration,
  getMotionSettings,
} from "../appearance/motion-profiles";
import type { ConfirmationDrama } from "../confirm/two-key-drama";
import { isReduced, readDrama } from "./page-entry";

/**
 * The dramatic moments: something arrived, finished, failed, was deleted, or
 * there is nothing here yet. Each one is its own kind in the motion settings,
 * so the person can change its duration and curve or switch it off, and each
 * follows the "Confirmation drama" choice:
 *
 * - Off: nothing moves.
 * - Calm: a short fade only.
 * - Standard: a smaller version of the moment.
 * - Dramatic: the full moment.
 *
 * Reduced motion (the system setting, the accessibility tool or low
 * stimulation) always wins and nothing moves. Every moment plays once and only
 * changes `transform`, `opacity` and `stroke-dashoffset`; the floating empty
 * picture is the only one that repeats, three times, and then rests.
 */

export type DramaKindId = Extract<
  MotionKindId,
  "arrivals" | "celebrations" | "failures" | "removals" | "pictures"
>;

export const DRAMA_KIND_IDS: DramaKindId[] = [
  "arrivals",
  "celebrations",
  "failures",
  "removals",
  "pictures",
];

export type DramaMode = "none" | "fade" | "move" | "dramatic";

export interface DramaTiming {
  mode: DramaMode;
  /** Milliseconds for the whole moment. */
  duration: number;
  /** A CSS easing for the main movement. */
  easing: string;
}

/** The longest a Calm fade lasts, whatever the kind's duration. */
export const CALM_FADE_MAX_MS = 300;

export const NO_DRAMA: DramaTiming = { mode: "none", duration: 0, easing: "" };

/**
 * How one kind of moment plays for a drama choice, the reduced-motion state
 * and a motion profile. Pure, so the rules can be tested on their own.
 */
export const dramaTiming = (
  kind: DramaKindId,
  drama: ConfirmationDrama,
  reducedMotion: boolean,
  profile: MotionProfile
): DramaTiming => {
  if (reducedMotion || drama === "off") {
    return NO_DRAMA;
  }
  const setting = profile.kinds[kind];
  if (!profile.master || !setting?.enabled) {
    return NO_DRAMA;
  }
  const duration = effectiveDuration(profile, kind);
  const easing = curveToCss(effectiveCurve(profile, kind));
  if (drama === "calm") {
    return {
      mode: "fade",
      duration: Math.min(duration, CALM_FADE_MAX_MS),
      easing: "ease-out",
    };
  }
  return {
    mode: drama === "standard" ? "move" : "dramatic",
    duration,
    easing,
  };
};

/** Reads the person's drama choice, the reduced-motion state and profile. */
export const currentDramaTiming = (kind: DramaKindId): DramaTiming => {
  let profile: MotionProfile;
  try {
    profile = activeProfile(getMotionSettings());
  } catch (_err) {
    return NO_DRAMA;
  }
  return dramaTiming(kind, readDrama(), isReduced(), profile);
};

const canAnimate = (element: Element | null | undefined): element is Element =>
  !!element && typeof element.animate === "function";

const run = (
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | undefined =>
  canAnimate(element) ? element.animate(keyframes, options) : undefined;

const fadeIn = (
  elements: (Element | null | undefined)[],
  timing: DramaTiming
): Animation[] =>
  elements
    .map((element) =>
      run(element, [{ opacity: 0 }, { opacity: 1 }], {
        duration: timing.duration,
        easing: "ease-out",
      })
    )
    .filter((animation): animation is Animation => !!animation);

const keep = (animations: (Animation | undefined)[]): Animation[] =>
  animations.filter((animation): animation is Animation => !!animation);

/* ------------------------------------------------------------------------ */
/* Arriving                                                                  */
/* ------------------------------------------------------------------------ */

/** Delay between one shape and the next, as a share of the duration. */
export const ARRIVAL_SHAPE_STEP = 120 / 1100;
/** Delay between one row and the next, as a share of the duration. */
export const ARRIVAL_ROW_STEP = 70 / 1100;
/** At most this many rows follow, so a long list never waits. */
export const ARRIVAL_MAX_ROWS = 8;

export interface ArrivalParts {
  /** Shapes that spin in one after another. */
  shapes?: (Element | null | undefined)[];
  /** Lines that draw themselves, for example the ground line of a picture. */
  lines?: (SVGGeometryElement | null | undefined)[];
  /** The big numeral, which lands last. */
  numeral?: Element | null;
  /** Rows that rise after the shapes. */
  rows?: (Element | null | undefined)[];
}

/** Shapes spin in 120 ms apart, lines draw, the numeral lands, rows follow. */
export const playArrival = (
  parts: ArrivalParts,
  timing: DramaTiming = currentDramaTiming("arrivals")
): Animation[] => {
  const shapes = parts.shapes ?? [];
  const rows = (parts.rows ?? []).slice(0, ARRIVAL_MAX_ROWS);
  if (timing.mode === "none") {
    return [];
  }
  if (timing.mode === "fade") {
    return fadeIn([...shapes, parts.numeral, ...rows], timing);
  }
  const d = timing.duration;
  const dramatic = timing.mode === "dramatic";
  const animations: (Animation | undefined)[] = [];
  shapes.forEach((shape, index) => {
    animations.push(
      run(
        shape,
        dramatic
          ? [
              { opacity: 0, transform: "scale(.2) rotate(-90deg)" },
              {
                opacity: 1,
                transform: "scale(1.12) rotate(6deg)",
                offset: 0.7,
              },
              { opacity: 1, transform: "none" },
            ]
          : [
              { opacity: 0, transform: "scale(.8)" },
              { opacity: 1, transform: "none" },
            ],
        {
          duration: d * 0.55,
          delay: d * ARRIVAL_SHAPE_STEP * index,
          easing: timing.easing,
          fill: "backwards",
        }
      )
    );
  });
  for (const line of parts.lines ?? []) {
    const length = line?.getTotalLength?.() ?? 320;
    animations.push(
      run(
        line,
        [
          { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
          { strokeDasharray: `${length}`, strokeDashoffset: "0" },
        ],
        {
          duration: d * (dramatic ? 0.9 : 0.6),
          delay: d * 0.2,
          easing: "ease-out",
          fill: "backwards",
        }
      )
    );
  }
  const shapesDone = d * ARRIVAL_SHAPE_STEP * shapes.length;
  animations.push(
    run(
      parts.numeral,
      dramatic
        ? [
            { opacity: 0, transform: "scale(.4)" },
            { opacity: 1, transform: "scale(1.4) rotate(-5deg)", offset: 0.6 },
            { opacity: 1, transform: "none" },
          ]
        : [
            { opacity: 0, transform: "scale(.85)" },
            { opacity: 1, transform: "none" },
          ],
      {
        duration: d * 0.5,
        delay: shapesDone,
        easing: timing.easing,
        fill: "backwards",
      }
    )
  );
  rows.forEach((row, index) => {
    animations.push(
      run(
        row,
        [
          { opacity: 0, transform: `translateY(${dramatic ? 32 : 16}px)` },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: d * 0.45,
          delay: shapesDone + d * ARRIVAL_ROW_STEP * index,
          easing: timing.easing,
          fill: "backwards",
        }
      )
    );
  });
  return keep(animations);
};

/* ------------------------------------------------------------------------ */
/* Finished                                                                  */
/* ------------------------------------------------------------------------ */

export interface FinishedParts {
  badge?: Element | null;
  tick?: SVGGeometryElement | null;
  rings?: (Element | null | undefined)[];
  /** Each ray with the angle it leaves at, in degrees. */
  rays?: { element: Element | null | undefined; angle: number }[];
  words?: Element | null;
}

/** The badge pops, the tick draws, two rings and six rays leave, words land. */
export const playFinished = (
  parts: FinishedParts,
  timing: DramaTiming = currentDramaTiming("celebrations")
): Animation[] => {
  if (timing.mode === "none") {
    return [];
  }
  if (timing.mode === "fade") {
    return fadeIn([parts.badge, parts.words], timing);
  }
  const d = timing.duration;
  const dramatic = timing.mode === "dramatic";
  const animations: (Animation | undefined)[] = [];
  animations.push(
    run(
      parts.badge,
      dramatic
        ? [
            { opacity: 0, transform: "scale(.2) rotate(-25deg)" },
            { opacity: 1, transform: "scale(1.18) rotate(4deg)", offset: 0.7 },
            { opacity: 1, transform: "none" },
          ]
        : [
            { opacity: 0, transform: "scale(.6)" },
            { opacity: 1, transform: "scale(1.06)", offset: 0.7 },
            { opacity: 1, transform: "none" },
          ],
      { duration: d * 0.5, easing: timing.easing, fill: "backwards" }
    )
  );
  if (parts.tick) {
    const length = parts.tick.getTotalLength?.() ?? 120;
    animations.push(
      run(
        parts.tick,
        [
          { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
          { strokeDasharray: `${length}`, strokeDashoffset: "0" },
        ],
        {
          duration: d * 0.5,
          delay: d * 0.14,
          easing: "ease-out",
          fill: "backwards",
        }
      )
    );
  }
  const rings = dramatic
    ? (parts.rings ?? [])
    : (parts.rings ?? []).slice(0, 1);
  rings.forEach((ring, index) => {
    animations.push(
      run(
        ring,
        [
          { opacity: 0.9, transform: "scale(.3)" },
          { opacity: 0, transform: `scale(${dramatic ? 2.6 : 1.8})` },
        ],
        {
          duration: d * (index === 0 ? 0.71 : 0.86),
          delay: d * (index === 0 ? 0.21 : 0.36),
          easing: "ease-out",
          fill: "both",
        }
      )
    );
  });
  if (dramatic) {
    for (const ray of parts.rays ?? []) {
      animations.push(
        run(
          ray.element,
          [
            {
              opacity: 0,
              transform: `rotate(${ray.angle}deg) translateY(-30px) scaleY(.2)`,
            },
            {
              opacity: 1,
              transform: `rotate(${ray.angle}deg) translateY(-66px) scaleY(.6)`,
              offset: 0.4,
            },
            {
              opacity: 0,
              transform: `rotate(${ray.angle}deg) translateY(-120px) scaleY(1)`,
            },
          ],
          {
            duration: d * 0.71,
            delay: d * 0.25,
            easing: "ease-out",
            fill: "both",
          }
        )
      );
    }
  }
  animations.push(
    run(
      parts.words,
      dramatic
        ? [
            { opacity: 0, transform: "scale(.6)" },
            { opacity: 1, transform: "scale(1.12) rotate(-2deg)", offset: 0.6 },
            { opacity: 1, transform: "none" },
          ]
        : [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" },
          ],
      {
        duration: d * 0.5,
        delay: d * 0.36,
        easing: timing.easing,
        fill: "backwards",
      }
    )
  );
  return keep(animations);
};

/* ------------------------------------------------------------------------ */
/* Failed                                                                    */
/* ------------------------------------------------------------------------ */

export interface FailedParts {
  /** What shakes: the badge or the whole card. */
  target?: Element | null;
  /** An overlay that flashes red once. */
  flash?: Element | null;
}

/** The sideways shake, for a strength of 1 (Standard) or more. */
export const shakeKeyframes = (strength: number): Keyframe[] => {
  const d = 8 * strength;
  const tilt = strength > 1 ? 3 : 0;
  return [
    { transform: "none" },
    { transform: `translateX(${-d}px) rotate(${-tilt}deg)`, offset: 0.15 },
    { transform: `translateX(${d * 0.88}px) rotate(${tilt}deg)`, offset: 0.35 },
    { transform: `translateX(${-d * 0.56}px)`, offset: 0.55 },
    { transform: `translateX(${d * 0.38}px)`, offset: 0.75 },
    { transform: "none" },
  ];
};

/**
 * One red flash and one firm shake. The caller keeps the words that say what
 * happened on screen; this only moves and flashes.
 */
export const playFailed = (
  parts: FailedParts,
  timing: DramaTiming = currentDramaTiming("failures")
): Animation[] => {
  if (timing.mode === "none") {
    return [];
  }
  if (timing.mode === "fade") {
    return keep([
      run(parts.target, [{ opacity: 0.5 }, { opacity: 1 }], {
        duration: timing.duration,
        easing: "ease-out",
      }),
    ]);
  }
  const dramatic = timing.mode === "dramatic";
  return keep([
    run(
      parts.flash,
      [
        { opacity: 0 },
        { opacity: dramatic ? 0.75 : 0.35, offset: 0.2 },
        { opacity: 0 },
      ],
      {
        duration: timing.duration * 1.1,
        easing: "ease-out",
        fill: "both",
      }
    ),
    run(parts.target, shakeKeyframes(dramatic ? 2 : 1), {
      duration: timing.duration,
      easing: "ease-in-out",
    }),
  ]);
};

/* ------------------------------------------------------------------------ */
/* Deleted                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The keyframes of a deleted row for a drama mode and the row's height and
 * vertical margin. Dramatic: the row tips, falls and turns away, then its
 * height closes so the rows below move up. Standard: it shudders, slides away
 * and closes. Calm: it fades.
 */
export const removalKeyframes = (
  mode: DramaMode,
  height: number,
  marginBlock = "0px"
): Keyframe[] => {
  if (mode === "none") {
    return [];
  }
  if (mode === "fade") {
    return [{ opacity: 1 }, { opacity: 0 }];
  }
  const full = `${height}px`;
  if (mode === "move") {
    return [
      { opacity: 1, transform: "none", height: full, marginBlock, offset: 0 },
      { opacity: 1, transform: "translateX(-6px)", offset: 0.15 },
      { opacity: 1, transform: "translateX(5px)", offset: 0.3 },
      { opacity: 0, transform: "translateX(40px)", height: full, offset: 0.6 },
      {
        opacity: 0,
        transform: "translateX(40px)",
        height: "0px",
        marginBlock: "0px",
        offset: 1,
      },
    ];
  }
  return [
    { opacity: 1, transform: "none", height: full, marginBlock, offset: 0 },
    {
      opacity: 1,
      transform: "translateX(-10px) rotate(-2deg)",
      offset: 0.2,
    },
    {
      opacity: 0,
      transform: "translate(60px, 160px) rotate(24deg) scale(.7)",
      height: full,
      marginBlock,
      offset: 0.62,
    },
    {
      opacity: 0,
      transform: "translate(60px, 160px) rotate(24deg) scale(.7)",
      height: "0px",
      marginBlock: "0px",
      offset: 1,
    },
  ];
};

/** The duration a removal plays for, shorter for the plain fade. */
export const removalDuration = (timing: DramaTiming): number =>
  timing.mode === "fade"
    ? Math.min(timing.duration, 160)
    : timing.mode === "move"
      ? Math.min(timing.duration, 420)
      : timing.duration;

/**
 * A deleted row tips and falls, and the rows below close the gap. Any list
 * can call this with the row element before it removes the row from its data:
 * it resolves once the row is gone (at once when nothing moves), so the
 * caller can then update the data.
 */
export const fallRow = async (
  row: HTMLElement | null | undefined,
  timing: DramaTiming = currentDramaTiming("removals")
): Promise<void> => {
  if (!canAnimate(row) || timing.mode === "none") {
    return;
  }
  const rect = row.getBoundingClientRect();
  if (!rect.height) {
    return;
  }
  const keyframes = removalKeyframes(
    timing.mode,
    rect.height,
    getComputedStyle(row).marginBlock
  );
  const style = row.style;
  const previous = {
    overflow: style.overflow,
    position: style.position,
    zIndex: style.zIndex,
    transformOrigin: style.transformOrigin,
  };
  if (timing.mode === "dramatic") {
    // Above its neighbours while it falls, turning around its leading corner.
    style.position = previous.position || "relative";
    style.zIndex = "1";
    style.transformOrigin = "0 50%";
  } else {
    style.overflow = "hidden";
  }
  try {
    await row.animate(keyframes, {
      duration: removalDuration(timing),
      easing:
        timing.mode === "dramatic" ? "ease-in" : "cubic-bezier(.3, 0, .2, 1)",
      fill: "forwards",
    }).finished;
  } catch (_err) {
    // A cancelled animation still lets the delete go ahead.
  } finally {
    style.overflow = previous.overflow;
    style.position = previous.position;
    style.zIndex = previous.zIndex;
    style.transformOrigin = previous.transformOrigin;
  }
};

/* ------------------------------------------------------------------------ */
/* Nothing here yet                                                          */
/* ------------------------------------------------------------------------ */

/** How many times the empty picture floats before it rests. */
export const PICTURE_FLOATS = 3;

/** The empty picture floats three times (once for Standard), then rests. */
export const playPictureFloat = (
  picture: Element | null | undefined,
  timing: DramaTiming = currentDramaTiming("pictures")
): Animation | undefined => {
  if (timing.mode === "none" || timing.mode === "fade") {
    return undefined;
  }
  return run(
    picture,
    [
      { transform: "translateY(0)" },
      { transform: "translateY(-10px)", offset: 0.5 },
      { transform: "translateY(0)" },
    ],
    {
      duration: timing.duration,
      iterations: timing.mode === "dramatic" ? PICTURE_FLOATS : 1,
      easing: "ease-in-out",
    }
  );
};
