import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_LITERAL_TEXT } from "../../../src/components/help/help-literal-text";

describe("the reader's literal English text", () => {
  it("equals the same keys of ui.help in the English translation file", () => {
    const en = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../../src/translations/en.json"),
        "utf8"
      )
    ) as { ui: { help: Record<string, unknown> } };
    for (const [key, text] of Object.entries(HELP_LITERAL_TEXT)) {
      expect(en.ui.help[key], key).toBe(text);
    }
  });
});
