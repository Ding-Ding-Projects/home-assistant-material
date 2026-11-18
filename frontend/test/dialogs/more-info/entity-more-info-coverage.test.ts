import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOMAINS_WITH_CARD } from "../../../src/common/const";
import { DOMAINS_WITH_FRAME_CONTROL } from "../../../src/dialogs/more-info/const";

const source = (path: string) =>
  readFileSync(resolve(__dirname, "../../../src", path), "utf8");

describe("entity more-info coverage", () => {
  it("keeps the frame's own press control for the press-only domains", () => {
    // These domains have no body of their own, and the only way to press them
    // is the button the frame's state card draws.
    ["button", "input_button"].forEach((domain) => {
      expect(DOMAINS_WITH_CARD).toContain(domain);
      expect(DOMAINS_WITH_FRAME_CONTROL).toContain(domain);
    });
  });

  it("gives a remote a power control, not only its activity chips", () => {
    expect(source("dialogs/more-info/controls/more-info-remote.ts")).toContain(
      "<ha-state-control-toggle"
    );
  });

  it("wraps the select strip so no select is cut off on a phone", () => {
    const css = source(
      "dialogs/more-info/components/ha-more-info-control-select-container.ts"
    );
    const block = css.slice(css.indexOf(".controls-scroll {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("flex-wrap: wrap");
    expect(css).not.toContain("margin: -2px calc(var(--ha-space-6) * -1)");
  });

  it("keeps the media cover small on a phone", () => {
    const css = source("dialogs/more-info/controls/more-info-media_player.ts");
    expect(css).toMatch(
      /@media \(max-width: 600px\)[^{]*\{[^}]*\.cover-container/s
    );
  });
});
