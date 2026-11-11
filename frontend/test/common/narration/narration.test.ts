import { describe, expect, it } from "vitest";
import {
  accessibleNameOf,
  MAX_SPOKEN_LENGTH,
  nameFromPath,
  narratorSilence,
  pickVoice,
  selectSpeech,
  splitSegments,
} from "../../../src/common/narration/narration";

describe("selectSpeech", () => {
  const both = "Restart · 重新啟動";

  it("splits the two languages the mode joined", () => {
    expect(splitSegments(both)).toEqual(["Restart", "重新啟動"]);
    expect(splitSegments("Restart\n重新啟動")).toEqual(["Restart", "重新啟動"]);
  });

  it("speaks both languages one piece at a time", () => {
    expect(selectSpeech(both, "both")).toEqual([
      { text: "Restart", language: "en" },
      { text: "重新啟動", language: "yue" },
    ]);
  });

  it("keeps only the chosen language", () => {
    expect(selectSpeech(both, "english")).toEqual([
      { text: "Restart", language: "en" },
    ]);
    expect(selectSpeech(both, "cantonese")).toEqual([
      { text: "重新啟動", language: "yue" },
    ]);
  });

  it("says nothing when the text has nothing in the chosen language", () => {
    expect(selectSpeech("Restart", "cantonese")).toEqual([]);
    expect(selectSpeech("", "both")).toEqual([]);
  });
});

describe("pickVoice", () => {
  const voices = [
    { voiceURI: "a", name: "A", lang: "en-US" },
    { voiceURI: "b", name: "B", lang: "en-GB", default: true },
    { voiceURI: "c", name: "C", lang: "zh-HK" },
    { voiceURI: "d", name: "D", lang: "zh-CN" },
  ];

  it("prefers the chosen voice when it speaks the language", () => {
    expect(pickVoice(voices, "en", "a")?.name).toBe("A");
  });

  it("falls back to the default voice for the language", () => {
    expect(pickVoice(voices, "en", "gone")?.name).toBe("B");
    expect(pickVoice(voices, "en", "")?.name).toBe("B");
  });

  it("never offers a Mandarin voice for Cantonese", () => {
    expect(pickVoice(voices, "yue", "")?.name).toBe("C");
    expect(pickVoice(voices, "yue", "d")?.name).toBe("C");
    expect(pickVoice([voices[3]], "yue", "")).toBeUndefined();
  });
});

describe("narratorSilence", () => {
  const base = {
    soundEffects: true,
    lowStimulation: false,
    quietHours: false,
    quietFrom: "22:00",
    quietTo: "07:00",
    quietDays: [0, 1, 2, 3, 4, 5, 6],
  };

  it("speaks when nothing silences it, whatever the sound volume", () => {
    expect(narratorSilence(base)).toBeUndefined();
  });

  it("follows the sound switch, low stimulation and quiet hours", () => {
    expect(narratorSilence({ ...base, soundEffects: false })).toBe("off");
    expect(narratorSilence({ ...base, lowStimulation: true })).toBe(
      "low-stimulation"
    );
    expect(
      narratorSilence(
        { ...base, quietHours: true },
        new Date(2024, 0, 3, 23, 30)
      )
    ).toBe("quiet-hours");
    expect(
      narratorSilence(
        { ...base, quietHours: true },
        new Date(2024, 0, 3, 12, 0)
      )
    ).toBeUndefined();
  });
});

describe("accessibleNameOf", () => {
  const make = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  };

  it("prefers aria-label and trims space", () => {
    const host = make('<button aria-label="  Save   now ">x</button>');
    expect(accessibleNameOf(host.querySelector("button")!)).toBe("Save now");
    host.remove();
  });

  it("reads the text of a button but never the value of a field", () => {
    const host = make('<button>Add</button><input value="secret">');
    expect(accessibleNameOf(host.querySelector("button")!)).toBe("Add");
    expect(accessibleNameOf(host.querySelector("input")!)).toBe("");
    host.remove();
  });

  it("follows aria-labelledby", () => {
    const host = make(
      '<span id="n">Volume</span><div role="slider" aria-labelledby="n"></div>'
    );
    expect(accessibleNameOf(host.querySelector("[role=slider]")!)).toBe(
      "Volume"
    );
    host.remove();
  });

  it("gives nothing for a plain container", () => {
    const host = make("<div>A lot of page text</div>");
    expect(accessibleNameOf(host.firstElementChild!)).toBe("");
    host.remove();
  });

  it("cuts a very long name", () => {
    const host = make(`<button>${"word ".repeat(100)}</button>`);
    expect(
      accessibleNameOf(host.querySelector("button")!).length
    ).toBeLessThanOrEqual(MAX_SPOKEN_LENGTH);
    host.remove();
  });

  it("finds the first name along an event path", () => {
    const host = make('<button aria-label="Open"><span>icon</span></button>');
    const span = host.querySelector("span")!;
    const button = host.querySelector("button")!;
    expect(nameFromPath([span, button, host, document.body])).toBe("Open");
    host.remove();
  });
});
