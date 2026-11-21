import { describe, expect, it } from "vitest";
import { isOwnEvent } from "../../../src/common/dom/is-own-event";

// The quick bar listens for show and close events on its dialog. A slider's
// tooltip or a colour picker inside one of its rows fires the same events,
// which bubble up; treating those as the quick bar's own emptied its list
// and closed it. These tests protect that distinction.
describe("isOwnEvent", () => {
  const listen = (host: HTMLElement, source: HTMLElement): boolean[] => {
    const seen: boolean[] = [];
    host.addEventListener("wa-show", (ev) => seen.push(isOwnEvent(ev)));
    source.dispatchEvent(
      new Event("wa-show", { bubbles: true, composed: true })
    );
    return seen;
  };

  it("is true for an event the element fires itself", () => {
    const host = document.createElement("div");
    expect(listen(host, host)).toEqual([true]);
  });

  it("is false for the same event bubbling up from a child", () => {
    const host = document.createElement("div");
    const child = document.createElement("span");
    host.appendChild(child);
    expect(listen(host, child)).toEqual([false]);
  });

  it("is true for an event retargeted from the element's own shadow tree", () => {
    const host = document.createElement("div");
    const inner = document.createElement("span");
    host.attachShadow({ mode: "open" }).appendChild(inner);
    expect(listen(host, inner)).toEqual([true]);
  });

  it("is false for an event from inside a nested element's shadow tree", () => {
    const host = document.createElement("div");
    const nested = document.createElement("div");
    const inner = document.createElement("span");
    nested.attachShadow({ mode: "open" }).appendChild(inner);
    host.appendChild(nested);
    expect(listen(host, inner)).toEqual([false]);
  });
});
