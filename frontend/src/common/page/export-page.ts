import { collectReadableText } from "../accessibility/accessibility-tools";

/**
 * Export of the page a person is looking at: its text and its tables, in
 * the formats that can carry them. Everything is made in the browser from
 * what the page shows; nothing is fetched and nothing is sent anywhere.
 */

export interface ExportTable {
  columns: string[];
  rows: string[][];
  /**
   * The rows ticked in the table, in the same columns; empty when none are.
   * Ticked rows that a search or filter hides are included, so the count
   * matches the selection bar.
   */
  selectedRows?: string[][];
  /** Set only when the table has more rows than were exported. */
  totalRows?: number;
}

export interface PageExport {
  title: string;
  url: string;
  /** ISO 8601, with the time zone offset. */
  exportedAt: string;
  /** The language of the page, for the HTML export; "en" when unknown. */
  lang?: string;
  text: string[];
  tables: ExportTable[];
}

export const EXPORT_FORMATS = [
  "csv",
  "tsv",
  "json",
  "markdown",
  "text",
  "html",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Most rows of one table that are exported. */
export const EXPORT_ROW_LIMIT = 20000;

interface TableLike extends HTMLElement {
  columns?: Record<
    string,
    { title?: unknown; label?: unknown; hidden?: boolean; type?: string }
  >;
  data?: Record<string, unknown>[];
  _filteredData?: Record<string, unknown>[];
  /** The identifiers of the ticked rows, as the shared table reports them. */
  getCheckedRowIds?: () => string[];
}

// Columns that hold a moment in time: the key ends in a word for a moment,
// so a counter such as "triggered_count" is not read as a date.
export const TIME_KEY =
  /(^|_)(at|time|date|datetime|timestamp|created|modified|updated|changed|triggered|seen)$/;

/** A moment stored as seconds or milliseconds, as ISO 8601 in UTC. */
const timeText = (value: number): string | undefined => {
  const ms =
    value >= 1e8 && value < 1e11
      ? value * 1000
      : value >= 1e11 && value < 1e14
        ? value
        : undefined;
  return ms === undefined
    ? undefined
    : new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
};

export const cellText = (value: unknown, key = ""): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return (
      (TIME_KEY.test(key) && Number.isFinite(value) && timeText(value)) ||
      String(value)
    );
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .filter(
        (item) =>
          item !== null && item !== undefined && typeof item !== "object"
      )
      .map(String)
      .join(", ");
  }
  return "";
};

/** Reads a data table as it is filtered now: its named columns and rows. */
export const readDataTable = (table: TableLike): ExportTable | undefined => {
  if (!table.columns) {
    return undefined;
  }
  const columns = Object.entries(table.columns)
    .map(([key, column]) => ({
      key,
      name:
        typeof column.title === "string" && column.title
          ? column.title
          : typeof column.label === "string"
            ? column.label
            : "",
      hidden: column.hidden,
      type: column.type,
    }))
    .filter(
      (column) =>
        column.name &&
        !column.hidden &&
        column.type !== "icon" &&
        column.type !== "icon-button" &&
        column.type !== "overflow-menu"
    );
  if (!columns.length) {
    return undefined;
  }
  const isRow = (row: Record<string, unknown>) =>
    !("append" in row && row.append === true);
  const shown = (table._filteredData ?? table.data ?? []).filter(isRow);
  const source = shown.slice(0, EXPORT_ROW_LIMIT);
  const toCells = (row: Record<string, unknown>) =>
    columns.map((column) => cellText(row[column.key], column.key));
  const checked = new Set(table.getCheckedRowIds?.() ?? []);
  const idKey = typeof table.id === "string" && table.id ? table.id : "id";
  // A ticked row stays ticked when a filter hides it, and the bar counts it,
  // so the selection export reads the whole data and not only the shown rows.
  const selectedRows = checked.size
    ? (table.data ?? table._filteredData ?? [])
        .filter(isRow)
        .filter((row) => checked.has(String(row[idKey])))
        .slice(0, EXPORT_ROW_LIMIT)
        .map(toCells)
    : [];
  return {
    columns: columns.map((column) => column.name),
    rows: source.map(toCells),
    ...(selectedRows.length ? { selectedRows } : {}),
    ...(shown.length > EXPORT_ROW_LIMIT ? { totalRows: shown.length } : {}),
  };
};

const findTables = (root: Element | ShadowRoot): TableLike[] => {
  const found: TableLike[] = [];
  const visit = (node: Element | ShadowRoot) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === "ha-data-table") {
        found.push(child as TableLike);
        continue;
      }
      visit(child);
      if (child.shadowRoot) {
        visit(child.shadowRoot);
      }
    }
  };
  visit(root);
  return found;
};

/** Collects what a page shows now. `skip` leaves out the page's own tools. */
export const collectPageExport = (
  root: HTMLElement,
  title: string
): PageExport => {
  const tables = [
    ...(root.shadowRoot ? findTables(root.shadowRoot) : []),
    ...findTables(root),
  ]
    .map(readDataTable)
    .filter((table): table is ExportTable => !!table);
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const pad = (value: number) => String(Math.abs(value)).padStart(2, "0");
  const local = new Date(now.getTime() + offset * 60000)
    .toISOString()
    .slice(0, 19);
  return {
    title,
    url: window.location.pathname,
    lang: document.documentElement.lang || undefined,
    exportedAt: `${local}${offset < 0 ? "-" : "+"}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`,
    text: collectReadableText(root),
    tables,
  };
};

// A cell that starts with one of these could be run as a formula when the
// file is opened in a spreadsheet, so it is made plain text with a quote.
// A plain number such as -5 or +1.5e3 stays a number.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

const needsQuote = (value: string): boolean =>
  /^[=@\t\r]/.test(value) || (/^[+-]/.test(value) && !PLAIN_NUMBER.test(value));

const csvCell = (value: string): string => {
  const safe = needsQuote(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** How many rows are ticked in all the tables of a page. */
export const selectedRowCount = (page: PageExport): number =>
  page.tables.reduce(
    (total, table) => total + (table.selectedRows?.length ?? 0),
    0
  );

/**
 * The page with only the ticked rows of its tables. A table with no ticked
 * row is left out, and the text of the page is left out too.
 */
export const selectionOnly = (page: PageExport): PageExport => ({
  ...page,
  text: [],
  tables: page.tables
    .filter((table) => table.selectedRows?.length)
    .map((table) => ({
      columns: table.columns,
      rows: table.selectedRows!,
      selectedRows: table.selectedRows,
    })),
});

/** One table as CSV: UTF-8, CRLF line ends, a header row. */
export const toCsv = (table: ExportTable): string =>
  [table.columns, ...table.rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

/** One table as tab separated values: tabs and line breaks become spaces. */
export const toTsv = (table: ExportTable): string => {
  const cell = (value: string) => {
    const plain = value.replace(/[\t\r\n]+/g, " ");
    return needsQuote(plain) ? `'${plain}` : plain;
  };
  return [table.columns, ...table.rows]
    .map((row) => row.map(cell).join("\t"))
    .join("\r\n");
};

/**
 * A cell as plain Markdown text: the characters that would start a link, an
 * image, markup, emphasis or HTML are escaped, so a value stays text.
 */
export const markdownCell = (value: string): string =>
  value
    .replace(/[\\|[\]<>`*_~!]/g, (char) => `\\${char}`)
    .replace(/\s*\n\s*/g, " ");

/** The line that tells a reader a table was cut at the row limit. */
export const rowLimitNotice = (table: ExportTable): string | undefined =>
  table.totalRows !== undefined && table.totalRows > table.rows.length
    ? `Only the first ${table.rows.length} of ${table.totalRows} rows are included.`
    : undefined;

/** Names for the columns that differ even when two titles are the same. */
export const uniqueColumnNames = (columns: string[]): string[] => {
  const used = new Set<string>();
  return columns.map((name) => {
    let candidate = name;
    for (let count = 2; used.has(candidate); count++) {
      candidate = `${name} (${count})`;
    }
    used.add(candidate);
    return candidate;
  });
};

const htmlLang = (value: string | undefined): string =>
  value && /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8}){0,4}$/.test(value) ? value : "en";

export const toMarkdown = (page: PageExport): string => {
  const parts = [`# ${page.title}`, "", `${page.url}, ${page.exportedAt}`, ""];
  page.tables.forEach((table) => {
    parts.push(`| ${table.columns.map(markdownCell).join(" | ")} |`);
    parts.push(`| ${table.columns.map(() => "---").join(" | ")} |`);
    table.rows.forEach((row) =>
      parts.push(`| ${row.map(markdownCell).join(" | ")} |`)
    );
    parts.push("");
    const notice = rowLimitNotice(table);
    if (notice) {
      parts.push(notice, "");
    }
  });
  if (!page.tables.length) {
    parts.push(...page.text, "");
  }
  return parts.join("\n");
};

export const toText = (page: PageExport): string =>
  [
    page.title,
    `${page.url}, ${page.exportedAt}`,
    "",
    ...page.text,
    ...page.tables.flatMap((table) => rowLimitNotice(table) ?? []),
  ].join("\n");

export const toJson = (page: PageExport): string =>
  JSON.stringify(
    {
      title: page.title,
      url: page.url,
      exported_at: page.exportedAt,
      tables: page.tables.map((table) => {
        const names = uniqueColumnNames(table.columns);
        return {
          columns: names,
          rows: table.rows.map((row) =>
            Object.fromEntries(names.map((name, index) => [name, row[index]]))
          ),
          ...(table.totalRows !== undefined
            ? { total_rows: table.totalRows }
            : {}),
        };
      }),
      text: page.text,
    },
    null,
    2
  );

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A plain document that opens anywhere and prints well. */
export const toHtml = (page: PageExport): string => {
  const tables = page.tables
    .map(
      (table) =>
        `<table><thead><tr>${table.columns
          .map((column) => `<th>${escapeHtml(column)}</th>`)
          .join("")}</tr></thead><tbody>${table.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
          )
          .join("")}</tbody></table>${
          rowLimitNotice(table)
            ? `<p><small>${escapeHtml(rowLimitNotice(table)!)}</small></p>`
            : ""
        }`
    )
    .join("\n");
  const text = page.tables.length
    ? ""
    : page.text.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
  return `<!doctype html>
<html lang="${htmlLang(page.lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(page.title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:32px;color:#1b1b1f}table{border-collapse:collapse;width:100%}th,td{border:1px solid #c4c6d0;padding:6px 10px;text-align:left;vertical-align:top}th{background:#eef1f8}small{color:#44474f}</style>
</head>
<body>
<h1>${escapeHtml(page.title)}</h1>
<p><small>${escapeHtml(page.url)}, ${escapeHtml(page.exportedAt)}</small></p>
${tables}
${text}
</body>
</html>
`;
};

export const exportContent = (
  fullPage: PageExport,
  format: ExportFormat,
  tableIndex = 0,
  onlySelection = false
): { content: string; mime: string; extension: string } => {
  const page = onlySelection ? selectionOnly(fullPage) : fullPage;
  switch (format) {
    case "tsv":
      return {
        content: page.tables[tableIndex] ? toTsv(page.tables[tableIndex]) : "",
        mime: "text/tab-separated-values;charset=utf-8",
        extension: "tsv",
      };
    case "csv":
      return {
        content: page.tables[tableIndex] ? toCsv(page.tables[tableIndex]) : "",
        mime: "text/csv;charset=utf-8",
        extension: "csv",
      };
    case "json":
      return {
        content: toJson(page),
        mime: "application/json",
        extension: "json",
      };
    case "markdown":
      return {
        content: toMarkdown(page),
        mime: "text/markdown;charset=utf-8",
        extension: "md",
      };
    case "html":
      return {
        content: toHtml(page),
        mime: "text/html;charset=utf-8",
        extension: "html",
      };
    default:
      return {
        content: toText(page),
        mime: "text/plain;charset=utf-8",
        extension: "txt",
      };
  }
};

/** A file name made from the page title and the date. */
export const exportFileName = (page: PageExport, extension: string): string => {
  const slug =
    page.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page";
  return `${slug}-${page.exportedAt.slice(0, 10)}.${extension}`;
};
