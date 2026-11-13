import type { ContextType } from "@lit/context";
import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiCheckCircleOutline,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiContentCopy,
  mdiContentSave,
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiMenuDown,
  mdiPlay,
  mdiPlus,
  mdiTune,
  mdiUpload,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { visuallyHiddenFileInputStyles } from "../../resources/visually-hidden-file-input";
import { consume } from "../../common/decorators/consume";
import { getStorage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import type { Capability } from "../../common/regex/capabilities";
import {
  getCapabilities,
  getEngineInfo,
} from "../../common/regex/capabilities";
import type { CodeTarget } from "../../common/regex/codegen";
import { CODE_TARGETS, generateCode } from "../../common/regex/codegen";
import type { RegexToken } from "../../common/regex/explain";
import { mergeLiterals, tokenizeRegex } from "../../common/regex/explain";
import type { RegexFlag } from "../../common/regex/query";
import {
  ALL_FLAGS,
  compileRegex,
  escapeLiteral,
  formatRegexQuery,
  parseSearchQuery,
  REGEX_LIMITS,
  SUPPORTED_FLAGS,
} from "../../common/regex/query";
import type { RiskFinding } from "../../common/regex/risk";
import { analyzeRisk } from "../../common/regex/risk";
import type { RegexOutcome } from "../../common/regex/runner";
import {
  cancelRegexEvaluations,
  evaluateRegex,
} from "../../common/regex/runner";
import type { LocalizeKeys } from "../../common/translations/localize";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { internationalizationContext } from "../../data/context";
import { fileDownload } from "../../util/file_download";
import "../ha-select";
import type { HaSelect, HaSelectSelectEvent } from "../ha-select";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";

declare global {
  interface HASSDomEvents {
    /** The query to put in the search field: plain text or /pattern/flags. */
    "regex-apply": { value: string };
  }
}

/** Most items of the field's list that are tested for the list preview. */
const MAX_LIST_ITEMS = 500;

/** Most matching items the list preview names. */
const MAX_LIST_SHOWN = 12;

const LIBRARY_STORAGE_KEY = "regexLibrary";

const TABS = [
  "build",
  "test",
  "replace",
  "cases",
  "performance",
  "code",
  "library",
  "engine",
] as const;

type WorkbenchTab = (typeof TABS)[number];

/** Sections that stay in view on a phone; the rest sit under More. */
const PRIMARY_TABS: readonly WorkbenchTab[] = ["build", "test", "replace"];

const MORE_TABS: readonly WorkbenchTab[] = TABS.filter(
  (tab) => !PRIMARY_TABS.includes(tab)
);

/** Below this window width the workbench takes the whole visible screen. */
const NARROW_WIDTH = 700;

/** A visible-screen shrink larger than this is taken as the keyboard. */
const KEYBOARD_SHRINK = 150;

type WorkbenchMenu = "" | "flags" | "tabs" | "footer";

interface SavedPattern {
  name: string;
  pattern: string;
  flags: string;
  cases?: TestCase[];
}

interface TestCase {
  text: string;
  expect: boolean;
}

interface Block {
  id: string;
  /** Text put in at the cursor. */
  insert?: string;
  /** Text put around the selection. */
  wrap?: [string, string];
  /** A flag the block needs. */
  flag?: RegexFlag;
}

const BLOCK_GROUPS: { id: string; blocks: Block[] }[] = [
  {
    id: "characters",
    blocks: [
      { id: "any", insert: "." },
      { id: "digit", insert: "\\d" },
      { id: "not_digit", insert: "\\D" },
      { id: "word", insert: "\\w" },
      { id: "not_word", insert: "\\W" },
      { id: "space", insert: "\\s" },
      { id: "not_space", insert: "\\S" },
      { id: "tab", insert: "\\t" },
      { id: "newline", insert: "\\n" },
      { id: "letter", insert: "\\p{L}", flag: "u" },
    ],
  },
  {
    id: "sets",
    blocks: [
      { id: "set", wrap: ["[", "]"] },
      { id: "not_set", wrap: ["[^", "]"] },
      { id: "range", insert: "[a-z]" },
    ],
  },
  {
    id: "anchors",
    blocks: [
      { id: "start", insert: "^" },
      { id: "end", insert: "$" },
      { id: "boundary", insert: "\\b" },
      { id: "not_boundary", insert: "\\B" },
    ],
  },
  {
    id: "groups",
    blocks: [
      { id: "capture", wrap: ["(", ")"] },
      { id: "named", wrap: ["(?<name>", ")"] },
      { id: "noncapture", wrap: ["(?:", ")"] },
      { id: "or", insert: "|" },
    ],
  },
  {
    id: "look",
    blocks: [
      { id: "ahead", wrap: ["(?=", ")"] },
      { id: "not_ahead", wrap: ["(?!", ")"] },
      { id: "behind", wrap: ["(?<=", ")"] },
      { id: "not_behind", wrap: ["(?<!", ")"] },
    ],
  },
  {
    id: "quantifiers",
    blocks: [
      { id: "optional", insert: "?" },
      { id: "star", insert: "*" },
      { id: "plus", insert: "+" },
      { id: "exact", insert: "{3}" },
      { id: "between", insert: "{2,5}" },
      { id: "at_least", insert: "{2,}" },
      { id: "lazy", insert: "?" },
    ],
  },
  {
    id: "references",
    blocks: [
      { id: "back", insert: "\\1" },
      { id: "named_back", insert: "\\k<name>" },
    ],
  },
];

const TOKEN_CLASS: Partial<Record<RegexToken["kind"], string>> = {
  group_capture: "t-group",
  group_named: "t-group",
  group_noncapture: "t-group",
  group_modifiers: "t-group",
  group_close: "t-group",
  lookahead: "t-look",
  negative_lookahead: "t-look",
  lookbehind: "t-look",
  negative_lookbehind: "t-look",
  alternation: "t-group",
  quantifier: "t-quant",
  class: "t-class",
  digit: "t-class",
  not_digit: "t-class",
  word: "t-class",
  not_word: "t-class",
  space: "t-class",
  not_space: "t-class",
  property: "t-class",
  not_property: "t-class",
  any: "t-class",
  start: "t-anchor",
  end: "t-anchor",
  word_boundary: "t-anchor",
  not_word_boundary: "t-anchor",
  backreference: "t-ref",
  named_backreference: "t-ref",
  escaped_literal: "t-escape",
  control: "t-escape",
  hex: "t-escape",
  unicode: "t-escape",
  control_letter: "t-escape",
  unsupported: "t-unsupported",
};

const BENCHMARK_ITERATIONS = 20;
const BENCHMARK_LIMIT_MS = 5000;
const GROWTH_FACTORS = [1, 2, 4, 8, 16];
const GROWTH_LIMIT_MS = 2000;

interface GrowthRow {
  size: number;
  time?: number;
  ratio?: number;
  timedOut?: boolean;
}

const round = (value: number): string =>
  value < 10
    ? value.toFixed(2)
    : value < 100
      ? value.toFixed(1)
      : String(Math.round(value));

/**
 * @element ha-regex-workbench
 *
 * @summary
 * The pattern workbench that opens beside a search field. It keeps plain
 * text as the default and makes a regular expression an explicit choice. It
 * builds a pattern from blocks or by typing, explains it piece by piece,
 * tests it on sample text, previews replace and split, checks test cases,
 * measures speed, writes the pattern as code for other flavours, and keeps a
 * library of saved patterns.
 *
 * Each search field has its own workbench, so nothing is shared between
 * fields except the library the person saves on purpose.
 *
 * @fires regex-apply - The query to put in the field.
 */
@customElement("ha-regex-workbench")
export class HaRegexWorkbench extends LitElement {
  /** The visible name of the search field this workbench belongs to. */
  @property({ attribute: "field-label" }) public fieldLabel = "";

  /** Items of the list the field filters, offered as test text. */
  @property({ attribute: false }) public samples?: string[];

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _mode: "text" | "regex" = "text";

  @state() private _text = "";

  @state() private _pattern = "";

  @state() private _flags = "";

  @state() private _sample = "";

  @state() private _replacement = "";

  @state() private _cases: TestCase[] = [];

  @state() private _tab: WorkbenchTab = "build";

  @state() private _outcome?: RegexOutcome<"run">;

  @state() private _caseOutcome?: RegexOutcome<"cases">;

  /** Which of the list's own items the pattern matches, one by one. */
  @state() private _listOutcome?: RegexOutcome<"cases">;

  @state() private _selected = 0;

  @state() private _benchmark?: RegexOutcome<"time">;

  @state() private _growth?: GrowthRow[];

  @state() private _busy = false;

  @state() private _target: CodeTarget = "javascript";

  @state() private _library: SavedPattern[] = [];

  @state() private _history: string[] = [];

  @state() private _literal = "";

  @state() private _saveName = "";

  @state() private _notice = "";

  @state() private _placement: Record<string, string> = {};

  /** True below 700 px: flags in a sheet, three tabs and More. */
  @state() private _narrow = window.innerWidth < NARROW_WIDTH;

  /** True while the on-screen keyboard covers part of a phone. */
  @state() private _keyboard = false;

  /** Which popup menu or sheet is open inside the panel. */
  @state() private _menu: WorkbenchMenu = "";

  @query("#panel") private _panel?: HTMLElement;

  @query("#pattern") private _patternInput?: HTMLTextAreaElement;

  @query("#plain") private _plainInput?: HaInput;

  @query("#import") private _importInput?: HTMLInputElement;

  private _anchor?: HTMLElement;

  private _timer?: number;

  private _runId = 0;

  private _capabilities?: Capability[];

  /** Opens the workbench beside `anchor`, starting from the field's text. */
  public show(anchor: HTMLElement, value: string) {
    this._anchor = anchor;
    const parsed = parseSearchQuery(value);
    if (parsed.mode === "regex") {
      this._mode = "regex";
      this._pattern = parsed.pattern;
      this._flags = parsed.flags;
    } else if (value !== this._text || this._mode === "text") {
      this._mode = "text";
      this._text = value;
    }
    if (!this._sample && this.samples?.length) {
      this._useSamples();
    }
    this._library = this._readLibrary();
    this._place();
    this.updateComplete.then(() => {
      if (this._panel && !this._panel.matches(":popover-open")) {
        this._panel.showPopover();
      }
      (this._mode === "regex" ? this._patternInput : this._plainInput)?.focus();
    });
  }

  public close() {
    if (this._panel?.matches(":popover-open")) {
      this._panel.hidePopover();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
    window.removeEventListener("resize", this._place);
    window.visualViewport?.removeEventListener("resize", this._place);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return (
      this._i18n?.localize(`ui.regex.${key}` as LocalizeKeys, values) || key
    );
  }

  // The panel opens under the field when there is room, and over it
  // otherwise, and never leaves the window.
  private _place = () => {
    const narrow = window.innerWidth < NARROW_WIDTH;
    if (narrow !== this._narrow) {
      this._narrow = narrow;
      this._menu = "";
    }
    const viewport = window.visualViewport;
    this._keyboard =
      narrow &&
      !!viewport &&
      window.innerHeight - viewport.height > KEYBOARD_SHRINK;
    if (!this._anchor) {
      return;
    }
    const rect = this._anchor.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(960, window.innerWidth - margin * 2);
    // On a phone there is no useful room beside the field: the panel takes
    // the visible screen, which shrinks while the keyboard is up.
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    if (narrow || visibleHeight < 600) {
      this._placement = {
        width: `${width}px`,
        left: `${margin}px`,
        top: `${(window.visualViewport?.offsetTop ?? 0) + margin}px`,
        bottom: "auto",
        "max-height": `${Math.max(240, visibleHeight - margin * 2)}px`,
      };
      return;
    }
    const below = window.innerHeight - rect.bottom - margin * 2;
    const above = rect.top - margin * 2;
    const useBelow = below >= 420 || below >= above;
    const maxHeight = Math.max(280, useBelow ? below : above);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin)
    );
    this._placement = {
      width: `${width}px`,
      left: `${left}px`,
      "max-height": `${Math.min(maxHeight, window.innerHeight - margin * 2)}px`,
      ...(useBelow
        ? { top: `${rect.bottom + margin}px`, bottom: "auto" }
        : {
            bottom: `${window.innerHeight - rect.top + margin}px`,
            top: "auto",
          }),
    };
  };

  protected willUpdate(changed: PropertyValues) {
    if (
      changed.has("_pattern") ||
      changed.has("_flags") ||
      changed.has("_sample") ||
      changed.has("_replacement") ||
      changed.has("_cases") ||
      changed.has("_mode")
    ) {
      this._benchmark = undefined;
      this._growth = undefined;
      this._schedule();
    }
  }

  private _schedule() {
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => this._evaluate(), 200);
  }

  private async _evaluate() {
    if (this._mode !== "regex" || !this._pattern) {
      this._outcome = undefined;
      this._caseOutcome = undefined;
      this._listOutcome = undefined;
      return;
    }
    const check = compileRegex(this._pattern, this._flags);
    if (!check.regex) {
      this._outcome = undefined;
      this._caseOutcome = undefined;
      this._listOutcome = undefined;
      return;
    }
    const runId = ++this._runId;
    cancelRegexEvaluations();
    const outcome = await evaluateRegex({
      type: "run",
      pattern: this._pattern,
      flags: this._flags,
      sample: this._sample,
      maxMatches: REGEX_LIMITS.matches,
      replacement: this._replacement,
      split: true,
    });
    if (runId !== this._runId || outcome.status === "cancelled") {
      return;
    }
    this._outcome = outcome;
    if (
      outcome.status === "ok" &&
      this._selected >= outcome.result.matches.length
    ) {
      this._selected = 0;
    }
    if (outcome.status === "ok" && this.samples?.length) {
      const listOutcome = await evaluateRegex({
        type: "cases",
        pattern: this._pattern,
        flags: this._flags,
        cases: this.samples.slice(0, MAX_LIST_ITEMS),
      });
      if (runId !== this._runId || listOutcome.status === "cancelled") {
        return;
      }
      this._listOutcome = listOutcome;
    } else {
      this._listOutcome = undefined;
    }
    if (!this._cases.length || outcome.status !== "ok") {
      this._caseOutcome = undefined;
      return;
    }
    const caseOutcome = await evaluateRegex({
      type: "cases",
      pattern: this._pattern,
      flags: this._flags,
      cases: this._cases.map((item) => item.text),
    });
    if (runId === this._runId && caseOutcome.status !== "cancelled") {
      this._caseOutcome = caseOutcome;
    }
  }

  private get _tokens() {
    return tokenizeRegex(this._pattern, this._flags);
  }

  protected render(): TemplateResult {
    const regex = this._mode === "regex";
    const narrow = this._narrow;
    return html`
      <div
        id="panel"
        class=${classMap({ narrow })}
        popover
        role="dialog"
        aria-label=${this._l("title")}
        style=${styleMap(this._placement)}
        @toggle=${this._toggled}
        @keydown=${this._panelKeydown}
      >
        <div class="top">
          <div class="heading">
            <h2>${this._l("title")}</h2>
            ${
              this.fieldLabel
                ? html`<p class="sub">
                    ${this._l("opened_from", { field: this.fieldLabel })}
                  </p>`
                : nothing
            }
          </div>
          ${narrow ? nothing : this._renderModeSwitch()}
          <button
            class="icon"
            aria-label=${this._l("actions.cancel")}
            title=${this._l("actions.cancel")}
            @click=${this.close}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </div>
        ${
          narrow
            ? html`<div class="modebar">
                ${this._renderModeSwitch()}
                ${regex ? this._renderFlagsChip() : nothing}
              </div>`
            : nothing
        }
        ${regex ? this._renderRegex() : this._renderPlain()}
        ${narrow && this._keyboard ? nothing : this._renderFooter()}
        ${this._renderOverlay()}
      </div>
    `;
  }

  private _renderModeSwitch() {
    const regex = this._mode === "regex";
    return html`
      <div
        class="segments"
        role="radiogroup"
        aria-label=${this._l("mode_label")}
      >
        <button
          role="radio"
          aria-checked=${regex ? "false" : "true"}
          aria-label=${this._l("mode_text")}
          .mode=${"text"}
          @click=${this._modeChanged}
        >
          ${this._l("mode_text_short")}
        </button>
        <button
          role="radio"
          aria-checked=${regex ? "true" : "false"}
          aria-label=${this._l("mode_regex")}
          .mode=${"regex"}
          @click=${this._modeChanged}
        >
          ${this._l("mode_regex_short")}
        </button>
      </div>
    `;
  }

  /** The eight flags on a phone: one chip that shows the letters that are on. */
  private _renderFlagsChip() {
    const open = this._menu === "flags";
    return html`
      <button
        id="flags-chip"
        class="flags-chip"
        aria-haspopup="dialog"
        aria-expanded=${open ? "true" : "false"}
        aria-label=${`${this._l("flags_label")}: ${
          this._flags || this._l("flags_none")
        }`}
        @click=${this._toggleFlagsSheet}
      >
        <ha-svg-icon .path=${mdiTune}></ha-svg-icon>
        <code>${this._flags || this._l("flags_none")}</code>
        <ha-svg-icon .path=${mdiMenuDown}></ha-svg-icon>
      </button>
    `;
  }

  private _renderFooter() {
    const regex = this._mode === "regex";
    const narrow = this._narrow;
    return html`
      <div class="footer">
        <span class="origin" role="status" aria-live="polite">
          ${this._notice || this._l("footer_note")}
        </span>
        ${
          regex && narrow
            ? html`
                <div class="more-wrap">
                  <button
                    id="footer-more"
                    class="icon"
                    aria-haspopup="menu"
                    aria-expanded=${this._menu === "footer" ? "true" : "false"}
                    aria-label=${this._l("more_actions")}
                    title=${this._l("more_actions")}
                    @click=${this._toggleFooterMenu}
                  >
                    <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
                  </button>
                  ${
                    this._menu === "footer"
                      ? html`
                          <div
                            class="menu up"
                            role="menu"
                            @keydown=${this._menuKeydown}
                          >
                            <button
                              role="menuitem"
                              @click=${this._menuCopyPattern}
                            >
                              <ha-svg-icon
                                .path=${mdiContentCopy}
                              ></ha-svg-icon>
                              ${this._l("actions.copy")}
                            </button>
                            <button role="menuitem" @click=${this._menuExport}>
                              <ha-svg-icon .path=${mdiDownload}></ha-svg-icon>
                              ${this._l("actions.export")}
                            </button>
                          </div>
                        `
                      : nothing
                  }
                </div>
                <span class="spacer"></span>
              `
            : regex
              ? html`
                  <button class="text" @click=${this._copyPattern}>
                    <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
                    ${this._l("actions.copy")}
                  </button>
                  <button class="text" @click=${this._export}>
                    <ha-svg-icon .path=${mdiDownload}></ha-svg-icon>
                    ${this._l("actions.export")}
                  </button>
                `
              : nothing
        }
        <button class=${narrow ? "text" : "outlined"} @click=${this.close}>
          ${this._l("actions.cancel")}
        </button>
        <button
          class="filled"
          ?disabled=${regex && !this._usable}
          @click=${this._apply}
        >
          ${
            regex
              ? this._l(narrow ? "actions.use_short" : "actions.use")
              : this._l("actions.use_text")
          }
        </button>
      </div>
    `;
  }

  /** The popups that sit over the panel: the flags sheet and the menu scrim. */
  private _renderOverlay() {
    if (!this._menu) {
      return nothing;
    }
    if (this._menu !== "flags") {
      return html`<div class="scrim clear" @click=${this._closeMenu}></div>`;
    }
    const unsupported = ALL_FLAGS.some(
      (flag) => !(SUPPORTED_FLAGS as string[]).includes(flag)
    );
    return html`
      <div class="scrim" @click=${this._closeMenu}></div>
      <div class="sheet" role="dialog" aria-label=${this._l("flags_label")}>
        <span class="handle" aria-hidden="true"></span>
        <div class="sheet-head">
          <h3>${this._l("flags_label")}</h3>
          <button class="text" @click=${this._closeMenu}>
            ${this._l("flags_done")}
          </button>
        </div>
        <div class="flag-rows">
          ${ALL_FLAGS.map((flag) => {
            const supported = (SUPPORTED_FLAGS as string[]).includes(flag);
            const on = this._flags.includes(flag);
            return html`
              <button
                class="flag-row"
                role="switch"
                aria-checked=${on ? "true" : "false"}
                ?disabled=${!supported}
                .flag=${flag}
                @click=${this._flagToggled}
              >
                <code>${flag}</code>
                <span class="flag-name">${this._l(`flag.${flag}`)}</span>
                <span class="track" aria-hidden="true">
                  <span class="thumb"></span>
                </span>
              </button>
            `;
          })}
        </div>
        ${
          unsupported
            ? html`<p class="note">${this._l("flags_sheet_note")}</p>`
            : nothing
        }
      </div>
    `;
  }

  private get _usable(): boolean {
    return (
      this._pattern.length > 0 &&
      compileRegex(this._pattern, this._flags).regex !== undefined
    );
  }

  private _renderPlain() {
    return html`
      <div class="body plain">
        <div class="field">
          <ha-input
            id="plain"
            appearance="outlined"
            type="text"
            .label=${this._l("text_label")}
            autocomplete="off"
            spellcheck="false"
            .value=${this._text}
            @input=${this._textChanged}
            @keydown=${this._applyOnEnter}
          ></ha-input>
        </div>
        <p class="note">${this._l("text_note")}</p>
        <div>
          <button class="tonal" @click=${this._makeRegex}>
            ${this._l("make_regex")}
          </button>
        </div>
      </div>
    `;
  }

  private _renderRegex() {
    return html`
      <div class="pattern-area">
        <label class="label" for="pattern">${this._l("pattern_label")}</label>
        <div class="editor">
          <pre
            aria-hidden="true"
          >${this._renderHighlightedPattern()}<br /></pre>
          <textarea
            id="pattern"
            rows="1"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength=${REGEX_LIMITS.pattern}
            aria-describedby="status"
            aria-invalid=${this._patternProblem ? "true" : "false"}
            .value=${this._pattern}
            @input=${this._patternChanged}
            @keydown=${this._applyOnEnter}
          ></textarea>
        </div>
        ${this._renderStatus()}
        ${this._narrow ? nothing : this._renderFlagChips()}
      </div>

      ${this._renderTabs()}

      <div
        class="body"
        id="tabpanel"
        role="tabpanel"
        aria-labelledby="tab-${this._tab}"
      >
        ${
          this._tab === "build"
            ? this._renderBuild()
            : this._tab === "test"
              ? this._renderTest()
              : this._tab === "replace"
                ? this._renderReplace()
                : this._tab === "cases"
                  ? this._renderCases()
                  : this._tab === "performance"
                    ? this._renderPerformance()
                    : this._tab === "code"
                      ? this._renderCode()
                      : this._tab === "library"
                        ? this._renderLibrary()
                        : this._renderEngine()
        }
      </div>
    `;
  }

  private get _patternProblem(): boolean {
    return (
      this._pattern.length > 0 &&
      compileRegex(this._pattern, this._flags).error !== undefined
    );
  }

  /** Where the first group problem starts, counted from character 1. */
  private _groupProblem():
    { kind: "unclosed" | "unopened"; position: number } | undefined {
    const { tokens } = this._tokens;
    const open: number[] = [];
    let offset = 0;
    for (const token of tokens) {
      if (token.kind === "group_close") {
        if (!open.length) {
          return { kind: "unopened", position: offset + 1 };
        }
        open.pop();
      } else if (token.text.startsWith("(") && !token.text.endsWith(")")) {
        open.push(offset);
      }
      offset += token.text.length;
    }
    return open.length
      ? { kind: "unclosed", position: open[open.length - 1] + 1 }
      : undefined;
  }

  /** The eight flags as chips with their letter and name; they wrap. */
  private _renderFlagChips() {
    return html`
      <div class="flags" role="group" aria-label=${this._l("flags_label")}>
        ${ALL_FLAGS.map((flag) => {
          const supported = (SUPPORTED_FLAGS as string[]).includes(flag);
          const on = this._flags.includes(flag);
          return html`
            <button
              class="chip"
              aria-pressed=${on ? "true" : "false"}
              ?disabled=${!supported}
              title=${
                supported
                  ? `${flag}: ${this._l(`flag.${flag}`)}`
                  : this._l("flag_unsupported")
              }
              .flag=${flag}
              @click=${this._flagToggled}
            >
              ${on ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>` : nothing}
              <code>${flag}</code> ${this._l(`flag.${flag}`)}
            </button>
          `;
        })}
      </div>
    `;
  }

  /**
   * The sections. Wide: all eight in one row that wraps. Phone: the first
   * three and More, which names the chosen section when it is one of the
   * rest.
   */
  private _renderTabs() {
    const narrow = this._narrow;
    const inMore = MORE_TABS.includes(this._tab);
    const visible = narrow ? PRIMARY_TABS : TABS;
    return html`
      <div class="tabs-wrap">
        <div
          class="tabs"
          role="tablist"
          aria-label=${this._l("tabs.label")}
          @keydown=${this._tabKeydown}
        >
          ${visible.map(
            (tab) => html`
              <button
                role="tab"
                id="tab-${tab}"
                aria-selected=${this._tab === tab ? "true" : "false"}
                aria-controls="tabpanel"
                tabindex=${this._tab === tab ? "0" : "-1"}
                .tab=${tab}
                @click=${this._tabChanged}
              >
                ${this._l(`tabs.${tab}`)}
              </button>
            `
          )}
          ${
            narrow
              ? html`
                  <button
                    role="tab"
                    id="tab-more"
                    class="more-tab"
                    aria-selected=${inMore ? "true" : "false"}
                    aria-controls="tabpanel"
                    aria-haspopup="menu"
                    aria-expanded=${this._menu === "tabs" ? "true" : "false"}
                    tabindex=${inMore ? "0" : "-1"}
                    @click=${this._toggleTabsMenu}
                  >
                    <span class="more-name">
                      ${inMore ? this._l(`tabs.${this._tab}`) : this._l("more")}
                    </span>
                    <ha-svg-icon .path=${mdiMenuDown}></ha-svg-icon>
                  </button>
                `
              : nothing
          }
        </div>
        ${
          narrow && this._menu === "tabs"
            ? html`
                <div
                  class="menu down"
                  role="menu"
                  aria-label=${this._l("more")}
                  @keydown=${this._menuKeydown}
                >
                  ${MORE_TABS.map(
                    (tab) => html`
                      <button
                        role="menuitemradio"
                        aria-checked=${this._tab === tab ? "true" : "false"}
                        .tab=${tab}
                        @click=${this._pickMoreTab}
                      >
                        ${this._l(`tabs.${tab}`)}
                      </button>
                    `
                  )}
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  private _renderHighlightedPattern() {
    return this._tokens.tokens.map(
      (token) =>
        html`<span class=${TOKEN_CLASS[token.kind] ?? "t-literal"}
          >${token.text}</span
        >`
    );
  }

  private _renderStatus() {
    let ok = false;
    let message: string;
    if (!this._pattern) {
      message = this._l("status.empty");
    } else {
      const check = compileRegex(this._pattern, this._flags);
      if (check.error === "too_long") {
        message = this._l("status.too_long", { limit: REGEX_LIMITS.pattern });
      } else if (check.error) {
        // Name the character where a group problem starts when it is one;
        // otherwise pass the engine's own words on.
        const group = this._groupProblem();
        message = group
          ? this._l(`status.${group.kind}_group`, { position: group.position })
          : this._l("status.invalid", {
              message: check.message ?? check.error,
            });
      } else if (this._outcome?.status === "timeout") {
        message = this._l("status.timeout", {
          limit: this._outcome.limitMs,
        });
      } else if (this._outcome?.status === "unavailable") {
        message = this._l("status.unavailable");
      } else {
        ok = true;
        message = this._l("status.valid");
      }
    }
    return html`
      <p
        id="status"
        class=${classMap({ status: true, ok, bad: !ok && !!this._pattern })}
        role="status"
        aria-live="polite"
      >
        ${
          this._pattern
            ? html`<ha-svg-icon
                .path=${ok ? mdiCheckCircleOutline : mdiAlertCircleOutline}
              ></ha-svg-icon>`
            : nothing
        }
        ${message}
      </p>
    `;
  }

  // ---- Build ----

  private _renderBuild() {
    return html`
      <div class="columns">
        <section aria-label=${this._l("build.blocks")}>
          <h3>${this._l("build.blocks")}</h3>
          <p class="note">${this._l("build.blocks_note")}</p>
          ${BLOCK_GROUPS.map(
            (group) => html`
              <div class="block-group">
                <span class="group-name"
                  >${this._l(`build.group.${group.id}`)}</span
                >
                <div class="blocks">
                  ${group.blocks.map(
                    (block) => html`
                      <button
                        class="chip"
                        .block=${block}
                        @click=${this._insertBlock}
                      >
                        ${this._l(`build.block.${block.id}`)}
                        <code
                          >${
                            block.insert ??
                            `${block.wrap![0]}…${block.wrap![1]}`
                          }</code
                        >
                      </button>
                    `
                  )}
                </div>
              </div>
            `
          )}
          <div class="literal">
            <div class="field">
              <ha-input
                appearance="outlined"
                type="text"
                .label=${this._l("build.literal_label")}
                autocomplete="off"
                spellcheck="false"
                .value=${this._literal}
                @input=${this._literalChanged}
                @keydown=${this._literalKeydown}
              ></ha-input>
            </div>
            <button
              class="tonal"
              ?disabled=${!this._literal}
              @click=${this._insertLiteral}
            >
              <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
              ${this._l("build.literal_add")}
            </button>
          </div>
        </section>
        <section aria-label=${this._l("build.reads_as")}>
          <h3>${this._l("build.reads_as")}</h3>
          ${this._renderExplanation()} ${this._renderRisk()}
        </section>
      </div>
    `;
  }

  private _describe(token: RegexToken, groupCount: number): string {
    switch (token.kind) {
      case "literal":
        return this._l("explain.literal", { text: token.text });
      case "any":
        return this._l(
          this._flags.includes("s") ? "explain.any_dotall" : "explain.any"
        );
      case "start":
        return this._l(
          this._flags.includes("m")
            ? "explain.start_multiline"
            : "explain.start"
        );
      case "end":
        return this._l(
          this._flags.includes("m") ? "explain.end_multiline" : "explain.end"
        );
      case "quantifier": {
        const { min, max } = token;
        const base =
          min === 0 && max === 1
            ? this._l("explain.quantifier_optional")
            : min === 0 && max === undefined
              ? this._l("explain.quantifier_star")
              : min === 1 && max === undefined
                ? this._l("explain.quantifier_plus")
                : max === undefined
                  ? this._l("explain.quantifier_at_least", { min: min! })
                  : min === max
                    ? this._l("explain.quantifier_exact", { min: min! })
                    : this._l("explain.quantifier_between", {
                        min: min!,
                        max,
                      });
        return token.lazy
          ? `${base}, ${this._l("explain.quantifier_lazy")}`
          : base;
      }
      case "backreference":
        return this._l(
          token.group! > groupCount
            ? "explain.backreference_missing"
            : "explain.backreference",
          { group: token.group! }
        );
      case "class":
        return this._l(
          token.negated ? "explain.class_negated" : "explain.class",
          { items: (token.items ?? []).map((item) => item.text).join("  ") }
        );
      case "unsupported":
        return this._l(`explain.unsupported.${token.reason}`);
      default:
        return this._l(`explain.${token.kind}`, {
          value: token.value ?? "",
          name: token.name ?? "",
          group: token.group ?? 0,
        });
    }
  }

  private _renderExplanation() {
    const { tokens, groupCount, unbalanced } = this._tokens;
    if (!tokens.length) {
      return html`<p class="note">${this._l("build.reads_empty")}</p>`;
    }
    return html`
      <ol class="explain">
        ${mergeLiterals(tokens).map(
          (token) => html`
            <li
              class=${token.kind === "unsupported" ? "unsupported" : ""}
              style=${styleMap({
                "padding-inline-start": `${token.depth * 16}px`,
              })}
            >
              <code class=${TOKEN_CLASS[token.kind] ?? "t-literal"}
                >${token.text}</code
              >
              <span>${this._describe(token, groupCount)}</span>
            </li>
          `
        )}
      </ol>
      ${
        unbalanced
          ? html`<p class="status bad">
              <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              ${this._l("status.unbalanced")}
            </p>`
          : nothing
      }
    `;
  }

  private _renderRisk() {
    if (!this._pattern) {
      return nothing;
    }
    const findings: RiskFinding[] = analyzeRisk(this._pattern, this._flags);
    return html`
      <h3>${this._l("risk.title")}</h3>
      ${
        findings.length
          ? html`
              <ul class="risk">
                ${findings.map(
                  (finding) => html`
                    <li class=${finding.level}>
                      <span class="level"
                        >${this._l(`risk.level.${finding.level}`)}</span
                      >
                      <code
                        >${this._pattern.slice(finding.start, finding.end)}</code
                      >
                      <span>${this._l(`risk.${finding.code}`)}</span>
                    </li>
                  `
                )}
              </ul>
              ${
                findings.some((finding) => finding.level === "high")
                  ? html`<p class="note">${this._l("risk.blocked")}</p>`
                  : nothing
              }
            `
          : html`<p class="status ok">
              <ha-svg-icon .path=${mdiCheckCircleOutline}></ha-svg-icon>
              ${this._l("risk.none")}
            </p>`
      }
    `;
  }

  // ---- Test ----

  private _renderSampleField() {
    return html`
      <label class="field">
        <span class="label">${this._l("test.sample_label")}</span>
        <textarea
          class="sample"
          rows="5"
          spellcheck="false"
          maxlength=${REGEX_LIMITS.sample}
          .value=${this._sample}
          @input=${this._sampleChanged}
        ></textarea>
      </label>
      <p class="note">
        ${this._l("test.sample_note", { limit: REGEX_LIMITS.sample })}
        ${
          this.samples?.length
            ? html`<button class="link" @click=${this._useSamples}>
                ${this._l("test.sample_from")}
              </button>`
            : nothing
        }
      </p>
    `;
  }

  private _renderSummary() {
    const outcome = this._outcome;
    if (!this._sample) {
      return html`<p class="note">${this._l("test.no_text")}</p>`;
    }
    if (outcome?.status !== "ok") {
      return nothing;
    }
    const { total, matches, truncated, durationMs } = outcome.result;
    const time = round(durationMs);
    return html`
      <p class="note" role="status" aria-live="polite">
        ${
          truncated
            ? this._l("test.summary_capped", { count: total })
            : total > matches.length
              ? this._l("test.summary_more", {
                  count: total,
                  time,
                  shown: matches.length,
                })
              : this._l("test.summary", { count: total, time })
        }
        ${
          !this._flags.includes("g") && !this._flags.includes("y")
            ? this._l("test.first_only")
            : nothing
        }
      </p>
    `;
  }

  private _renderMarkedSample() {
    const outcome = this._outcome;
    if (outcome?.status !== "ok" || !this._sample) {
      return nothing;
    }
    const parts: (string | TemplateResult)[] = [];
    let position = 0;
    outcome.result.matches.forEach((match, index) => {
      if (match.index < position) {
        return;
      }
      parts.push(this._sample.slice(position, match.index));
      parts.push(
        html`<mark
          class=${classMap({
            selected: index === this._selected,
            empty: match.text === "",
            odd: index % 2 === 1,
          })}
          >${match.text}</mark
        >`
      );
      position = match.end;
    });
    parts.push(this._sample.slice(position));
    return html`
      <div class="field">
        <span class="label">${this._l("test.result_label")}</span>
        <pre class="marked">${parts}</pre>
      </div>
    `;
  }

  private _renderMatchDetail() {
    const outcome = this._outcome;
    if (outcome?.status !== "ok" || !outcome.result.matches.length) {
      return nothing;
    }
    const { matches, groupPositions } = outcome.result;
    const match = matches[Math.min(this._selected, matches.length - 1)];
    return html`
      <section class="detail" aria-label=${this._l("test.match_list")}>
        <div class="nav">
          <button
            class="icon"
            aria-label=${this._l("test.previous")}
            title=${this._l("test.previous")}
            ?disabled=${this._selected <= 0}
            @click=${this._previousMatch}
          >
            <ha-svg-icon .path=${mdiChevronLeft}></ha-svg-icon>
          </button>
          <span role="status" aria-live="polite"
            >${this._l("test.match_n", {
              number: this._selected + 1,
              count: matches.length,
            })}</span
          >
          <button
            class="icon"
            aria-label=${this._l("test.next")}
            title=${this._l("test.next")}
            ?disabled=${this._selected >= matches.length - 1}
            @click=${this._nextMatch}
          >
            <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
          </button>
        </div>
        <dl>
          <dt>${this._l("test.whole")}</dt>
          <dd>
            <code>${match.text}</code>
            <span class="note"
              >${
                match.text === ""
                  ? this._l("test.empty_match", { start: match.index })
                  : this._l("test.position", {
                      start: match.index,
                      end: match.end,
                    })
              }</span
            >
          </dd>
          ${match.groups.map(
            (group, index) => html`
              <dt>
                ${this._l("test.group_n", { number: index + 1 })}${
                  group.name ? html` <code>${group.name}</code>` : nothing
                }
              </dt>
              <dd>
                ${
                  group.text === undefined
                    ? html`<span class="note"
                        >${this._l("test.group_none")}</span
                      >`
                    : html`<code>${group.text}</code> ${
                          group.start !== undefined
                            ? html`<span class="note"
                                >${this._l("test.position", {
                                  start: group.start,
                                  end: group.end!,
                                })}</span
                              >`
                            : nothing
                        }`
                }
              </dd>
            `
          )}
        </dl>
        ${
          groupPositions
            ? nothing
            : html`<p class="note">${this._l("test.no_positions")}</p>`
        }
      </section>
    `;
  }

  private _renderTest() {
    return html`
      <div class="columns">
        <section>
          ${this._renderListPreview()} ${this._renderSampleField()}
          ${this._renderSummary()} ${this._renderMarkedSample()}
        </section>
        ${this._renderMatchDetail()}
      </div>
    `;
  }

  // The list filters one item at a time, so this shows the answer the list
  // will give, which can differ from matches in one long test text.
  private _renderListPreview() {
    const outcome = this._listOutcome;
    if (!this.samples?.length || outcome?.status !== "ok") {
      return nothing;
    }
    const items = this.samples.slice(0, MAX_LIST_ITEMS);
    const matched = items.filter(
      (_item, index) => outcome.result.matched[index]
    );
    const shown = matched.slice(0, MAX_LIST_SHOWN);
    return html`
      <div class="list-preview" role="status">
        <span class="label">${this._l("test.list_title")}</span>
        <p class="note">
          ${this._l("test.list_summary", {
            matched: matched.length,
            count: items.length,
          })}
        </p>
        ${
          shown.length
            ? html`<ul class="list-items">
                ${shown.map((item) => html`<li>${item}</li>`)}
                ${
                  matched.length > shown.length
                    ? html`<li class="more">
                        ${this._l("test.list_more", {
                          count: matched.length - shown.length,
                        })}
                      </li>`
                    : nothing
                }
              </ul>`
            : nothing
        }
      </div>
    `;
  }

  // ---- Replace ----

  private _renderReplace() {
    const outcome = this._outcome;
    const result = outcome?.status === "ok" ? outcome.result : undefined;
    return html`
      <div class="columns">
        <section>
          ${this._renderSampleField()}
          <div class="field">
            <ha-input
              appearance="outlined"
              type="text"
              class="mono"
              .label=${this._l("replace.replacement_label")}
              autocomplete="off"
              spellcheck="false"
              .value=${this._replacement}
              @input=${this._replacementChanged}
            ></ha-input>
          </div>
          <p class="note">${this._l("replace.tokens")}</p>
        </section>
        <section>
          <div class="field">
            <span class="label">${this._l("replace.result_label")}</span>
            <pre class="marked">${result?.replaced ?? ""}</pre>
          </div>
          <div class="field">
            <span class="label"
              >${this._l("replace.split_label")}${
                result?.parts
                  ? html` ·
                    ${this._l("replace.split_count", {
                      count: result.parts.length,
                    })}`
                  : nothing
              }</span
            >
            <ol class="parts">
              ${(result?.parts ?? [])
                .slice(0, 200)
                .map(
                  (part) =>
                    html`<li>
                      ${
                        part === ""
                          ? html`<span class="note"
                              >${this._l("replace.empty_part")}</span
                            >`
                          : html`<code>${part}</code>`
                      }
                    </li>`
                )}
            </ol>
            ${
              (result?.parts?.length ?? 0) > 200
                ? html`<p class="note">
                    ${this._l("replace.split_capped", { limit: 200 })}
                  </p>`
                : nothing
            }
          </div>
        </section>
      </div>
    `;
  }

  // ---- Cases ----

  private _renderCases() {
    const matched =
      this._caseOutcome?.status === "ok"
        ? this._caseOutcome.result.matched
        : undefined;
    const passed = matched
      ? this._cases.filter((item, index) => matched[index] === item.expect)
          .length
      : 0;
    return html`
      <p class="note">${this._l("cases.note")}</p>
      ${
        this._cases.length
          ? html`
              <ul class="cases">
                ${this._cases.map((item, index) => {
                  const pass = matched
                    ? matched[index] === item.expect
                    : undefined;
                  return html`
                    <li>
                      <ha-input
                        appearance="outlined"
                        type="text"
                        class="mono case-text"
                        autocomplete="off"
                        spellcheck="false"
                        .label=${this._l("cases.text_label", {
                          number: index + 1,
                        })}
                        .value=${item.text}
                        .index=${index}
                        @input=${this._caseTextChanged}
                      ></ha-input>
                      <ha-select
                        class="case-expect"
                        aria-label=${this._l("cases.expect_label", {
                          number: index + 1,
                        })}
                        .index=${index}
                        .value=${item.expect ? "match" : "no"}
                        .options=${[
                          {
                            value: "match",
                            label: this._l("cases.expect_match"),
                          },
                          {
                            value: "no",
                            label: this._l("cases.expect_no_match"),
                          },
                        ]}
                        @selected=${this._caseExpectChanged}
                      ></ha-select>
                      <span
                        class=${classMap({
                          verdict: true,
                          pass: pass === true,
                          fail: pass === false,
                        })}
                        >${
                          pass === undefined
                            ? ""
                            : this._l(pass ? "cases.pass" : "cases.fail")
                        }</span
                      >
                      <button
                        class="icon"
                        aria-label=${this._l("cases.remove", {
                          number: index + 1,
                        })}
                        title=${this._l("cases.remove", { number: index + 1 })}
                        .index=${index}
                        @click=${this._removeCase}
                      >
                        <ha-svg-icon .path=${mdiDelete}></ha-svg-icon>
                      </button>
                    </li>
                  `;
                })}
              </ul>
              ${
                matched
                  ? html`<p
                      class=${classMap({
                        status: true,
                        ok: passed === this._cases.length,
                        bad: passed !== this._cases.length,
                      })}
                      role="status"
                      aria-live="polite"
                    >
                      ${this._l("cases.summary", {
                        passed,
                        total: this._cases.length,
                      })}
                    </p>`
                  : nothing
              }
            `
          : html`<p class="note">${this._l("cases.empty")}</p>`
      }
      <div>
        <button class="tonal" @click=${this._addCase}>
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
          ${this._l("cases.add")}
        </button>
      </div>
    `;
  }

  // ---- Performance ----

  private _renderPerformance() {
    const benchmark = this._benchmark;
    let benchmarkText: string | undefined;
    if (benchmark?.status === "ok") {
      const sorted = [...benchmark.result.timings].sort((a, b) => a - b);
      benchmarkText = this._l("performance.benchmark_result", {
        min: round(sorted[0]),
        median: round(sorted[Math.floor(sorted.length / 2)]),
        max: round(sorted[sorted.length - 1]),
        matches: benchmark.result.total,
      });
    } else if (benchmark?.status === "timeout") {
      benchmarkText = this._l("status.timeout", { limit: benchmark.limitMs });
    } else if (benchmark?.status === "unavailable") {
      benchmarkText = this._l("status.unavailable");
    }
    const growth = this._growth;
    const measured = growth?.filter((row) => row.time !== undefined) ?? [];
    const lastRatio = measured[measured.length - 1]?.ratio;
    const timedOut = growth?.find((row) => row.timedOut);
    return html`
      <div class="columns">
        <section>
          <h3>${this._l("performance.benchmark")}</h3>
          <p class="note">
            ${this._l("performance.benchmark_note", {
              iterations: BENCHMARK_ITERATIONS,
            })}
          </p>
          <div>
            <button
              class="tonal"
              ?disabled=${this._busy || !this._usable || !this._sample}
              @click=${this._runBenchmark}
            >
              <ha-svg-icon .path=${mdiPlay}></ha-svg-icon>
              ${this._l("performance.run_benchmark")}
            </button>
          </div>
          <p class="note" role="status" aria-live="polite">
            ${
              this._busy
                ? this._l("status.running")
                : !this._sample
                  ? this._l("performance.need_sample")
                  : (benchmarkText ?? nothing)
            }
          </p>
          ${this._renderRisk()}
        </section>
        <section>
          <h3>${this._l("performance.growth")}</h3>
          <p class="note">${this._l("performance.growth_note")}</p>
          <div>
            <button
              class="tonal"
              ?disabled=${this._busy || !this._usable || !this._sample}
              @click=${this._runGrowth}
            >
              <ha-svg-icon .path=${mdiPlay}></ha-svg-icon>
              ${this._l("performance.run_growth")}
            </button>
          </div>
          ${
            growth
              ? html`
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">${this._l("performance.size")}</th>
                        <th scope="col">${this._l("performance.time")}</th>
                        <th scope="col">${this._l("performance.ratio")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${growth.map(
                        (row) => html`
                          <tr>
                            <td>${row.size}</td>
                            <td>
                              ${
                                row.time === undefined
                                  ? "–"
                                  : this._l("performance.time_ms", {
                                      time: round(row.time),
                                    })
                              }
                            </td>
                            <td>
                              ${
                                row.ratio === undefined
                                  ? "–"
                                  : this._l("performance.ratio_value", {
                                      ratio: round(row.ratio),
                                    })
                              }
                            </td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                  <p
                    class=${classMap({
                      status: true,
                      bad: !!timedOut || (lastRatio ?? 0) > 3,
                      ok: !timedOut && (lastRatio ?? 0) <= 3,
                    })}
                    role="status"
                    aria-live="polite"
                  >
                    ${
                      timedOut
                        ? this._l("performance.growth_timeout", {
                            size: timedOut.size,
                            limit: GROWTH_LIMIT_MS,
                          })
                        : lastRatio === undefined
                          ? nothing
                          : this._l(
                              lastRatio > 3
                                ? "performance.growth_fast"
                                : "performance.growth_linear"
                            )
                    }
                  </p>
                `
              : nothing
          }
          <h3>${this._l("performance.trace")}</h3>
          <p class="note">${this._l("performance.trace_unavailable")}</p>
        </section>
      </div>
    `;
  }

  // ---- Code ----

  private _renderCode() {
    const generated = generateCode(this._target, this._pattern, this._flags);
    return html`
      <div class="columns">
        <section>
          <div class="field">
            <ha-select
              .label=${this._l("code.target_label")}
              .value=${this._target}
              .options=${CODE_TARGETS.map((target) => ({
                value: target,
                label: this._l(`code.target.${target}`),
              }))}
              @selected=${this._targetChanged}
            ></ha-select>
          </div>
          <pre class="marked code">${generated.code}</pre>
          <div>
            <button class="tonal" @click=${this._copyCode}>
              <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
              ${this._l("actions.copy_code")}
            </button>
          </div>
        </section>
        <section>
          <h3>${this._l("code.converted")}</h3>
          ${
            generated.pattern === this._pattern
              ? html`<p class="note">${this._l("code.same")}</p>`
              : html`<pre class="marked code">${generated.pattern}</pre>`
          }
          <h3>${this._l("code.warnings")}</h3>
          ${
            generated.warnings.length
              ? html`<ul class="warnings">
                  ${generated.warnings.map(
                    (warning) =>
                      html`<li>${this._l(`code.warning.${warning}`)}</li>`
                  )}
                </ul>`
              : html`<p class="note">${this._l("code.no_warnings")}</p>`
          }
          ${
            this._target === "javascript" || this._target === "json"
              ? nothing
              : html`<p class="note">${this._l("code.note")}</p>`
          }
        </section>
      </div>
    `;
  }

  // ---- Library ----

  private _renderLibrary() {
    return html`
      <div class="columns">
        <section>
          <p class="note">${this._l("library.note")}</p>
          <div class="literal">
            <div class="field">
              <ha-input
                appearance="outlined"
                type="text"
                .label=${this._l("library.name_label")}
                autocomplete="off"
                .maxlength=${80}
                .value=${this._saveName}
                @input=${this._saveNameChanged}
              ></ha-input>
            </div>
            <button
              class="tonal"
              ?disabled=${!this._saveName.trim() || !this._usable}
              @click=${this._savePattern}
            >
              <ha-svg-icon .path=${mdiContentSave}></ha-svg-icon>
              ${this._l("library.save")}
            </button>
          </div>
          <h3>${this._l("library.saved")}</h3>
          ${
            this._library.length
              ? html`<ul class="saved">
                  ${this._library.map(
                    (item, index) => html`
                      <li>
                        <button
                          class="entry"
                          aria-label=${this._l("library.load", {
                            name: item.name,
                          })}
                          .index=${index}
                          @click=${this._loadSaved}
                        >
                          <span class="entry-name">${item.name}</span>
                          <code
                            >${formatRegexQuery(item.pattern, item.flags)}</code
                          >
                        </button>
                        <button
                          class="icon"
                          aria-label=${this._l("library.delete", {
                            name: item.name,
                          })}
                          title=${this._l("library.delete", { name: item.name })}
                          .index=${index}
                          @click=${this._deleteSaved}
                        >
                          <ha-svg-icon .path=${mdiDelete}></ha-svg-icon>
                        </button>
                      </li>
                    `
                  )}
                </ul>`
              : html`<p class="note">${this._l("library.empty")}</p>`
          }
          <div class="row">
            <button
              class="outlined"
              ?disabled=${!this._library.length}
              @click=${this._exportLibrary}
            >
              <ha-svg-icon .path=${mdiDownload}></ha-svg-icon>
              ${this._l("library.export")}
            </button>
            <button class="outlined" @click=${this._chooseImport}>
              <ha-svg-icon .path=${mdiUpload}></ha-svg-icon>
              ${this._l("library.import")}
            </button>
            <input
              class="file-input-hidden"
              tabindex="-1"
              aria-hidden="true"
              id="import"
              type="file"
              accept="application/json,.json"
              @change=${this._importLibrary}
            />
          </div>
        </section>
        <section>
          <h3>${this._l("library.history")}</h3>
          ${
            this._history.length
              ? html`<ul class="saved">
                  ${this._history.map(
                    (item) => html`
                      <li>
                        <button
                          class="entry"
                          title=${this._l("library.history_load")}
                          .query=${item}
                          @click=${this._loadHistory}
                        >
                          <code>${item}</code>
                        </button>
                      </li>
                    `
                  )}
                </ul>`
              : html`<p class="note">${this._l("library.history_empty")}</p>`
          }
        </section>
      </div>
    `;
  }

  // ---- Engine ----

  private _renderEngine() {
    if (!this._capabilities) {
      this._capabilities = getCapabilities();
    }
    const info = getEngineInfo();
    return html`
      <div class="columns">
        <section>
          <p>${this._l("engine.dialect")}</p>
          <dl>
            <dt>${this._l("engine.browser")}</dt>
            <dd>
              ${
                info.engine
                  ? this._l("engine.browser_value", {
                      browser: info.browser ?? "",
                      version: info.version ?? "",
                      engine: info.engine,
                    })
                  : this._l("engine.browser_unknown")
              }
            </dd>
            <dt>${this._l("flags_label")}</dt>
            <dd><code>${SUPPORTED_FLAGS.join(" ")}</code></dd>
            <dt>${this._l("engine.limits")}</dt>
            <dd>
              ${this._l("engine.limits_value", {
                pattern: REGEX_LIMITS.pattern,
                sample: REGEX_LIMITS.sample,
                matches: REGEX_LIMITS.matches,
                timeout: REGEX_LIMITS.timeoutMs,
                value: REGEX_LIMITS.value,
              })}
            </dd>
          </dl>
          <p class="note">${this._l("engine.escaping")}</p>
          <p class="note">${this._l("engine.isolation")}</p>
          <p class="note">${this._l("engine.privacy")}</p>
        </section>
        <section>
          <h3>${this._l("engine.capabilities")}</h3>
          <ul class="capabilities">
            ${this._capabilities.map(
              (capability) => html`
                <li class=${capability.supported ? "yes" : "no"}>
                  <span>${this._l(`engine.capability.${capability.id}`)}</span>
                  <span class="state"
                    >${this._l(
                      capability.supported
                        ? "engine.supported"
                        : capability.scope === "engine"
                          ? "engine.unsupported_engine"
                          : "engine.unsupported_language"
                    )}</span
                  >
                </li>
              `
            )}
          </ul>
        </section>
      </div>
    `;
  }

  // ---- Handlers ----

  private _toggled(ev: ToggleEvent) {
    if (ev.newState === "open") {
      window.addEventListener("resize", this._place);
      // The keyboard changes the visible screen without resizing the window.
      window.visualViewport?.addEventListener("resize", this._place);
    } else {
      window.removeEventListener("resize", this._place);
      window.visualViewport?.removeEventListener("resize", this._place);
      cancelRegexEvaluations();
      this._notice = "";
      this._menu = "";
    }
  }

  private _modeChanged(ev: Event) {
    const mode = (ev.currentTarget as HTMLElement & { mode: "text" | "regex" })
      .mode;
    if (mode === "regex" && !this._pattern && this._text) {
      this._pattern = escapeLiteral(this._text);
      this._flags = "i";
    }
    this._mode = mode;
  }

  private _makeRegex() {
    this._pattern = escapeLiteral(this._text);
    this._flags = "i";
    this._mode = "regex";
    this.updateComplete.then(() => this._patternInput?.focus());
  }

  private _textChanged(ev: InputEvent) {
    this._text = (ev.target as HaInput).value ?? "";
  }

  private _patternChanged(ev: InputEvent) {
    // A pattern is one line. A pasted line break becomes its escape.
    this._pattern = (ev.target as HTMLTextAreaElement).value
      .replace(/\r?\n/g, "\\n")
      .slice(0, REGEX_LIMITS.pattern);
  }

  private _flagToggled(ev: Event) {
    const flag = (ev.currentTarget as HTMLElement & { flag: RegexFlag }).flag;
    this._setFlag(flag, !this._flags.includes(flag));
  }

  private _setFlag(flag: RegexFlag, on: boolean) {
    let flags = this._flags.replace(flag, "");
    if (on) {
      // The Unicode and Unicode sets flags cannot be used together.
      if (flag === "u") {
        flags = flags.replace("v", "");
      } else if (flag === "v") {
        flags = flags.replace("u", "");
      }
      flags += flag;
    }
    this._flags = ALL_FLAGS.filter((item) => flags.includes(item)).join("");
  }

  private _tabChanged(ev: Event) {
    this._tab = (ev.currentTarget as HTMLElement & { tab: WorkbenchTab }).tab;
  }

  private _tabKeydown(ev: KeyboardEvent) {
    const order: (WorkbenchTab | "more")[] = this._narrow
      ? [...PRIMARY_TABS, "more"]
      : [...TABS];
    const focused = (ev.target as HTMLElement).id?.replace("tab-", "") ?? "";
    let index = order.indexOf(focused as WorkbenchTab | "more");
    if (index < 0) {
      index = Math.max(
        0,
        order.indexOf(MORE_TABS.includes(this._tab) ? "more" : this._tab)
      );
    }
    if (focused === "more" && ev.key === "ArrowDown") {
      ev.preventDefault();
      this._openMenu("tabs");
      return;
    }
    const rtl = getComputedStyle(this).direction === "rtl";
    let next: number;
    if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = order.length - 1;
    } else if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      const forward = (ev.key === "ArrowRight") !== rtl;
      next = (index + (forward ? 1 : -1) + order.length) % order.length;
    } else {
      return;
    }
    ev.preventDefault();
    const target = order[next];
    if (target !== "more") {
      this._tab = target;
    }
    this.updateComplete.then(() =>
      (this.renderRoot as ShadowRoot).getElementById(`tab-${target}`)?.focus()
    );
  }

  // ---- Popup menus and the flags sheet ----

  private _openMenu(menu: WorkbenchMenu) {
    this._menu = menu;
    this.updateComplete.then(() => {
      const selector =
        menu === "flags"
          ? ".flag-row:not([disabled])"
          : '.menu [aria-checked="true"], .menu [role="menuitem"]';
      (this.renderRoot as ShadowRoot)
        .querySelector<HTMLElement>(selector)
        ?.focus();
    });
  }

  private _closeMenu() {
    const menu = this._menu;
    if (!menu) {
      return;
    }
    this._menu = "";
    const opener =
      menu === "flags"
        ? "flags-chip"
        : menu === "tabs"
          ? "tab-more"
          : "footer-more";
    this.updateComplete.then(() =>
      (this.renderRoot as ShadowRoot).getElementById(opener)?.focus()
    );
  }

  private _toggleMenu(menu: WorkbenchMenu) {
    if (this._menu === menu) {
      this._closeMenu();
    } else {
      this._openMenu(menu);
    }
  }

  private _toggleFlagsSheet() {
    this._toggleMenu("flags");
  }

  private _toggleTabsMenu() {
    this._toggleMenu("tabs");
  }

  private _toggleFooterMenu() {
    this._toggleMenu("footer");
  }

  private _pickMoreTab(ev: Event) {
    this._tab = (ev.currentTarget as HTMLElement & { tab: WorkbenchTab }).tab;
    this._closeMenu();
  }

  private _menuCopyPattern() {
    this._closeMenu();
    this._copyPattern();
  }

  private _menuExport() {
    this._closeMenu();
    this._export();
  }

  // Escape closes the open menu or sheet and not the whole workbench.
  private _panelKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape" && this._menu) {
      ev.preventDefault();
      ev.stopPropagation();
      this._closeMenu();
    }
  }

  private _menuKeydown(ev: KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) {
      return;
    }
    const items = Array.from(
      (ev.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("button")
    );
    const index = items.indexOf(
      (this.renderRoot as ShadowRoot).activeElement as HTMLElement
    );
    let next: number;
    if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = items.length - 1;
    } else {
      next =
        (index + (ev.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length;
    }
    ev.preventDefault();
    items[next]?.focus();
  }

  private _insertBlock(ev: Event) {
    const block = (ev.currentTarget as HTMLElement & { block: Block }).block;
    const input = this._patternInput;
    const start = input?.selectionStart ?? this._pattern.length;
    const end = input?.selectionEnd ?? this._pattern.length;
    const selected = this._pattern.slice(start, end);
    const inserted = block.wrap
      ? `${block.wrap[0]}${selected}${block.wrap[1]}`
      : block.insert!;
    this._pattern = (
      this._pattern.slice(0, start) +
      inserted +
      this._pattern.slice(end)
    ).slice(0, REGEX_LIMITS.pattern);
    if (
      block.flag &&
      !this._flags.includes(block.flag) &&
      !this._flags.includes("v")
    ) {
      this._setFlag(block.flag, true);
    }
    // Leave the cursor inside an empty group, otherwise after the block.
    const caret =
      block.wrap && !selected
        ? start + block.wrap[0].length
        : start + inserted.length;
    this.updateComplete.then(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  }

  private _literalChanged(ev: InputEvent) {
    this._literal = (ev.target as HaInput).value ?? "";
  }

  private _literalKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" && this._literal) {
      ev.preventDefault();
      this._insertLiteral();
    }
  }

  private _insertLiteral() {
    const input = this._patternInput;
    const start = input?.selectionStart ?? this._pattern.length;
    const end = input?.selectionEnd ?? this._pattern.length;
    const inserted = escapeLiteral(this._literal);
    this._pattern = (
      this._pattern.slice(0, start) +
      inserted +
      this._pattern.slice(end)
    ).slice(0, REGEX_LIMITS.pattern);
    this._literal = "";
  }

  private _sampleChanged(ev: InputEvent) {
    this._sample = (ev.target as HTMLTextAreaElement).value;
  }

  private _useSamples() {
    this._sample = (this.samples ?? [])
      .join("\n")
      .slice(0, REGEX_LIMITS.sample);
  }

  private _replacementChanged(ev: InputEvent) {
    this._replacement = (ev.target as HaInput).value ?? "";
  }

  private _previousMatch() {
    this._selected = Math.max(0, this._selected - 1);
  }

  private _nextMatch() {
    this._selected += 1;
  }

  private _addCase() {
    this._cases = [...this._cases, { text: "", expect: true }];
  }

  private _removeCase(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._cases = this._cases.filter((_item, position) => position !== index);
  }

  private _caseTextChanged(ev: InputEvent) {
    const target = ev.target as HaInput & { index: number };
    this._cases = this._cases.map((item, position) =>
      position === target.index ? { ...item, text: target.value ?? "" } : item
    );
  }

  private _caseExpectChanged(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const target = ev.currentTarget as HaSelect & { index: number };
    this._cases = this._cases.map((item, position) =>
      position === target.index
        ? { ...item, expect: ev.detail.value === "match" }
        : item
    );
  }

  private async _runBenchmark() {
    this._busy = true;
    this._benchmark = await evaluateRegex(
      {
        type: "time",
        pattern: this._pattern,
        flags: this._flags,
        sample: this._sample,
        iterations: BENCHMARK_ITERATIONS,
      },
      BENCHMARK_LIMIT_MS
    );
    this._busy = false;
  }

  private async _runGrowth() {
    this._busy = true;
    const rows: GrowthRow[] = [];
    let previous: number | undefined;
    for (const factor of GROWTH_FACTORS) {
      const sample = this._sample.repeat(factor);
      // Sizes are measured one after another on purpose: each needs the
      // worker to itself for the time to mean anything.
      // eslint-disable-next-line no-await-in-loop
      const outcome = await evaluateRegex(
        {
          type: "time",
          pattern: this._pattern,
          flags: this._flags,
          sample,
          iterations: 3,
        },
        GROWTH_LIMIT_MS
      );
      if (outcome.status !== "ok") {
        rows.push({
          size: sample.length,
          timedOut: outcome.status === "timeout",
        });
        break;
      }
      const time = Math.min(...outcome.result.timings);
      rows.push({
        size: sample.length,
        time,
        // Below a twentieth of a millisecond the clock is too coarse for a
        // ratio to mean anything.
        ratio:
          previous !== undefined && previous >= 0.05
            ? time / previous
            : undefined,
      });
      previous = time;
      this._growth = [...rows];
    }
    this._growth = rows;
    this._busy = false;
  }

  private _targetChanged(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    this._target = String(ev.detail.value) as CodeTarget;
  }

  private async _copyPattern() {
    await copyToClipboard(formatRegexQuery(this._pattern, this._flags), this);
    this._notice = this._l("actions.copied");
  }

  private async _copyCode() {
    await copyToClipboard(
      generateCode(this._target, this._pattern, this._flags).code,
      this
    );
    this._notice = this._l("actions.copied");
  }

  private _download(name: string, data: unknown) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    fileDownload(url, name);
  }

  // The export holds the pattern, its explanation and the test cases. The
  // test text is left out: it may be private and was never asked to be kept.
  private _export() {
    const { tokens, groupCount } = this._tokens;
    this._download("pattern.json", {
      format: "home-assistant-material.pattern",
      version: 1,
      engine: "ECMAScript",
      pattern: this._pattern,
      flags: this._flags,
      query: formatRegexQuery(this._pattern, this._flags),
      explanation: mergeLiterals(tokens).map((token) => ({
        text: token.text,
        meaning: this._describe(token, groupCount),
      })),
      risks: analyzeRisk(this._pattern, this._flags).map((finding) => ({
        level: finding.level,
        code: finding.code,
        text: this._pattern.slice(finding.start, finding.end),
      })),
      cases: this._cases,
    });
  }

  private _readLibrary(): SavedPattern[] {
    const stored = getStorage().getValue<SavedPattern[]>(LIBRARY_STORAGE_KEY);
    return Array.isArray(stored)
      ? stored.filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            typeof item.pattern === "string" &&
            typeof item.flags === "string"
        )
      : [];
  }

  private _writeLibrary(library: SavedPattern[]) {
    this._library = library;
    getStorage().setValue(LIBRARY_STORAGE_KEY, library);
  }

  private _saveNameChanged(ev: InputEvent) {
    this._saveName = (ev.target as HaInput).value ?? "";
  }

  private _savePattern() {
    const name = this._saveName.trim();
    const saved: SavedPattern = {
      name,
      pattern: this._pattern,
      flags: this._flags,
      cases: this._cases.length ? this._cases : undefined,
    };
    this._writeLibrary([
      ...this._library.filter((item) => item.name !== name),
      saved,
    ]);
    this._saveName = "";
  }

  private _loadSaved(ev: Event) {
    const item =
      this._library[
        (ev.currentTarget as HTMLElement & { index: number }).index
      ];
    if (!item) {
      return;
    }
    this._pattern = item.pattern;
    this._flags = item.flags;
    this._cases = item.cases ?? [];
    this._tab = "build";
  }

  private _deleteSaved(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._writeLibrary(
      this._library.filter((_item, position) => position !== index)
    );
  }

  private _exportLibrary() {
    this._download("pattern-library.json", {
      format: "home-assistant-material.pattern-library",
      version: 1,
      patterns: this._library,
    });
  }

  private _chooseImport() {
    this._importInput?.click();
  }

  private async _importLibrary(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || file.size > 1024 * 1024) {
      this._notice = this._l("library.import_failed");
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const patterns: unknown = data?.patterns;
      if (
        data?.format !== "home-assistant-material.pattern-library" ||
        !Array.isArray(patterns)
      ) {
        throw new Error("format");
      }
      const valid = (patterns as SavedPattern[])
        .filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            typeof item.pattern === "string" &&
            typeof item.flags === "string" &&
            item.pattern.length <= REGEX_LIMITS.pattern
        )
        .map((item) => ({
          name: item.name.slice(0, 80),
          pattern: item.pattern,
          flags: item.flags,
          cases: Array.isArray(item.cases)
            ? item.cases
                .filter((entry) => entry && typeof entry.text === "string")
                .map((entry) => ({
                  text: entry.text,
                  expect: entry.expect !== false,
                }))
            : undefined,
        }));
      const names = new Set(valid.map((item) => item.name));
      this._writeLibrary([
        ...this._library.filter((item) => !names.has(item.name)),
        ...valid,
      ]);
      this._notice = this._l("library.import_done", { count: valid.length });
    } catch (_err) {
      this._notice = this._l("library.import_failed");
    }
  }

  private _loadHistory(ev: Event) {
    const parsed = parseSearchQuery(
      (ev.currentTarget as HTMLElement & { query: string }).query
    );
    this._pattern = parsed.pattern;
    this._flags = parsed.flags;
    this._tab = "build";
  }

  private _applyOnEnter(ev: KeyboardEvent) {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      this._apply();
    }
  }

  private _apply() {
    let value: string;
    if (this._mode === "regex") {
      if (!this._usable) {
        return;
      }
      value = formatRegexQuery(this._pattern, this._flags);
      this._history = [
        value,
        ...this._history.filter((item) => item !== value),
      ].slice(0, 20);
    } else {
      value = this._text;
    }
    fireEvent(this, "regex-apply", { value });
    this.close();
    this._anchor?.focus();
  }

  static styles: CSSResultGroup = [
    visuallyHiddenFileInputStyles,
    css`
      .list-preview {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl);
        background: var(--ha-color-fill-primary-quiet-resting);
      }
      .list-preview .note {
        margin: 0;
      }
      .list-items {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .list-items li {
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        background: var(--card-background-color);
        font-size: var(--ha-font-size-s);
      }
      .list-items li.more {
        background: none;
        color: var(--secondary-text-color);
      }
      :host {
        font-family: var(--ha-font-family-body);
        --regex-mono:
          "Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas,
          monospace;
      }
      button,
      input,
      select,
      textarea {
        font: inherit;
        color: inherit;
      }
      button {
        border: none;
        background: none;
        cursor: pointer;
        padding: 0;
      }
      button[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      button:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      #panel {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 0;
        border: var(--ha-pane-outline, none);
        border-radius: var(--ha-border-radius-4xl);
        background-color: var(--primary-background-color);
        color: var(--primary-text-color);
        box-shadow: var(
          --ha-shadow-overlay,
          0 8px 12px 6px rgba(0, 0, 0, 0.12),
          0 4px 4px rgba(0, 0, 0, 0.2)
        );
        overflow: hidden;
        flex-direction: column;
        text-align: start;
        font-size: var(--ha-font-size-m);
        line-height: var(--ha-line-height-normal);
      }
      #panel:popover-open {
        display: flex;
      }
      .top {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2)
          var(--ha-space-6);
        flex-wrap: wrap;
      }
      .heading {
        flex: 1;
        min-width: 0;
      }
      .sub {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      h2 {
        margin: 0;
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
        white-space: nowrap;
      }
      h3 {
        margin: var(--ha-space-2) 0 0;
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-medium);
      }
      h3:first-child {
        margin-top: 0;
      }
      p {
        margin: 0;
      }
      .note {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .segments {
        display: flex;
        padding: var(--ha-space-1);
        gap: var(--ha-space-1);
        border-radius: var(--ha-border-radius-pill);
        background-color: var(--card-background-color);
        border: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
      }
      .segments button {
        height: var(--ha-space-9);
        padding: 0 var(--ha-space-4);
        border-radius: var(--ha-border-radius-pill);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .segments button[aria-checked="true"] {
        background-color: var(--primary-text-color);
        color: var(--primary-background-color);
      }
      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: var(--ha-space-10);
        height: var(--ha-space-10);
        border-radius: var(--ha-border-radius-circle);
        --mdc-icon-size: 20px;
      }
      .icon:hover {
        background-color: var(--card-background-color);
      }
      .pattern-area {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: 0 var(--ha-space-6) var(--ha-space-2);
      }
      .label {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      .flags,
      .blocks,
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .flags {
        justify-content: flex-start;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: var(--ha-space-8);
        padding: 0 var(--ha-space-3);
        border-radius: var(--ha-border-radius-md);
        border: 1px solid var(--outline-hover-color);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        white-space: nowrap;
      }
      .chip:hover {
        background-color: var(--card-background-color);
      }
      .chip[aria-pressed="true"] {
        background-color: var(--ha-color-fill-primary-normal-resting);
        border-color: transparent;
        color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      }
      code,
      .mono,
      pre,
      textarea {
        font-family: var(--regex-mono);
      }
      .chip code {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .chip ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      .editor {
        position: relative;
        border-radius: var(--ha-border-radius-xl) var(--ha-border-radius-xl) 0 0;
        background-color: var(--card-background-color);
        border: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
        border-bottom: 2px solid var(--primary-color);
      }
      .editor pre,
      .editor textarea {
        margin: 0;
        padding: var(--ha-space-3) var(--ha-space-4);
        font-size: var(--ha-font-size-xl);
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-all;
        box-sizing: border-box;
        width: 100%;
        letter-spacing: 0;
        tab-size: 4;
      }
      .editor pre {
        min-height: calc(1.5em + var(--ha-space-6));
        pointer-events: none;
      }
      .editor textarea {
        position: absolute;
        inset: 0;
        height: 100%;
        border: none;
        outline: none;
        resize: none;
        overflow: hidden;
        background: transparent;
        color: transparent;
        caret-color: var(--primary-text-color);
      }
      .editor:focus-within {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      .t-group {
        color: #b3261e;
      }
      .t-look {
        color: #8c4a00;
      }
      .t-quant {
        color: #7b3fa0;
      }
      .t-class {
        color: #00639b;
      }
      .t-anchor {
        color: #006b5f;
      }
      .t-ref {
        color: #8c4a00;
      }
      .t-escape {
        color: #2f6b1a;
      }
      .t-unsupported {
        color: #b3261e;
        text-decoration: underline wavy;
      }
      :host-context([data-a11y-dark]) .t-group,
      :host-context([data-a11y-dark]) .t-unsupported {
        color: #ffb4ab;
      }
      .status {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        --mdc-icon-size: 18px;
      }
      .status.ok {
        color: var(--success-color);
      }
      .status.bad {
        color: var(--error-color);
      }
      .tabs-wrap {
        position: relative;
        flex: none;
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
        padding: var(--ha-space-1) var(--ha-space-5);
      }
      .tabs button {
        flex: none;
        height: var(--ha-space-9);
        padding: 0 var(--ha-space-4);
        border-radius: var(--ha-border-radius-pill);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .tabs button:hover {
        background-color: var(--card-background-color);
      }
      .tabs button[aria-selected="true"] {
        background-color: var(--primary-text-color);
        color: var(--primary-background-color);
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3) var(--ha-space-6);
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }
      /* Rows of a scrolling column keep their height instead of being squeezed. */
      .body > * {
        flex-shrink: 0;
      }
      .body.plain {
        flex: none;
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: var(--ha-space-4);
        align-items: start;
      }
      section {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        min-width: 0;
        padding: var(--ha-space-4);
        border-radius: var(--ha-border-radius-3xl);
        background-color: var(--card-background-color);
        border: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
      }
      .block-group {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .group-name {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      section .chip {
        background-color: var(--primary-background-color);
        border-color: transparent;
      }
      section .chip:hover {
        border-color: var(--outline-hover-color);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        flex: 1;
        min-width: 0;
      }
      textarea.sample {
        box-sizing: border-box;
        width: 100%;
        min-height: var(--ha-space-10);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        border: 1px solid var(--outline-hover-color);
        background-color: var(--primary-background-color);
        outline: none;
      }
      textarea.sample:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 1px var(--primary-color);
      }
      textarea.sample {
        resize: vertical;
        font-size: var(--ha-font-size-m);
        line-height: 1.5;
      }
      .literal {
        display: flex;
        align-items: flex-end;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .tonal,
      .outlined,
      .filled {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-2);
        min-height: var(--ha-space-10);
        padding: 0 var(--ha-space-5);
        border-radius: var(--ha-border-radius-pill);
        font-weight: var(--ha-font-weight-medium);
        white-space: nowrap;
        --mdc-icon-size: 18px;
      }
      .tonal {
        background-color: var(--ha-color-fill-primary-normal-resting);
        color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      }
      .outlined {
        border: 1px solid var(--outline-hover-color);
      }
      .filled {
        background-color: var(--primary-color);
        color: var(--text-primary-color);
      }
      .link {
        color: var(--primary-color);
        text-decoration: underline;
        font-size: inherit;
      }
      .explain,
      .risk,
      .cases,
      .saved,
      .capabilities,
      .warnings,
      .parts {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .warnings,
      .parts {
        padding-inline-start: var(--ha-space-5);
        list-style: revert;
      }
      .explain li {
        display: flex;
        align-items: baseline;
        gap: var(--ha-space-3);
      }
      .explain code {
        flex: none;
        min-width: var(--ha-space-10);
        max-width: 40%;
        overflow-wrap: anywhere;
        font-weight: var(--ha-font-weight-medium);
      }
      .explain .unsupported span {
        color: var(--error-color);
      }
      .risk li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background-color: var(--primary-background-color);
      }
      .risk .level {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-bold);
      }
      .risk .high .level {
        color: var(--error-color);
      }
      .risk .medium .level {
        color: var(--warning-color);
      }
      .marked {
        margin: 0;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background-color: var(--primary-background-color);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 240px;
        overflow-y: auto;
        font-size: var(--ha-font-size-m);
        line-height: 1.6;
        min-height: 1.6em;
      }
      mark {
        background-color: rgba(67, 160, 71, 0.3);
        color: inherit;
        border-radius: 4px;
        padding: 1px 0;
      }
      mark.odd {
        background-color: rgba(0, 99, 155, 0.25);
      }
      mark.selected {
        outline: 2px solid var(--primary-color);
      }
      mark.empty {
        padding: 1px 1px;
        outline: 1px solid var(--success-color);
      }
      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        font-weight: var(--ha-font-weight-medium);
      }
      dl {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      dt {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        margin-top: var(--ha-space-1);
      }
      dd {
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--ha-space-2);
        overflow-wrap: anywhere;
      }
      .cases li,
      .saved li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .cases li {
        flex-wrap: wrap;
      }
      .case-text {
        flex: 1 1 200px;
        min-width: 0;
      }
      .case-expect {
        flex: 0 1 180px;
        min-width: 0;
      }
      .verdict {
        flex: none;
        min-width: var(--ha-space-10);
        font-weight: var(--ha-font-weight-bold);
        font-size: var(--ha-font-size-s);
      }
      .verdict.pass {
        color: var(--success-color);
      }
      .verdict.fail {
        color: var(--error-color);
      }
      .entry {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        flex: 1;
        min-width: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background-color: var(--primary-background-color);
        text-align: start;
      }
      .entry code {
        overflow-wrap: anywhere;
        font-size: var(--ha-font-size-s);
      }
      .entry-name {
        font-weight: var(--ha-font-weight-medium);
      }
      table {
        border-collapse: collapse;
        width: 100%;
        font-variant-numeric: tabular-nums;
      }
      th,
      td {
        text-align: start;
        padding: var(--ha-space-1) var(--ha-space-2);
        border-bottom: 1px solid var(--divider-color);
      }
      th {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .capabilities li {
        display: flex;
        justify-content: space-between;
        gap: var(--ha-space-3);
        padding: var(--ha-space-1) 0;
        border-bottom: 1px solid var(--divider-color);
      }
      .capabilities .state {
        flex: none;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
      }
      .capabilities .yes .state {
        color: var(--success-color);
      }
      .capabilities .no .state {
        color: var(--secondary-text-color);
      }
      .footer {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        padding: var(--ha-space-3) var(--ha-space-6) var(--ha-space-4);
        border-top: 1px solid var(--divider-color);
        flex: none;
      }
      .origin {
        flex: 1;
        min-width: 160px;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .text {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-2);
        min-height: var(--ha-space-10);
        padding: 0 var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        font-weight: var(--ha-font-weight-medium);
        color: var(--primary-color);
        white-space: nowrap;
        --mdc-icon-size: 18px;
      }
      .text:hover {
        background-color: var(--card-background-color);
      }
      .spacer {
        flex: 1;
      }
      .more-wrap {
        position: relative;
        display: flex;
      }
      .scrim {
        position: absolute;
        inset: 0;
        z-index: 2;
        background-color: rgba(0, 0, 0, 0.32);
      }
      .scrim.clear {
        background: none;
      }
      .menu {
        position: absolute;
        z-index: 3;
        display: flex;
        flex-direction: column;
        min-width: 180px;
        padding: var(--ha-space-2) 0;
        border-radius: var(--ha-border-radius-xl);
        background-color: var(--card-background-color);
        box-shadow:
          0 4px 8px 3px rgba(0, 0, 0, 0.15),
          0 1px 3px rgba(0, 0, 0, 0.3);
      }
      .menu.up {
        inset-inline-start: 0;
        bottom: calc(100% + var(--ha-space-1));
      }
      .menu.down {
        inset-inline-end: var(--ha-space-4);
        top: calc(100% - var(--ha-space-1));
      }
      .menu button {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 48px;
        padding: 0 var(--ha-space-4);
        text-align: start;
        white-space: nowrap;
        --mdc-icon-size: 20px;
      }
      .menu button:hover {
        background-color: var(--primary-background-color);
      }
      .menu button[aria-checked="true"] {
        font-weight: var(--ha-font-weight-bold);
        color: var(--primary-color);
      }
      .flags-chip {
        display: inline-flex;
        align-items: center;
        flex: none;
        gap: var(--ha-space-1);
        min-height: var(--ha-space-10);
        padding: 0 var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background-color: var(--ha-color-fill-primary-normal-resting);
        color: var(--ha-color-on-primary-normal, var(--primary-text-color));
        font-weight: var(--ha-font-weight-medium);
        --mdc-icon-size: 20px;
      }
      .modebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) var(--ha-space-4) var(--ha-space-2);
      }
      .sheet {
        position: absolute;
        z-index: 3;
        inset-inline: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        max-height: 90%;
        padding: var(--ha-space-2) var(--ha-space-6) var(--ha-space-4);
        border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0
          0;
        background-color: var(--primary-background-color);
        overflow-y: auto;
        box-sizing: border-box;
      }
      .sheet > * {
        flex-shrink: 0;
      }
      .handle {
        align-self: center;
        width: 32px;
        height: 4px;
        border-radius: 2px;
        background-color: var(--divider-color);
      }
      .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
      }
      .sheet-head h3 {
        margin: 0;
      }
      .flag-rows {
        display: flex;
        flex-direction: column;
      }
      .flag-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        min-height: 48px;
        text-align: start;
      }
      .flag-row code {
        flex: none;
        width: var(--ha-space-5);
        color: var(--primary-color);
        font-weight: var(--ha-font-weight-bold);
      }
      .flag-name {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .track {
        position: relative;
        flex: none;
        width: 52px;
        height: 32px;
        box-sizing: border-box;
        border-radius: 16px;
        border: 2px solid var(--outline-hover-color);
        background-color: var(--card-background-color);
      }
      .thumb {
        position: absolute;
        top: 6px;
        inset-inline-start: 6px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: var(--outline-hover-color);
        transition: inset-inline-start 120ms ease;
      }
      .flag-row[aria-checked="true"] .track {
        border-color: var(--primary-color);
        background-color: var(--primary-color);
      }
      .flag-row[aria-checked="true"] .thumb {
        inset-inline-start: 22px;
        width: 24px;
        height: 24px;
        top: 2px;
        background-color: var(--text-primary-color, #fff);
      }
      @media (prefers-reduced-motion: reduce) {
        .thumb {
          transition: none;
        }
      }
      .more-tab {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1);
        max-width: 100%;
      }
      .more-tab ha-svg-icon {
        flex: none;
        --mdc-icon-size: 18px;
      }
      .more-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .narrow h2 {
        white-space: normal;
      }
      .narrow .top {
        padding: var(--ha-space-4) var(--ha-space-3) var(--ha-space-1)
          var(--ha-space-4);
      }
      .narrow .pattern-area {
        padding: 0 var(--ha-space-4) var(--ha-space-2);
      }
      .narrow .tabs {
        gap: 0;
        padding: var(--ha-space-1) var(--ha-space-3);
      }
      .narrow .tabs button {
        padding: 0 var(--ha-space-3);
        min-width: 0;
      }
      .narrow .body {
        padding: var(--ha-space-3) var(--ha-space-4);
      }
      .narrow .footer {
        padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-3);
      }
      .narrow .origin {
        flex-basis: 100%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .narrow .footer .filled {
        padding: 0 var(--ha-space-4);
      }
      /* Touch targets: every control is at least 44 px on a touch screen. */
      @media (pointer: coarse) {
        .segments button,
        .tabs button,
        .chip,
        .flags-chip,
        .text,
        .filled,
        .icon {
          min-height: 44px;
        }
        .segments button,
        .tabs button {
          height: 44px;
        }
        .icon {
          width: 44px;
          height: 44px;
        }
        .chip {
          min-width: 44px;
        }
      }
      .narrow .segments button,
      .narrow .tabs button,
      .narrow .chip,
      .narrow .flags-chip,
      .narrow .text,
      .narrow .filled {
        min-height: 44px;
      }
      .narrow .segments button,
      .narrow .tabs button {
        height: 44px;
      }
      .narrow .icon {
        width: 44px;
        height: 44px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-regex-workbench": HaRegexWorkbench;
  }
}
