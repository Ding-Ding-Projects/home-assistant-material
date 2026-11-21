/**
 * Whether a details row's label fits its column beside the value, or needs a
 * line of its own above the value.
 *
 * The label column is 104 px wide in a narrow panel and 168 px in a panel of
 * 520 px or more (see `detailsStyles`). A label written in both languages
 * ("Last changed · 上次改變") is often wider than that; it then goes above its
 * value instead of running into it. The width is estimated from the text, so
 * the row can be laid out before it is measured: Chinese, Japanese and Korean
 * characters are about one font size wide, other characters about half.
 */

/** The label's font size, in pixels. */
export const DETAILS_LABEL_FONT_PX = 12;

/** The label column's width in a narrow and in a wide panel, in pixels. */
export const DETAILS_LABEL_COLUMN_PX = { narrow: 104, wide: 168 } as const;

// Han, Hiragana, Katakana, Hangul and the full-width forms.
const WIDE_CHARACTER = /[ᄀ-ᇿ⺀-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/u;

/** An estimate of the label's width on one line, in pixels. */
export const estimateLabelWidth = (
  label: string,
  fontPx = DETAILS_LABEL_FONT_PX
): number => {
  let em = 0;
  for (const character of label) {
    em += WIDE_CHARACTER.test(character) ? 1 : 0.56;
  }
  return Math.ceil(em * fontPx);
};

/**
 * Classes for a details row: `label-over-narrow` when the label does not fit
 * the narrow column on one line, `label-over-wide` when it does not fit the
 * wide one either.
 */
export const detailsLabelFit = (
  label: string
): { "label-over-narrow": boolean; "label-over-wide": boolean } => {
  const width = estimateLabelWidth(label);
  return {
    "label-over-narrow": width > DETAILS_LABEL_COLUMN_PX.narrow,
    "label-over-wide": width > DETAILS_LABEL_COLUMN_PX.wide,
  };
};
