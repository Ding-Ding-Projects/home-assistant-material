import { mdiUnfoldMoreHorizontal } from "@mdi/js";
import {
  css,
  html,
  LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state as litState,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { regexRanges, searchMatcher } from "../common/regex/filter";
import { parseAnsiSegments } from "../common/string/ansi-segments";
import { ansiStyles } from "../resources/ansi-styles";
import "./ha-button";
import "./ha-svg-icon";

const LINE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;

@customElement("ha-ansi-to-html")
export class HaAnsiToHtml extends LitElement {
  @property() public content!: string;

  @property({ type: Boolean, attribute: "wrap-disabled" }) public wrapDisabled =
    false;

  // Lines to show before and after each line that matches the filter.
  @property({ type: Number, attribute: "context-lines" }) public contextLines =
    0;

  // Text for the button that shows a run of hidden lines between matches.
  @property({ attribute: false }) public expandLabel?: (
    count: number
  ) => string;

  @query("pre") private _pre?: HTMLPreElement;

  @queryAll("div") private _divs!: NodeListOf<HTMLDivElement>;

  @litState() private _filter = "";

  private _highlight?: Highlight;

  // Hidden lines the user chose to show while a filter is set.
  private _expandedLines = new WeakSet<HTMLDivElement>();

  // The hidden lines each expand row shows when clicked.
  private _expandGaps = new WeakMap<HTMLElement, HTMLDivElement[]>();

  public get hasLines(): boolean {
    return !!this._pre?.childElementCount;
  }

  protected render(): TemplateResult {
    return html`<pre class=${classMap({ wrap: !this.wrapDisabled })}></pre>`;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearHighlight();
  }

  protected firstUpdated(_changedProperties: PropertyValues<this>): void {
    super.firstUpdated(_changedProperties);

    // handle initial content
    if (this.content) {
      this.parseTextToColoredPre(this.content);
    }
  }

  static styles = [
    ansiStyles,
    css`
      pre {
        margin: 0;
      }
      pre.wrap {
        white-space: pre-wrap;
        overflow-wrap: break-word;
      }
      .context {
        color: var(--secondary-text-color);
      }
      .expand {
        display: block;
        margin: var(--ha-space-1) 0;
        font-family: var(--ha-font-family-body);
        white-space: normal;
      }
      ::highlight(search-results) {
        background-color: var(--ha-color-fill-primary-normal-resting);
      }
    `,
  ];

  /**
   * add new lines to the log
   * @param lines log lines
   * @param top should the new lines be added to the top of the log
   */
  public parseLinesToColoredPre(lines: string[], top = false) {
    for (const line of lines) {
      this._addLine(line, top);
    }

    // Filter once all lines are added, keeping the hidden lines already shown
    if (this._filter) {
      this.filterLines(this._filter);
    }
  }

  /**
   * Add a single line to the log
   * @param line log line
   * @param top should the new line be added to the top of the log
   */
  public parseLineToColoredPre(line, top = false) {
    this.parseLinesToColoredPre([line], top);
  }

  private _addLine(line: string, top: boolean) {
    const lineDiv = document.createElement("div");

    parseAnsiSegments(line).forEach((segment) => {
      const span = document.createElement("span");
      segment.classes.forEach((name) => span.classList.add(name));
      span.appendChild(document.createTextNode(segment.text));
      lineDiv.appendChild(span);
    });

    if (top) {
      this._pre?.prepend(lineDiv);
      lineDiv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
    } else {
      this._pre?.appendChild(lineDiv);
    }
  }

  public parseTextToColoredPre(text) {
    this.parseLinesToColoredPre(text.split("\n"));
  }

  /**
   * Filter lines based on a search string, lines and search string will be converted to lowercase
   * @param filter the search string
   * @returns true if there are lines to display
   */
  filterLines(filter: string): boolean {
    if (filter !== this._filter) {
      this._expandedLines = new WeakSet();
    }
    this._filter = filter;
    const lines = this._divs;
    let numberOfFoundLines = 0;
    if (!filter) {
      lines.forEach((line) => {
        line.style.display = "";
        line.classList.remove("context");
      });
      numberOfFoundLines = lines.length;
      this._clearHighlight();
    } else {
      const highlightRanges: Range[] = [];

      const lineList = Array.from(lines);

      // Plain text, or a regular expression written as /pattern/flags.
      const lineMatches = searchMatcher(filter);
      const matches = lineList.map((line) =>
        line.textContent ? lineMatches(line.textContent) : false
      );

      // A line without a timestamp continues the entry above it, such as a
      // build's output, so a matching entry shows all of its lines.
      let entryStart = -1;

      const entryOf = lineList.map((line, lineIndex) => {
        if (LINE_TIMESTAMP.test(line.textContent ?? "")) {
          entryStart = lineIndex;
        }

        return entryStart === -1 ? lineIndex : entryStart;
      });

      const matchedEntries = new Set(
        entryOf.filter((_entry, lineIndex) => matches[lineIndex])
      );

      const inMatch = entryOf.map(
        (entry, lineIndex) =>
          matches[lineIndex] ||
          (this.contextLines > 0 && matchedEntries.has(entry))
      );

      // Like a diff, also show the lines around each match.
      const visible = inMatch.map(
        (_match, lineIndex) =>
          this._expandedLines.has(lineList[lineIndex]) ||
          inMatch
            .slice(
              Math.max(0, lineIndex - this.contextLines),
              lineIndex + this.contextLines + 1
            )
            .some(Boolean)
      );

      // A button in place of a single hidden line takes as much room as the
      // line, so show the line instead. Buttons only show around matches.
      if (this.contextLines > 0 && matchedEntries.size) {
        visible.forEach((shown, lineIndex) => {
          if (
            !shown &&
            visible[lineIndex - 1] !== false &&
            visible[lineIndex + 1] !== false
          ) {
            visible[lineIndex] = true;
          }
        });
      }

      lineList.forEach((line, lineIndex) => {
        line.classList.toggle(
          "context",
          visible[lineIndex] && !inMatch[lineIndex]
        );

        if (!visible[lineIndex]) {
          line.style.display = "none";
        } else if (!matches[lineIndex]) {
          line.style.display = "";
        } else {
          line.style.display = "";
          numberOfFoundLines++;
          if (CSS.highlights && line.firstChild !== null && line.textContent) {
            const spansOfLine = line.querySelectorAll("span");
            spansOfLine.forEach((span) => {
              let spans = regexRanges(filter, span.textContent);
              if (!spans) {
                spans = [];
                const text = span.textContent.toLowerCase();
                let startPos = 0;
                while (startPos < text.length) {
                  const index = text.indexOf(filter.toLowerCase(), startPos);
                  if (index === -1) break;
                  spans.push([index, index + filter.length]);
                  startPos = index + filter.length;
                }
              }

              spans.forEach(([start, end]) => {
                const range = new Range();
                range.setStart(span.firstChild!, start);
                range.setEnd(span.firstChild!, end);
                highlightRanges.push(range);
              });
            });
          }
        }
      });
      if (CSS.highlights) {
        this._highlight = new Highlight(...highlightRanges);
        CSS.highlights.set("search-results", this._highlight);
      }

      if (this.contextLines && numberOfFoundLines) {
        this._updateExpandButtons(lineList, visible);

        return true;
      }
    }

    this._updateExpandButtons([], []);

    return !!numberOfFoundLines;
  }

  private _clearHighlight() {
    if (
      this._highlight &&
      CSS.highlights?.get("search-results") === this._highlight
    ) {
      CSS.highlights.delete("search-results");
    }
    this._highlight = undefined;
  }

  // Filtering runs again for every new log line, so rows for unchanged gaps
  // are kept rather than recreated, which would drop keyboard focus.
  private _updateExpandButtons(lines: HTMLDivElement[], visible: boolean[]) {
    const rows = new Map<Element | null, HTMLSpanElement>();
    this._pre?.querySelectorAll(".expand").forEach((row) => {
      if (row instanceof HTMLSpanElement) {
        rows.set(row.nextElementSibling, row);
      }
    });

    let hidden: HTMLDivElement[] = [];

    lines.forEach((line, lineIndex) => {
      if (!visible[lineIndex]) {
        hidden.push(line);
      }

      if (
        hidden.length &&
        (visible[lineIndex] || lineIndex === lines.length - 1)
      ) {
        const label = this.expandLabel?.(hidden.length) ?? `${hidden.length}`;
        let row = rows.get(hidden[0]);

        if (row) {
          rows.delete(hidden[0]);
          const text = row.querySelector("ha-button")?.lastChild;

          if (text instanceof Text && text.data !== label) {
            text.data = label;
          }
        } else {
          row = this._createExpandRow(label);
          hidden[0].before(row);
        }

        this._expandGaps.set(row, hidden);
        hidden = [];
      }
    });

    rows.forEach((row) => row.remove());
  }

  private _createExpandRow(label: string): HTMLSpanElement {
    const row = document.createElement("span");
    row.className = "expand";
    const button = document.createElement("ha-button");
    button.setAttribute("appearance", "filled");
    button.setAttribute("variant", "neutral");
    button.setAttribute("size", "s");
    const icon = document.createElement("ha-svg-icon");
    icon.slot = "start";
    icon.path = mdiUnfoldMoreHorizontal;
    button.append(icon, label);
    button.addEventListener("click", () => {
      const gap = this._expandGaps.get(row) ?? [];
      const hadFocus = row.matches(":focus-within");
      gap.forEach((hiddenLine) => this._expandedLines.add(hiddenLine));
      this.filterLines(this._filter);

      // The row is gone once its lines show, so keep focus on the first of them.
      if (hadFocus && gap[0]) {
        gap[0].tabIndex = -1;
        gap[0].focus({ preventScroll: true });
      }
    });
    row.append(button);

    return row;
  }

  public trimLines(maxLines: number) {
    const lines = this._divs;

    if (lines.length <= maxLines) {
      return;
    }

    Array.from(lines)
      .slice(0, lines.length - maxLines)
      .forEach((line) => line.remove());

    if (this._filter) {
      this.filterLines(this._filter);
    }
  }

  public clear() {
    if (this._pre) {
      this._pre.innerHTML = "";
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ansi-to-html": HaAnsiToHtml;
  }
}
