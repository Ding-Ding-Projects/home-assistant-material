/** Name rules for the files of the Manage dialog. */

/** The extension of a file name with its dot, in lower case; empty without one. */
export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

/** True when a new name ends in another extension than the old one. */
export const extensionChanged = (before: string, after: string): boolean =>
  extensionOf(before) !== extensionOf(after);

/** Checks the name of an image, which the image store keeps as plain text. */
export const isValidImageName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= 255 &&
  name === name.trim() &&
  !/[/\\]/.test(name) &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(name);

/** True when another entry of the list already has the name, in any letter case. */
export const nameTaken = (
  name: string,
  existing: readonly string[],
  ignore?: string
): boolean => {
  const folded = name.toLowerCase();
  return existing.some(
    (other) => other !== ignore && other.toLowerCase() === folded
  );
};

/** A name that is not in the list: "a.png" becomes "a (2).png" when taken. */
export const uniqueName = (name: string, used: Set<string>): string => {
  const extension = name.lastIndexOf(".") > 0 ? extensionOf(name) : "";
  const base = extension ? name.slice(0, name.length - extension.length) : name;
  let candidate = name;
  for (let count = 2; used.has(candidate.toLowerCase()); count++) {
    candidate = `${base} (${count})${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};
