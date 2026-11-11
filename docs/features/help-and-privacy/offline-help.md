# Offline help

Code: `frontend/src/components/help/`, `frontend/src/common/page/help-articles.ts`,
`frontend/src/util/documentation-url.ts`, `frontend/build-scripts/sync-help-articles.mjs`,
`frontend/build-scripts/help-articles-convert.mjs`, `frontend/public/static/help/`.

## What it does

Every help link opens a copy of the article inside the interface, including on the sign-in page.
Nothing opens a new tab or another browser for help, and community links are removed. The
folder holds 40 articles, 1,392 integration pages and 189 images, each article recording its
source file, the commit it came from and the date it was fetched. The interface never fetches
them at run time; the maintainer refreshes them with
`node build-scripts/sync-help-articles.mjs`.

## Licence

The articles are copies of pages from the Home Assistant documentation, available under
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International. Attribution: the Home
Assistant documentation authors and contributors, Open Home Foundation. The full notice, what
was changed (Jekyll converted to plain Markdown, Liquid tags reduced to text, raw HTML removed,
links to unbundled pages and to other sites turned into plain text, images over 300 KB and all
SVG images left out) and the source commit are in `frontend/public/static/help/LICENSE-NOTICE.md`.

## Security

The reader is the trust boundary: it renders plain Markdown, and article paths are validated
against a strict slug pattern and the documentation host pattern before an article is looked up.

## Verification

The Help tool with 12 articles was seen in a running build
(`../../screenshots/page-tools-help.png`). The reader, the full set of articles and the links on
the sign-in page have not been seen. Several reviewer findings were fixed in source; the others
are listed in `../../HANDOFF.md`.
