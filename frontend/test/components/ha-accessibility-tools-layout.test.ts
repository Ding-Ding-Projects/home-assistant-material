import { afterEach, describe, expect, it } from "vitest";
import { HaAccessibilityTools } from "../../src/components/ha-accessibility-tools";
import { getStorage } from "../../src/common/decorators/storage";

let tools: HaAccessibilityTools | undefined;
afterEach(() => {
  tools?.remove();
  getStorage().setValue("accessibilityTools", undefined);
});
const mount = async () => {
  getStorage().setValue("accessibilityTools", undefined);
  tools = new HaAccessibilityTools();
  tools.hass = { localize: (key: string) => key } as never;
  document.body.append(tools);
  await tools.updateComplete;
  // jsdom has no popover top layer. Expose the panel for native focus tests.
  tools.shadowRoot!.querySelector("#panel")!.removeAttribute("popover");
  return tools;
};

describe("accessible segmented choices", () => {
  it("keeps all contrast and spacing choices available", async () => {
    const element = await mount();
    const groups = element.shadowRoot!.querySelectorAll('[role="radiogroup"]');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
      expect(group.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
      expect(group.getAttribute("aria-labelledby")).toBeTruthy();
    }
  });
  it("moves through every contrast choice with arrow keys and Home", async () => {
    const element = await mount();
    const buttons = [
      ...element.shadowRoot!.querySelectorAll<HTMLButtonElement>(
        '[aria-labelledby="contrast-label"] button'
      ),
    ];
    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        composed: true,
      })
    );
    await element.updateComplete;
    expect(element.shadowRoot!.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute("aria-checked")).toBe("true");
    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    );
    await element.updateComplete;
    expect(buttons[2].getAttribute("aria-checked")).toBe("true");
    buttons[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true })
    );
    await element.updateComplete;
    expect(buttons[0].getAttribute("aria-checked")).toBe("true");
  });
});
