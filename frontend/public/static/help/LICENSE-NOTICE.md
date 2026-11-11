# Offline help articles: licence and source

The articles in this folder are copies of pages from the Home Assistant
documentation, published at https://www.home-assistant.io and maintained in
https://github.com/home-assistant/home-assistant.io.

- Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (https://creativecommons.org/licenses/by-nc-sa/4.0/).
  This interface is free of charge. Reuse of the text and images carries the
  same licence, so every file in this folder is available under it.
- Attribution: text and images by the Home Assistant documentation authors
  and contributors, Open Home Foundation.
- Changes: the pages were converted from Jekyll Markdown to plain Markdown.
  Nothing of the explanatory text was rewritten, but the conversion changes
  the following, and nothing else:
  - Front matter became metadata. A page's title is its front matter title,
    else (for an integration page) the integration's name, else its first
    heading.
  - Liquid tags were reduced to plain text: a glossary term became its
    word, a link to My Home Assistant became its title text, an icon became
    its name, notes, tips and warnings became block quotes, configuration
    blocks became code blocks, and any other tag (includes, for example) was
    removed together with the content it would have inserted. Text that such
    an include would have inserted is therefore not part of these copies.
  - Raw HTML was removed and its text kept; text in angle brackets that is
    not a real HTML element (for example a placeholder such as
    "&lt;domain&gt;") was kept as visible text. Scripts, styles, frames and
    similar elements were removed with their content.
  - Table rows with fewer or more cells than their header were evened out.
  - A link to a section of the same page that does not exist became plain
    text.
  - Pages with no text of their own were left out.
  - When the interface shows a page, links to pages that are not bundled
    become plain text with a note, and so does every link to another site,
    so the interface never opens the website or another site.
  Images that live in the documentation repository were copied
  unchanged when they are PNG, JPEG or WebP, smaller than 300 KB and within
  the 20 MB total; every other image is marked "image not included" in the
  article. SVG images are never included.
- Source: each page records its source file, the commit it was taken from
  and the date it was fetched. This folder was last synchronized from
  commit 6f38b5b48d737b455deeeeed2e82be53b0cee294 on 2026-11-11.
- Contents at that time: 40 articles, 1390 integration pages, 204 images.
- Refresh: `node build-scripts/sync-help-articles.mjs`, run by the
  maintainer. The interface never fetches these files at run time.
