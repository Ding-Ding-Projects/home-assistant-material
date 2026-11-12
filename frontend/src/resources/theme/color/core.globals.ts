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
    --ha-color-primary-05: #061a52;
    --ha-color-primary-10: #0b2a78;
    --ha-color-primary-20: #123a9e;
    --ha-color-primary-30: #1a47bd;
    --ha-color-primary-40: #2155d6;
    --ha-color-primary-50: #3d6de0;
    --ha-color-primary-60: #628af0;
    --ha-color-primary-70: #8aa8f7;
    --ha-color-primary-80: #b0c4ff;
    --ha-color-primary-90: #dce4ff;
    --ha-color-primary-95: #eef2ff;

    /* tertiary */
    --ha-color-tertiary-10: #3a1a73;
    --ha-color-tertiary-20: #432a78;
    --ha-color-tertiary-40: #6d44b8;
    --ha-color-tertiary-80: #d2b6ff;
    --ha-color-tertiary-90: #efe3ff;

    /* neutral */
    --ha-color-neutral-05: #14171d;
    --ha-color-neutral-10: #1a1e25;
    --ha-color-neutral-20: #20252d;
    --ha-color-neutral-30: #323844;
    --ha-color-neutral-40: #4a505c;
    --ha-color-neutral-50: #646a78;
    --ha-color-neutral-60: #808997;
    --ha-color-neutral-70: #99a0ae;
    --ha-color-neutral-80: #bcc2cf;
    --ha-color-neutral-90: #e3e9f2;
    --ha-color-neutral-95: #edf1f7;

    /* orange */
    --ha-color-orange-05: #280700;
    --ha-color-orange-10: #4a3200;
    --ha-color-orange-20: #4d2c00;
    --ha-color-orange-30: #6b3d00;
    --ha-color-orange-40: #8a5100;
    --ha-color-orange-50: #c94e00;
    --ha-color-orange-60: #f36d00;
    --ha-color-orange-70: #ff9342;
    --ha-color-orange-80: #ffbb89;
    --ha-color-orange-90: #ffe9c7;
    --ha-color-orange-95: #fff4e0;

    /* red */
    --ha-color-red-05: #3a0d07;
    --ha-color-red-10: #5c160c;
    --ha-color-red-20: #7a2013;
    --ha-color-red-30: #962518;
    --ha-color-red-40: #b42a18;
    --ha-color-red-50: #dc3146;
    --ha-color-red-60: #f3676c;
    --ha-color-red-70: #fd8f90;
    --ha-color-red-80: #ffb4a8;
    --ha-color-red-90: #ffe1dc;
    --ha-color-red-95: #fff0ef;

    /* green */
    --ha-color-green-05: #031608;
    --ha-color-green-10: #0f3d22;
    --ha-color-green-20: #124a2a;
    --ha-color-green-30: #145a31;
    --ha-color-green-40: #1a6e3e;
    --ha-color-green-50: #00883c;
    --ha-color-green-60: #00ac49;
    --ha-color-green-70: #7fdca0;
    --ha-color-green-80: #a6e8bd;
    --ha-color-green-90: #d4f4df;
    --ha-color-green-95: #e3f9e3;
  }
`;

export const coreColorVariables = extractVars(coreColorStyles);
