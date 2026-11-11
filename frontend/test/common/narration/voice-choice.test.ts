import { describe, expect, it } from "vitest";
import {
  languageSubtags,
  localVoicesForTag,
  pickVoice,
  voiceMatchesLanguage,
} from "../../../src/common/narration/narration";

const voice = (lang: string, localService: boolean, isDefault = false) => ({
  voiceURI: `${lang}-${localService ? "local" : "net"}`,
  name: lang,
  lang,
  default: isDefault,
  localService,
});

describe("three-letter language tags", () => {
  it("maps ISO 639-2 codes to the two-letter form", () => {
    expect(languageSubtags("eng-USA")).toEqual(["en", "us"]);
    expect(languageSubtags("eng_GBR")).toEqual(["en", "gb"]);
    expect(languageSubtags("deu-DEU")).toEqual(["de", "de"]);
    expect(languageSubtags("yue-HK")).toEqual(["yue", "hk"]);
  });

  it("lets an English voice reported as eng-USA match English", () => {
    expect(voiceMatchesLanguage({ lang: "eng-USA" }, "en")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "en_US" }, "en")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "zho-HK" }, "en")).toBe(false);
  });

  it("matches Cantonese however the engine spells it", () => {
    expect(voiceMatchesLanguage({ lang: "zh-HK" }, "yue")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "zho-HK" }, "yue")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "yue" }, "yue")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "zh-CN" }, "yue")).toBe(false);
  });
});

describe("the voice used for reading", () => {
  it("never picks a network voice", () => {
    const voices = [voice("en-US", false, true), voice("en-GB", false)];
    expect(pickVoice(voices, "en", "")).toBeUndefined();
    expect(localVoicesForTag(voices, "en")).toEqual([]);
  });

  it("picks an on-device voice even when the default is a network voice", () => {
    const local = voice("eng-USA", true);
    const voices = [voice("en-US", false, true), local];
    expect(localVoicesForTag(voices, "en")[0]).toBe(local);
  });

  it("prefers a full match, then the default, and ignores other languages", () => {
    const de = voice("de-DE", true, true);
    const at = voice("de-AT", true);
    const fr = voice("fr-FR", true);
    expect(localVoicesForTag([de, fr, at], "de-AT")).toEqual([at, de]);
    expect(localVoicesForTag([fr], "de")).toEqual([]);
  });

  it("finds nothing for an empty tag", () => {
    expect(localVoicesForTag([voice("en-US", true)], "")).toEqual([]);
  });
});
