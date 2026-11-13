/** A single-quoted template string literal. */
export const quote = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** Reverse of `quote` for the inside of a literal (without the quotes). */
export const unquoteBody = (body: string): string =>
  body.replace(/\\(.)/gs, "$1");

/**
 * Plain text written so that it stays plain text inside a template: every
 * template delimiter in it is emitted as a literal. A trailing opening brace
 * is escaped too, because the next piece may start with a delimiter.
 */
export const escapeText = (text: string): string => {
  let result = text.replace(
    /\{([{%#])/g,
    (_match, next: string) => `{{ ${quote(`{${next}`)} }}`
  );
  if (result.endsWith("{") && !result.endsWith("}}")) {
    result = `${result.slice(0, -1)}{{ '{' }}`;
  }
  return result;
};

/** A finite number written for a template; anything else becomes 0. */
export const formatNumber = (value: number): string =>
  Number.isFinite(value) ? String(value) : "0";
