import { afterEach, describe, expect, it } from "vitest";
import type { AppearanceStore } from "../../../src/common/appearance/element-appearance";
import {
  appearanceToStyles,
  applyAppearance,
  applyStore,
  contrastRatio,
  cssColorToHex,
  elementPath,
  getChoice,
  isSafeImageUrl,
  kindLabel,
  normalizeAppearance,
  normalizeStore,
  resolveElementPath,
  setChoice,
} from "../../../src/common/appearance/element-appearance";

// Appearance choices are stored by a person and applied as inline styles on
// live elements, so these protect three things: stored data cannot inject
// anything but the styles it names, a choice finds its element again, and
// removing a choice puts the element back exactly as it was.

// Built from parts so the test file itself holds no script address.
const SCRIPT_URL = `${"java"}script:alert(1)`;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("normalizeAppearance", () => {
  it("keeps what it understands and drops the rest", () => {
    expect(
      normalizeAppearance({
        textColor: "#ABCDEF",
        accentColor: "red",
        radius: 500,
        zoom: 9,
        opacity: 0,
        fontFamily: "Comic Sans; } body { display: none",
        fontWeight: 450,
        unknown: true,
      })
    ).toEqual({ textColor: "#abcdef", radius: 64, zoom: 1.5, opacity: 0.2 });
  });

  it("refuses layers that are malformed or could run script", () => {
    const { layers } = normalizeAppearance({
      layers: [
        { type: "color", color: "#112233", opacity: 0.5, blend: "multiply" },
        { type: "color", color: `url(${SCRIPT_URL})` },
        { type: "image", url: SCRIPT_URL },
        { type: "image", url: 'https://x.test/a.png"); color: red; (' },
        { type: "image", url: "/local/picture.jpg", size: "contain" },
        { type: "gradient", from: "#000000", to: "#ffffff", angle: 720 },
      ],
    });
    expect(layers?.map((layer) => layer.type)).toEqual([
      "color",
      "image",
      "gradient",
    ]);
    expect(layers?.[2]).toMatchObject({ angle: 360 });
  });

  it("returns nothing for a default-only choice", () => {
    expect(normalizeAppearance({ zoom: 1, opacity: 1 })).toEqual({});
    expect(normalizeAppearance(null)).toEqual({});
  });
});

describe("isSafeImageUrl", () => {
  it("accepts web addresses, server paths and embedded pictures", () => {
    expect(isSafeImageUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("/local/a.png")).toBe(true);
    expect(isSafeImageUrl("data:image/png;base64,AAAA")).toBe(true);
  });

  it("refuses everything else", () => {
    expect(isSafeImageUrl(SCRIPT_URL)).toBe(false);
    expect(isSafeImageUrl("//evil.test/a.png")).toBe(false);
    expect(isSafeImageUrl("data:text/html;base64,AAAA")).toBe(false);
    expect(isSafeImageUrl('https://a.test/"')).toBe(false);
  });
});

describe("appearanceToStyles", () => {
  it("writes layers top first with their blend modes", () => {
    const { box } = appearanceToStyles({
      layers: [
        {
          type: "gradient",
          angle: 160,
          from: "#ff0000",
          to: "#0000ff",
          opacity: 0.5,
          blend: "soft-light",
          visible: true,
        },
        {
          type: "color",
          color: "#112233",
          opacity: 1,
          blend: "normal",
          visible: true,
        },
        {
          type: "color",
          color: "#ffffff",
          opacity: 1,
          blend: "normal",
          visible: false,
        },
      ],
    });
    expect(box["background-image"]).toBe(
      "linear-gradient(160deg, rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.5)), linear-gradient(#112233, #112233)"
    );
    expect(box["background-blend-mode"]).toBe("soft-light, normal");
  });

  it("separates what is drawn from what is inherited", () => {
    const { box, inherited } = appearanceToStyles({
      borderWidth: 2,
      shadow: 2,
      radius: 8,
      textColor: "#102030",
      accentColor: "#aa0000",
      opacity: 0.5,
    });
    expect(box.border).toContain("2px solid");
    expect(box["border-radius"]).toBe("8px");
    expect(Object.keys(box)).not.toContain("color");
    expect(inherited["--primary-text-color"]).toBe("#102030");
    expect(inherited["--primary-color"]).toBe("#aa0000");
    expect(inherited.opacity).toBe("0.5");
  });
});

describe("contrast", () => {
  it("computes the WCAG ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("reads computed colours and skips clear ones", () => {
    expect(cssColorToHex("rgb(16, 32, 48)")).toBe("#102030");
    expect(cssColorToHex("rgba(16, 32, 48, 0.9)")).toBe("#102030");
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBeUndefined();
  });
});

describe("element paths", () => {
  const build = () => {
    const host = document.createElement("my-host");
    document.body.append(document.createElement("div"), host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<section><my-card></my-card><my-card><span></span></my-card></section>`;
    return root.querySelectorAll("my-card")[1] as HTMLElement;
  };

  it("finds an element again through a shadow root", () => {
    const card = build();
    const path = elementPath(card);
    expect(path).toBe(">my-host/section>my-card:1");
    expect(resolveElementPath(path)).toBe(card);
  });

  it("does not guess when the page has changed", () => {
    const card = build();
    const path = elementPath(card);
    card.remove();
    expect(resolveElementPath(path)).toBeUndefined();
    expect(resolveElementPath("not a path")).toBeUndefined();
  });
});

describe("applying choices", () => {
  it("restores an element when its choice is removed", () => {
    const element = document.createElement("div");
    element.style.setProperty("margin", "4px");
    document.body.append(element);
    applyAppearance(element, { textColor: "#102030", radius: 8 });
    expect(element.style.getPropertyValue("--primary-text-color")).toBe(
      "#102030"
    );
    expect(element.style.borderRadius).toBe("8px");
    applyAppearance(element, { radius: 12 });
    expect(element.style.getPropertyValue("--primary-text-color")).toBe("");
    expect(element.style.borderRadius).toBe("12px");
    applyAppearance(element, undefined);
    expect(element.getAttribute("style")).toBe("margin: 4px;");
  });

  it("applies a kind to every element of it and one element's own on top", () => {
    document.body.innerHTML = `<my-chip></my-chip><my-chip></my-chip><p></p>`;
    const [first, second] = Array.from(
      document.querySelectorAll<HTMLElement>("my-chip")
    );
    let store: AppearanceStore = { kinds: {}, elements: {} };
    store = setChoice(store, first, "kind", { radius: 4 });
    store = setChoice(store, second, "element", { opacity: 0.5 });
    expect(getChoice(store, first, "kind")).toEqual({ radius: 4 });
    const tracked = new Set<HTMLElement>();
    applyStore(store, tracked);
    expect(first.style.borderRadius).toBe("4px");
    expect(second.style.borderRadius).toBe("4px");
    expect(second.style.opacity).toBe("0.5");
    expect(first.style.opacity).toBe("");

    store = setChoice(store, first, "kind", {});
    applyStore(store, tracked);
    expect(first.getAttribute("style") ?? "").toBe("");
    expect(second.style.opacity).toBe("0.5");
    expect(tracked.has(first)).toBe(false);
  });
});

describe("a dashboard card", () => {
  it("draws the fill on the card inside and the text on the wrapper", () => {
    const wrapper = document.createElement("my-wrapper");
    const card = document.createElement("ha-card");
    wrapper.attachShadow({ mode: "open" }).append(card);
    document.body.append(wrapper);
    applyAppearance(wrapper, { radius: 8, textColor: "#102030" });
    expect(card.style.borderRadius).toBe("8px");
    expect(wrapper.style.borderRadius).toBe("");
    expect(wrapper.style.color).not.toBe("");
    applyAppearance(wrapper, undefined);
    expect(card.getAttribute("style") ?? "").toBe("");
    expect(wrapper.getAttribute("style") ?? "").toBe("");
  });
});

describe("normalizeStore", () => {
  it("drops empty choices and odd keys", () => {
    expect(
      normalizeStore({
        kinds: {
          "ha-card": { radius: 8 },
          "BAD TAG": { radius: 8 },
          // A plain element is not a kind: this would restyle every block.
          div: { radius: 8 },
          "x-y": {},
        },
        elements: { "/a": { ">div": { opacity: 0.5 }, ">p": {} }, "/b": 3 },
      })
    ).toEqual({
      kinds: { "ha-card": { radius: 8 } },
      elements: { "/a": { ">div": { opacity: 0.5 } } },
    });
  });
});

describe("kindLabel", () => {
  it("reads as words", () => {
    expect(kindLabel("hui-tile-card")).toBe("Tile card");
    expect(kindLabel("ha-card")).toBe("Card");
    expect(kindLabel("button")).toBe("Button");
  });
});
