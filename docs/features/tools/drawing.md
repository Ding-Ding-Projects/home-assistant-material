# Drawing board

Code: `frontend/src/panels/config/tools/drawing/`, `frontend/src/common/drawing/`.

## What it does

Tools, Drawing is a board for sketching and annotating a picture: a pen and a highlighter
(with pressure where the device reports it), lines, arrows, rectangles, ellipses, text, an
eraser, an eyedropper, undo and redo, zoom and fit, and saving as an image or as SVG. A drawing
is held as plain data (a list of shapes) and drawn from it, and a text description of each
shape, saying which part of the page it sits in, is produced (`common/drawing/describe.ts`).

## Verification

Unit tests only (`frontend/test/common/drawing/`). Not seen in a running build.
