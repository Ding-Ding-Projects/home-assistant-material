import type { SVGTemplateResult } from "lit";
import { svg } from "lit";
import type { EmptyStateTone } from "../empty-state-logic";

/**
 * Small pictures for empty states, drawn inline so they need no file and no
 * network. They share one style: flat shapes on a shelf or a card, one accent
 * shape and one green leaf or tick. Colours come from the theme through these
 * classes, which the component that shows them styles:
 *
 * - `base`: the shelf, the card, outlines (outline variant).
 * - `soft`: large quiet areas (a surface container).
 * - `accent`: the one bright shape (the primary colour).
 * - `leaf`: plants and ticks (the success colour).
 * - `warm`: the lamp or a spark (the warning colour).
 * - `draw`: a line that draws itself when the picture arrives.
 *
 * Every picture is 220 by 150 and is decoration: the words beside it say what
 * is happening.
 */
export type EmptyPicture = "shelf" | "list" | "search" | "repair" | "offline";

export const EMPTY_PICTURES: EmptyPicture[] = [
  "shelf",
  "list",
  "search",
  "repair",
  "offline",
];

/** The picture a tone shows when the page does not choose one. */
export const pictureForTone = (tone: EmptyStateTone): EmptyPicture => {
  switch (tone) {
    case "filtered":
      return "search";
    case "missing":
      return "offline";
    default:
      return "shelf";
  }
};

/** Anything that is not a known picture, or "none", reads as undefined. */
export const normalizePicture = (value: unknown): EmptyPicture | undefined =>
  EMPTY_PICTURES.includes(value as EmptyPicture)
    ? (value as EmptyPicture)
    : undefined;

/**
 * The picture an empty state shows. An empty page is not an action, so there
 * is no picture unless the caller asks for one: a picture name shows that
 * picture, "auto" lets the tone choose, and anything else (including no value
 * and "none") shows the plain icon instead.
 */
export const emptyStatePicture = (
  value: unknown,
  tone: EmptyStateTone
): EmptyPicture | undefined =>
  value === "auto" ? pictureForTone(tone) : normalizePicture(value);

const shelf = svg`
  <rect class="base" x="20" y="112" width="180" height="10" rx="5"></rect>
  <rect class="base" x="36" y="122" width="8" height="24" rx="4"></rect>
  <rect class="base" x="176" y="122" width="8" height="24" rx="4"></rect>
  <rect class="accent" x="92" y="78" width="36" height="34" rx="8"></rect>
  <path class="leaf-line draw" d="M110 78 C110 52 92 46 84 40 M110 70 C112 50 130 46 138 36"
    fill="none" stroke-width="6" stroke-linecap="round"></path>
  <circle class="leaf" cx="84" cy="38" r="9"></circle>
  <circle class="leaf" cx="140" cy="34" r="9"></circle>`;

const list = svg`
  <rect class="soft" x="34" y="14" width="152" height="122" rx="24"></rect>
  <rect class="base" x="50" y="32" width="120" height="22" rx="11"></rect>
  <circle class="accent" cx="61" cy="43" r="7"></circle>
  <rect class="base" x="50" y="64" width="120" height="22" rx="11"></rect>
  <circle class="leaf" cx="61" cy="75" r="7"></circle>
  <rect class="dashed draw" x="50" y="96" width="120" height="22" rx="11"
    fill="none" stroke-width="3" stroke-dasharray="7 7"></rect>
  <path class="warm" d="M188 18 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z"></path>`;

const search = svg`
  <rect class="soft" x="22" y="30" width="120" height="96" rx="22"></rect>
  <rect class="base" x="38" y="50" width="70" height="10" rx="5"></rect>
  <rect class="base" x="38" y="70" width="52" height="10" rx="5"></rect>
  <rect class="base" x="38" y="90" width="62" height="10" rx="5"></rect>
  <circle class="accent-line draw" cx="140" cy="72" r="30" fill="none"
    stroke-width="10"></circle>
  <path class="accent-line" d="M162 94 L192 124" fill="none" stroke-width="14"
    stroke-linecap="round"></path>
  <circle class="leaf" cx="140" cy="72" r="6"></circle>`;

const repair = svg`
  <rect class="base" x="20" y="124" width="180" height="10" rx="5"></rect>
  <path class="soft" d="M110 18 L156 34 V70 C156 98 136 114 110 124 C84 114 64 98 64 70 V34 Z"></path>
  <path class="leaf-line draw" d="M88 72 L104 88 L134 56" fill="none"
    stroke-width="10" stroke-linecap="round" stroke-linejoin="round"></path>
  <path class="accent" d="M162 98 a14 14 0 0 1 18 -14 l-9 9 l4 6 l6 4 l9 -9 a14 14 0 0 1 -14 18 l-22 22 a5 5 0 0 1 -8 -8 Z"></path>`;

const offline = svg`
  <path class="soft" d="M58 104 a26 26 0 0 1 4 -52 a36 36 0 0 1 68 -8 a30 30 0 0 1 30 60 Z"></path>
  <path class="accent-line draw" d="M50 30 L170 128" fill="none" stroke-width="10"
    stroke-linecap="round"></path>
  <rect class="base" x="96" y="116" width="28" height="18" rx="6"></rect>
  <rect class="warm" x="101" y="134" width="5" height="10" rx="2"></rect>
  <rect class="warm" x="114" y="134" width="5" height="10" rx="2"></rect>`;

export const pictureTemplate = (picture: EmptyPicture): SVGTemplateResult => {
  switch (picture) {
    case "list":
      return list;
    case "search":
      return search;
    case "repair":
      return repair;
    case "offline":
      return offline;
    default:
      return shelf;
  }
};
