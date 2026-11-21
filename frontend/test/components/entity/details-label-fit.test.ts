import { describe, expect, it } from "vitest";
import {
  detailsLabelFit,
  estimateLabelWidth,
} from "../../../src/components/entity/details-label-fit";
import { capitalizeSentence } from "../../../src/panels/config/automation/editor-frame/automation-sentence";

// A details label written in both languages is wider than its column on a
// phone; it must go above its value instead of running into it.

describe("details label fit", () => {
  it("keeps a short English label beside its value", () => {
    expect(detailsLabelFit("State")).toEqual({
      "label-over-narrow": false,
      "label-over-wide": false,
    });
  });

  it("puts a label in both languages above its value on a phone", () => {
    const fit = detailsLabelFit("Last changed · 上次改變");
    expect(fit["label-over-narrow"]).toBe(true);
  });

  it("counts Chinese characters as wider than Latin ones", () => {
    expect(estimateLabelWidth("上次改變")).toBeGreaterThan(
      estimateLabelWidth("abcd")
    );
  });
});

describe("one-sentence summary", () => {
  it("starts with a capital letter", () => {
    expect(capitalizeSentence("then Light: Turn off light.")).toBe(
      "Then Light: Turn off light."
    );
  });

  it("leaves a sentence that already starts well", () => {
    expect(capitalizeSentence("When the sun sets, then x.")).toBe(
      "When the sun sets, then x."
    );
    expect(capitalizeSentence("然後關燈。")).toBe("然後關燈。");
    expect(capitalizeSentence("")).toBe("");
  });
});
