import { css } from "lit";
import { extractVars } from "../../../common/style/derived-css-vars";

/*
 * Core color tokens are the foundational color values used throughout the design system.
 * These tokens represent raw, brand-independent colors such as grayscale shades, base hues, and accent tones.
 * Core tokens shouldn't be tied to any specific UI purpose or role. Instead, they serve as building blocks from which semantic tokens are derived.
 * Changes to core tokens will cascade into semantic tokens that reference them, enabling flexible theming and consistent design language.
 * Please note that these core tokens are not intended to be used directly in components or styles.
 */
export const coreColorStyles = css`
  html {
    /* pure */
    --ha-color-black: #000000;
    --ha-color-white: #ffffff;

    /* primary */
    --ha-color-primary-05: #001d33;
    --ha-color-primary-10: #002b48;
    --ha-color-primary-20: #003c61;
    --ha-color-primary-30: #004a76;
    --ha-color-primary-40: #00639b;
    --ha-color-primary-50: #2a7db8;
    --ha-color-primary-60: #4f97d4;
    --ha-color-primary-70: #7bb5ec;
    --ha-color-primary-80: #a9d2ff;
    --ha-color-primary-90: #cee5ff;
    --ha-color-primary-95: #e8f2ff;

    /* neutral */
    --ha-color-neutral-05: #181c20;
    --ha-color-neutral-10: #1d2126;
    --ha-color-neutral-20: #2d3135;
    --ha-color-neutral-30: #42474e;
    --ha-color-neutral-40: #5a5f66;
    --ha-color-neutral-50: #72777f;
    --ha-color-neutral-60: #8c9199;
    --ha-color-neutral-70: #a8adb5;
    --ha-color-neutral-80: #c2c7cf;
    --ha-color-neutral-90: #e1e5ec;
    --ha-color-neutral-95: #f1f4f9;

    /* orange */
    --ha-color-orange-05: #280700;
    --ha-color-orange-10: #3b0f00;
    --ha-color-orange-20: #5e1c00;
    --ha-color-orange-30: #7e2900;
    --ha-color-orange-40: #9d3800;
    --ha-color-orange-50: #c94e00;
    --ha-color-orange-60: #f36d00;
    --ha-color-orange-70: #ff9342;
    --ha-color-orange-80: #ffbb89;
    --ha-color-orange-90: #ffe0c8;
    --ha-color-orange-95: #fff0e4;

    /* red */
    --ha-color-red-05: #2a040b;
    --ha-color-red-10: #3e0913;
    --ha-color-red-20: #631323;
    --ha-color-red-30: #8a132c;
    --ha-color-red-40: #b30532;
    --ha-color-red-50: #dc3146;
    --ha-color-red-60: #f3676c;
    --ha-color-red-70: #fd8f90;
    --ha-color-red-80: #ffb8b6;
    --ha-color-red-90: #ffdedc;
    --ha-color-red-95: #fff0ef;

    /* green */
    --ha-color-green-05: #031608;
    --ha-color-green-10: #052310;
    --ha-color-green-20: #0a3a1d;
    --ha-color-green-30: #0a5027;
    --ha-color-green-40: #036730;
    --ha-color-green-50: #00883c;
    --ha-color-green-60: #00ac49;
    --ha-color-green-70: #5dc36f;
    --ha-color-green-80: #93da98;
    --ha-color-green-90: #c2f2c1;
    --ha-color-green-95: #e3f9e3;
  }
`;

export const coreColorVariables = extractVars(coreColorStyles);
