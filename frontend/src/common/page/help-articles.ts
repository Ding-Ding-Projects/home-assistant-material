/**
 * The help articles that ship with the interface, so help is there
 * without a connection. The text of each is in the translations, under
 * `ui.page_tools.help_panel.articles.<id>`.
 */

export const HELP_ARTICLES = [
  "find",
  "patterns",
  "appearance",
  "read_aloud",
  "history",
  "export",
  "locks",
  "tabs",
  "menu",
  "wording",
  "automation_history",
  "shortcuts",
] as const;

export type HelpArticle = (typeof HELP_ARTICLES)[number];
