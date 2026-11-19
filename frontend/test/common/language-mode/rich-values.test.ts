import { afterEach, describe, expect, it } from "vitest";
import {
  fillPlaceholderParts,
  flattenStrings,
  modeText,
  setYueStringsForTest,
} from "../../../src/common/language-mode/language-mode";
import yueSource from "../../../src/translations/yue-own.json";

// A string whose value is a link template comes back from the translation
// system as a list of parts. Before rich values were handled, the Cantonese
// text printed "[object Object]" in place of the link, and both mode joined
// the parts as text.
const link = { kind: "link" };
const localize = (key: string, values?: Record<string, unknown>) =>
  (key === "t.read" ? ["Read ", values?.link, "."] : "") as unknown as string;

afterEach(() => setYueStringsForTest(flattenStrings(yueSource)));

describe("rich placeholder values", () => {
  it("keeps the link object in the Cantonese parts", () => {
    expect(fillPlaceholderParts("睇{link}。", { link })).toEqual([
      "睇",
      link,
      "。",
    ]);
    expect(fillPlaceholderParts("{n} 個", { n: 3 })).toEqual(["3", " 個"]);
  });

  it("gives the parts for each mode", () => {
    setYueStringsForTest({ "t.read": "睇{link}。" });
    const values = { link } as unknown as Record<string, string>;
    expect(modeText(localize, "t.read", values, "english")).toEqual([
      "Read ",
      link,
      ".",
    ]);
    expect(modeText(localize, "t.read", values, "cantonese")).toEqual([
      "睇",
      link,
      "。",
    ]);
    expect(modeText(localize, "t.read", values, "bilingual")).toEqual([
      "Read ",
      link,
      ".",
      " · ",
      "睇",
      link,
      "。",
    ]);
  });

  it("stays English when the key has no Cantonese", () => {
    setYueStringsForTest({});
    const values = { link } as unknown as Record<string, string>;
    expect(modeText(localize, "t.read", values, "cantonese")).toEqual([
      "Read ",
      link,
      ".",
    ]);
  });
});
