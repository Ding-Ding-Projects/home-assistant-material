// Runs the production template minifier (the same options as
// minify-template-literals-loader.cjs, with the legacy browser targets) over
// source files and reports any lit template it cannot keep intact.
//
// The development and demo builds do not minify templates, so a template
// that breaks the minifier is only found by a production build. Typical
// cause: an expression inside an inline `style="..."` attribute, which the
// CSS step may duplicate when it expands a logical property for old browsers.
// Use the `styleMap` directive there instead.
//
// Usage: node build-scripts/check-minify-templates.mjs <file.ts> [...]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { minifyHTMLLiterals } from "minify-literals";
import browserslist from "browserslist";
import { browserslistToTargets, Features } from "lightningcss";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const html = {
  caseSensitive: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  decodeEntities: true,
  keepClosingSlash: true,
  removeComments: true,
  removeRedundantAttributes: true,
};

let failed = 0;
for (const env of ["modern", "legacy"]) {
  const targets = browserslistToTargets(browserslist(null, { env }));
  for (const file of process.argv.slice(2)) {
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: "ES2021",
        module: "ESNext",
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    }).outputText;
    try {
      // One file at a time, so a failure names its file.
      // eslint-disable-next-line no-await-in-loop
      await minifyHTMLLiterals(code, {
        fileName: file,
        html,
        css: {
          targets,
          include: env === "legacy" ? Features.HexAlphaColors : 0,
        },
      });
    } catch (err) {
      failed++;
      console.error(`${env}: ${file}: ${err.message}`);
    }
  }
}
if (failed) {
  process.exit(1);
}
console.log(`${process.argv.length - 2} files pass the template minifier.`);
