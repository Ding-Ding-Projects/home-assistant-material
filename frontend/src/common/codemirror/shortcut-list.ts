/**
 * Builds the list of keyboard shortcuts shown by the code editor from the
 * editor's real key bindings.
 *
 * The keys always come from the keymaps the editor is created with, so a
 * binding that is removed from the editor disappears from the list. The
 * editor commands themselves carry no names, so a label is looked up by the
 * binding's generic key. A binding without a label is counted, not listed.
 */

export type ShortcutPlatform = "mac" | "win" | "linux";

/** The parts of a CodeMirror key binding that the list needs. */
export interface ShortcutBindingLike {
  key?: string;
  mac?: string;
  win?: string;
  linux?: string;
}

export type ShortcutGroup = "find" | "history" | "lines" | "edit" | "help";

/** Where a labelled binding is listed and the translation suffix naming it. */
export const SHORTCUT_LABELS: Record<
  string,
  { group: ShortcutGroup; label: string }
> = {
  "Mod-f": { group: "find", label: "find" },
  "Mod-g": { group: "find", label: "find_next" },
  F3: { group: "find", label: "find_next" },
  "Mod-d": { group: "find", label: "select_next_match" },
  "Mod-Shift-l": { group: "find", label: "select_all_matches" },
  "Mod-Alt-g": { group: "find", label: "go_to_line" },
  "Mod-z": { group: "history", label: "undo" },
  "Mod-y": { group: "history", label: "redo" },
  "Mod-u": { group: "history", label: "undo_selection" },
  "Alt-ArrowUp": { group: "lines", label: "move_line_up" },
  "Alt-ArrowDown": { group: "lines", label: "move_line_down" },
  "Shift-Alt-ArrowUp": { group: "lines", label: "copy_line_up" },
  "Shift-Alt-ArrowDown": { group: "lines", label: "copy_line_down" },
  "Shift-Mod-k": { group: "lines", label: "delete_line" },
  "Mod-Enter": { group: "lines", label: "insert_line_below" },
  "Mod-Alt-ArrowUp": { group: "lines", label: "cursor_above" },
  "Mod-Alt-ArrowDown": { group: "lines", label: "cursor_below" },
  "Mod-/": { group: "edit", label: "comment" },
  "Alt-A": { group: "edit", label: "block_comment" },
  "Mod-]": { group: "edit", label: "indent" },
  "Mod-[": { group: "edit", label: "outdent" },
  Tab: { group: "edit", label: "indent_tab" },
  "Shift-Tab": { group: "edit", label: "outdent_tab" },
  "Mod-Alt-\\": { group: "edit", label: "indent_selection" },
  "Mod-a": { group: "edit", label: "select_all" },
  "Mod-i": { group: "edit", label: "select_parent" },
  "Shift-Mod-\\": { group: "edit", label: "matching_bracket" },
  "Mod-s": { group: "edit", label: "save" },
  "Mod-Shift-m": { group: "edit", label: "show_problems" },
  F8: { group: "edit", label: "next_problem" },
  "Ctrl-m": { group: "help", label: "tab_focus_mode" },
  "?": { group: "help", label: "this_list" },
  "Mod-?": { group: "help", label: "this_list" },
};

export interface ShortcutEntry {
  group: ShortcutGroup;
  label: string;
  /** Each way of pressing it; each combination is a list of key names. */
  combos: string[][];
}

const MODIFIERS: Record<string, string> = {
  mod: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  cmd: "Cmd",
  meta: "Cmd",
};

const MAC_SYMBOLS: Record<string, string> = {
  Mod: "⌘",
  Cmd: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Backspace: "⌫",
  Delete: "Del",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

/** Splits "Shift-Mod-k" into its modifiers and its key, keeping "-" itself. */
export const parseKeySpec = (spec: string): string[] => {
  const parts: string[] = [];
  let rest = spec;
  while (rest.length > 1) {
    const dash = rest.indexOf("-");
    if (dash <= 0 || dash === rest.length - 1) {
      break;
    }
    const head = rest.slice(0, dash);
    if (!MODIFIERS[head.toLowerCase()]) {
      break;
    }
    parts.push(MODIFIERS[head.toLowerCase()]);
    rest = rest.slice(dash + 1);
  }
  parts.push(rest);
  return parts;
};

/** The names to show for one combination such as "Mod-Shift-l". */
export const formatKeySpec = (
  spec: string,
  platform: ShortcutPlatform
): string[] => {
  const parts = parseKeySpec(spec);
  const mac = platform === "mac";
  return parts.map((part, index) => {
    const isKey = index === parts.length - 1;
    if (!isKey) {
      if (part === "Mod") {
        return mac ? MAC_SYMBOLS.Mod : "Ctrl";
      }
      if (part === "Cmd") {
        return mac ? MAC_SYMBOLS.Cmd : "Meta";
      }
      return mac ? MAC_SYMBOLS[part] : part;
    }
    if (KEY_NAMES[part]) {
      return KEY_NAMES[part];
    }
    return part.length === 1 ? part.toUpperCase() : part;
  });
};

const specFor = (
  binding: ShortcutBindingLike,
  platform: ShortcutPlatform
): string | undefined => {
  const own = binding[platform];
  return own ?? binding.key;
};

/**
 * Lists the labelled shortcuts of the given bindings, grouped and without
 * duplicates. Bindings without a label are returned as `unlabelled`.
 */
export const buildShortcutList = (
  bindings: readonly ShortcutBindingLike[],
  platform: ShortcutPlatform
): { entries: ShortcutEntry[]; unlabelled: number } => {
  const byLabel = new Map<string, ShortcutEntry>();
  let unlabelled = 0;
  for (const binding of bindings) {
    const spec = specFor(binding, platform);
    const known = binding.key ? SHORTCUT_LABELS[binding.key] : undefined;
    if (!spec || !known) {
      if (spec) {
        unlabelled++;
      }
      continue;
    }
    const combo = formatKeySpec(spec, platform);
    const existing = byLabel.get(known.label);
    if (existing) {
      if (!existing.combos.some((c) => c.join("+") === combo.join("+"))) {
        existing.combos.push(combo);
      }
    } else {
      byLabel.set(known.label, {
        group: known.group,
        label: known.label,
        combos: [combo],
      });
    }
  }
  return { entries: [...byLabel.values()], unlabelled };
};
