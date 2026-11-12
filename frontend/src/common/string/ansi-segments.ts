/**
 * Splits a line of terminal output into runs of text that share one set of
 * colours and text styles. The log renderer and the log terminal both use it,
 * so a line looks the same in each.
 *
 * Each run names its styles as class names (`bold`, `italic`, `underline`,
 * `strikethrough`, `fg-<colour>`, `bg-<colour>`), which `ansiStyles` styles.
 */

export interface AnsiSegment {
  text: string;
  classes: string[];
}

interface AnsiState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  foregroundColor: null | string;
  backgroundColor: null | string;
}

const FOREGROUND: Record<number, string | null> = {
  30: null,
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  39: null,
};

const BACKGROUND: Record<number, string | null> = {
  40: "black",
  41: "red",
  42: "green",
  43: "yellow",
  44: "blue",
  45: "magenta",
  46: "cyan",
  47: "white",
  49: null,
};

// eslint-disable-next-line no-control-regex
const ESCAPE = /\x1b(?:\[(.*?)[@-~]|\].*?(?:\x07|\x1b\\))/g;

const applyCode = (state: AnsiState, code: number): void => {
  switch (code) {
    case 0:
      state.bold = false;
      state.italic = false;
      state.underline = false;
      state.strikethrough = false;
      state.foregroundColor = null;
      state.backgroundColor = null;
      break;
    case 1:
      state.bold = true;
      break;
    case 3:
      state.italic = true;
      break;
    case 4:
      state.underline = true;
      break;
    case 9:
      state.strikethrough = true;
      break;
    case 22:
      state.bold = false;
      break;
    case 23:
      state.italic = false;
      break;
    case 24:
      state.underline = false;
      break;
    case 29:
      state.strikethrough = false;
      break;
    default:
      if (code in FOREGROUND) {
        state.foregroundColor = FOREGROUND[code];
      } else if (code in BACKGROUND) {
        state.backgroundColor = BACKGROUND[code];
      }
  }
};

const classesOf = (state: AnsiState): string[] => {
  const classes: string[] = [];
  if (state.bold) {
    classes.push("bold");
  }
  if (state.italic) {
    classes.push("italic");
  }
  if (state.underline) {
    classes.push("underline");
  }
  if (state.strikethrough) {
    classes.push("strikethrough");
  }
  if (state.foregroundColor !== null) {
    classes.push(`fg-${state.foregroundColor}`);
  }
  if (state.backgroundColor !== null) {
    classes.push(`bg-${state.backgroundColor}`);
  }
  return classes;
};

export const parseAnsiSegments = (line: string): AnsiSegment[] => {
  const segments: AnsiSegment[] = [];
  const state: AnsiState = {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    foregroundColor: null,
    backgroundColor: null,
  };
  const add = (text: string) => {
    if (text) {
      segments.push({ text, classes: classesOf(state) });
    }
  };
  const re = new RegExp(ESCAPE.source, "g");
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    add(line.substring(index, match.index));
    index = match.index + match[0].length;
    if (match[1] === undefined) {
      continue;
    }
    match[1].split(";").forEach((code) => applyCode(state, parseInt(code, 10)));
  }
  add(line.substring(index));
  return segments;
};

/** The text of a line with every colour and style code taken out. */
export const stripAnsi = (line: string): string =>
  line.replace(new RegExp(ESCAPE.source, "g"), "");
