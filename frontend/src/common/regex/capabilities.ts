import { SUPPORTED_FLAGS } from "./query";

/**
 * What this browser's regular expression engine can do, found by trying each
 * feature, and what no JavaScript engine does. The workbench shows the list
 * so that a missing feature is stated, not hidden.
 */

export type CapabilityId =
  | "lookahead"
  | "lookbehind"
  | "named_groups"
  | "duplicate_named_groups"
  | "unicode_properties"
  | "unicode_sets"
  | "match_indices"
  | "dot_all"
  | "sticky"
  | "modifiers"
  | "lazy"
  | "backreferences"
  | "possessive"
  | "atomic"
  | "conditionals"
  | "recursion"
  | "free_spacing"
  | "posix_classes"
  | "absolute_anchors"
  | "keep_out"
  | "control_verbs"
  | "step_trace";

export interface Capability {
  id: CapabilityId;
  supported: boolean;
  /**
   * `engine`: depends on the browser, tested here.
   * `language`: not part of JavaScript regular expressions in any browser.
   */
  scope: "engine" | "language";
}

const compiles = (source: string, flags = ""): boolean => {
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, flags);
    return true;
  } catch (_err) {
    return false;
  }
};

const hasFlag = (flag: string) => (SUPPORTED_FLAGS as string[]).includes(flag);

export const getCapabilities = (): Capability[] => [
  { id: "lookahead", supported: compiles("a(?=b)(?!c)"), scope: "engine" },
  { id: "lookbehind", supported: compiles("(?<=a)(?<!b)c"), scope: "engine" },
  { id: "named_groups", supported: compiles("(?<n>a)\\k<n>"), scope: "engine" },
  {
    id: "duplicate_named_groups",
    supported: compiles("(?<n>a)|(?<n>b)"),
    scope: "engine",
  },
  { id: "lazy", supported: compiles("a+?"), scope: "engine" },
  { id: "backreferences", supported: compiles("(a)\\1"), scope: "engine" },
  {
    id: "unicode_properties",
    supported: hasFlag("u") && compiles("\\p{L}", "u"),
    scope: "engine",
  },
  {
    id: "unicode_sets",
    supported: hasFlag("v") && compiles("[\\p{L}--[a-z]]", "v"),
    scope: "engine",
  },
  { id: "match_indices", supported: hasFlag("d"), scope: "engine" },
  { id: "dot_all", supported: hasFlag("s"), scope: "engine" },
  { id: "sticky", supported: hasFlag("y"), scope: "engine" },
  { id: "modifiers", supported: compiles("(?i:a)"), scope: "engine" },
  { id: "possessive", supported: false, scope: "language" },
  { id: "atomic", supported: false, scope: "language" },
  { id: "conditionals", supported: false, scope: "language" },
  { id: "recursion", supported: false, scope: "language" },
  { id: "free_spacing", supported: false, scope: "language" },
  { id: "posix_classes", supported: false, scope: "language" },
  { id: "absolute_anchors", supported: false, scope: "language" },
  { id: "keep_out", supported: false, scope: "language" },
  { id: "control_verbs", supported: false, scope: "language" },
  { id: "step_trace", supported: false, scope: "language" },
];

export interface EngineInfo {
  /** The engine's name when the browser can be recognised. */
  engine?: "V8" | "SpiderMonkey" | "JavaScriptCore";
  browser?: string;
  version?: string;
}

/** The engine and browser version, read from the user agent. */
export const getEngineInfo = (
  userAgent: string = navigator.userAgent
): EngineInfo => {
  const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
  if (firefox) {
    return { engine: "SpiderMonkey", browser: "Firefox", version: firefox[1] };
  }
  const edge = /Edg\/([\d.]+)/.exec(userAgent);
  if (edge) {
    return { engine: "V8", browser: "Edge", version: edge[1] };
  }
  const chrome = /(?:Chrome|Chromium|CriOS)\/([\d.]+)/.exec(userAgent);
  if (chrome) {
    return { engine: "V8", browser: "Chromium", version: chrome[1] };
  }
  const safari = /Version\/([\d.]+).*Safari/.exec(userAgent);
  if (safari || /AppleWebKit/.test(userAgent)) {
    return {
      engine: "JavaScriptCore",
      browser: "Safari",
      version: safari?.[1],
    };
  }
  return {};
};
