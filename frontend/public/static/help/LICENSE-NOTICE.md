# Offline help articles: licence and source

The articles in this folder are copies of pages from the Home Assistant
documentation, published at https://www.home-assistant.io and maintained in
https://github.com/home-assistant/home-assistant.io.

- Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (https://creativecommons.org/licenses/by-nc-sa/4.0/).
  This interface is free of charge. Reuse of the text carries the same
  licence, so every article in this folder is available under it.
- Attribution: text by the Home Assistant documentation authors and
  contributors, Open Home Foundation.
- Changes: the pages were converted from Jekyll Markdown to plain Markdown.
  Front matter was turned into metadata, Liquid tags were removed or reduced
  to plain text, raw HTML was removed, and images were not included. The
  wording of the text itself is unchanged.
- Source: each article records its source file, the commit it was taken
  from and the date it was fetched. This folder was last synchronized from
  commit 6f38b5b48d737b455deeeeed2e82be53b0cee294 on 2026-11-11.
- Refresh: `node build-scripts/sync-help-articles.mjs`, run by the
  maintainer. The interface never fetches these files at run time.
