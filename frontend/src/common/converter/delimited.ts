import type { ConvertError } from "./types";

export type Delimiter = "," | "\t";

export type DelimitedParse =
  { ok: true; rows: string[][] } | { ok: false; error: ConvertError };

/**
 * Reads comma or tab separated text as RFC 4180 describes it: fields may be
 * quoted, a quoted field may hold the separator, line breaks and doubled
 * quotes. Anything else stops the reading at the exact line and column.
 * Lines with nothing on them are skipped.
 */
export const parseDelimited = (
  text: string,
  delimiter: Delimiter
): DelimitedParse => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let line = 1;
  let column = 1;
  let inQuotes = false;
  let afterQuote = false;
  let fieldStarted = false;
  let rowQuoted = false;
  let quoteLine = 1;
  let quoteColumn = 1;

  const endRow = () => {
    if (row.length === 0 && field === "" && !rowQuoted && !afterQuote) {
      return;
    }
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
    fieldStarted = false;
    afterQuote = false;
    rowQuoted = false;
  };
  const fail = (code: string): DelimitedParse => ({
    ok: false,
    error: { code, line, column },
  });

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
          column += 2;
        } else {
          inQuotes = false;
          afterQuote = true;
          column++;
        }
      } else {
        field += char;
        if (char === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
      }
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") {
        index++;
      }
      endRow();
      line++;
      column = 1;
      continue;
    }
    if (afterQuote && char !== delimiter) {
      return fail("csv_after_quote");
    }
    if (char === '"') {
      if (fieldStarted) {
        return fail("csv_stray_quote");
      }
      inQuotes = true;
      rowQuoted = true;
      fieldStarted = true;
      quoteLine = line;
      quoteColumn = column;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      fieldStarted = false;
      afterQuote = false;
      rowQuoted = true;
    } else {
      field += char;
      fieldStarted = true;
    }
    column++;
  }
  if (inQuotes) {
    return {
      ok: false,
      error: { code: "csv_unterminated", line: quoteLine, column: quoteColumn },
    };
  }
  endRow();
  return { ok: true, rows };
};

const needsQuotes = (cell: string, delimiter: Delimiter): boolean =>
  cell.includes(delimiter) ||
  cell.includes('"') ||
  cell.includes("\n") ||
  cell.includes("\r");

/** Writes rows as text, one row to a line, quoting only where it is needed. */
export const writeDelimited = (
  rows: readonly (readonly string[])[],
  delimiter: Delimiter
): string =>
  rows
    .map((row) =>
      // A line holding one empty cell would read back as a blank line, which
      // is skipped, so that cell is written as an empty quoted value.
      row.length === 1 && row[0] === ""
        ? '""'
        : row
            .map((cell) =>
              needsQuotes(cell, delimiter)
                ? `"${cell.replace(/"/g, '""')}"`
                : cell
            )
            .join(delimiter)
    )
    .join("\n") + (rows.length ? "\n" : "");
