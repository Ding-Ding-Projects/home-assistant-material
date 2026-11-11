/**
 * The English text the reader needs before anything else is loaded. The
 * sign-in page has no translations, and the reader loads the English
 * translation file only after it opens, so without these the first moments
 * of the reader would show empty labels. They must equal the same keys of
 * `ui.help` in `translations/en.json` (a test checks this); every other
 * string waits for the translation file.
 */
export const HELP_LITERAL_TEXT: Record<string, string> = {
  title: "Help article",
  search: "Search help articles",
  back: "Back",
  contents: "In this article",
  loading: "Loading the article…",
  error: "The article could not be loaded.",
  no_results: "No help article matches.",
  not_bundled_title: "This article is not included in this build",
  not_bundled_body:
    "The offline copy of {path} has not been bundled with this interface yet. Help never opens the website, so there is nothing to show here until the article is added.",
  not_included: "not included in this build",
  all_title: "All help articles",
  home_intro:
    "Everything here is stored with this interface and works without a connection. Search, or pick a section.",
  back_to_list: "All help articles",
};
