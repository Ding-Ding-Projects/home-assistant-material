import { LitElement } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real field and button need the full app. These stand in for them.
vi.mock("../../src/components/ha-icon-button", () => ({}));
vi.mock("../../src/components/input/ha-input-search", () => ({}));
customElements.define("ha-icon-button", class extends LitElement {});
customElements.define(
  "ha-input-search",
  class extends LitElement {
    public value = "";
  }
);
await import("../../src/components/ha-top-bar-search");

const localize = (key: string) => key;

let element: HTMLElement & { updateComplete: Promise<boolean> };

const mount = async (open: boolean, value = "") => {
  element = document.createElement("ha-top-bar-search") as typeof element;
  Object.assign(element, { localize, open, value });
  document.body.append(element);
  await element.updateComplete;
  return element;
};

afterEach(() => element?.remove());

describe("ha-top-bar-search", () => {
  it("rests as one button and asks the page to open", async () => {
    await mount(false);
    const opened = vi.fn();
    element.addEventListener("top-bar-search-open", opened);
    expect(element.shadowRoot!.querySelector("ha-input-search")).toBeNull();
    element.shadowRoot!.querySelector<HTMLElement>(".open-button")!.click();
    expect(opened).toHaveBeenCalledOnce();
  });

  it("shows the field when open and reports typing", async () => {
    await mount(true, "emoji");
    const input = element.shadowRoot!.querySelector(
      "ha-input-search"
    ) as HTMLElement & { value: string };
    const typed = vi.fn();
    element.addEventListener("top-bar-search-input", (ev) =>
      typed((ev as CustomEvent).detail.value)
    );
    input.value = "sound";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(typed).toHaveBeenCalledWith("sound");
  });

  it("closes on Escape and steps on Enter and Shift+Enter", async () => {
    await mount(true, "emoji");
    const closed = vi.fn();
    const steps: number[] = [];
    element.addEventListener("top-bar-search-close", closed);
    element.addEventListener("top-bar-search-step", (ev) =>
      steps.push((ev as CustomEvent).detail.direction)
    );
    const field = element.shadowRoot!.querySelector(".open-search")!;
    const press = (key: string, shiftKey = false) =>
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })
      );
    press("Enter");
    press("Enter", true);
    press("Escape");
    expect(steps).toEqual([1, -1]);
    expect(closed).toHaveBeenCalledOnce();
  });
});
