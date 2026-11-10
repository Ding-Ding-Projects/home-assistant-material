# Design

Design files for the Material Design 3 interface, kept in the repository so the canvas can be
read back from here alone.

- `canvas/canvas.json` is the canvas index: one entry per artboard with its frame and title.
- `canvas/*.dc.html` are the artboards, each a self-contained page.
- `source/` holds the artboard sources before the shared stylesheet (`m3.css`) and icon paths
  (`icons.json`, from the Material Design Icons package the frontend already depends on) are
  inlined. Run `node source/inline-assets.mjs <Name>.dc.html` to rebuild an artboard.

These files are a design proposal. Nothing here is a claim that the interface is implemented,
verified or shipped. `HANDOFF.md` in this folder tracks the state of each pass.
