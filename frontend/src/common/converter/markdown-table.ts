import type { ConvertError } from "./types";

export type MarkdownParse =
  { ok: true; rows: string[][] } | { ok: false; error: ConvertError };

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Splits a line on pipes that are not escaped, dropping the outer ones. */
const splitCells = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\" && line[index + 1] === "|") {
      current += "|";
      index++;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  if (cells[0].trim() === "") {
    cells.shift();
  }
  if (cells.length && cells[cells.length - 1].trim() === "") {
    cells.pop();
  }
  return cells.map((cell) => cell.trim().replace(/<br\s*\/?>/gi, "\n"));
};

/** Reads one Markdown table: a header line, a separator line, then rows. */
export const parseMarkdownTable = (text: string): MarkdownParse => {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") {
    first++;
  }
  if (first >= lines.length || !lines[first].includes("|")) {
    return {
      ok: false,
      error: { code: "markdown_no_table", line: first + 1 },
    };
  }
  if (!lines[first + 1] || !SEPARATOR.test(lines[first + 1])) {
    return {
      ok: false,
      error: { code: "markdown_no_separator", line: first + 2 },
    };
  }
  const rows = [splitCells(lines[first])];
  for (let at = first + 2; at < lines.length; at++) {
    if (lines[at].trim() === "") {
      continue;
    }
    if (!lines[at].includes("|")) {
      return { ok: false, error: { code: "markdown_not_row", line: at + 1 } };
    }
    rows.push(splitCells(lines[at]));
  }
  return { ok: true, rows };
};

/** Writes rows as a Markdown table. The first row is the header. */
export const writeMarkdownTable = (
  rows: readonly (readonly string[])[]
): { text: string; lineBreaks: number } => {
  if (rows.length === 0) {
    return { text: "", lineBreaks: 0 };
  }
  let lineBreaks = 0;
  const cell = (value: string) => {
    const broken = value.replace(/\r?\n|\r/g, () => {
      lineBreaks++;
      return "<br>";
    });
    return broken.replace(/\|/g, "\\|");
  };
  const width = Math.max(...rows.map((row) => row.length), 1);
  const line = (row: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cell(row[i] ?? "")).join(" | ")} |`;
  const header = line(rows[0]);
  const separator = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return {
    text: [header, separator, ...rows.slice(1).map(line)].join("\n") + "\n",
    lineBreaks,
  };
};
