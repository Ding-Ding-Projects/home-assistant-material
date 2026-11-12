import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PhoneActionItem,
  HaPhoneTabActions,
} from "../../../src/components/phone/ha-phone-tab-actions";
import "../../../src/components/phone/ha-phone-tab-actions";

// The actions panel is the only way to pin, close and move a page on a phone
// without a gesture, so these protect its contract: a row that is not
// available says why and does nothing, Escape dismisses, and every row is
// reachable by keyboard.

const items: PhoneActionItem[] = [
  { id: "pin", label: "Pin", iconPath: "M0", enabled: true },
  {
    id: "close",
    label: "Close",
    iconPath: "M0",
    enabled: false,
    note: "Pinned. Unpin it first.",
    destructive: true,
  },
];

let panel: HaPhoneTabActions | undefined;

const mount = async () => {
  panel = document.createElement("ha-phone-tab-actions");
  panel.heading = "Overview";
  panel.closeLabel = "Close this menu";
  panel.items = items;
  document.body.append(panel);
  await panel.updateComplete;
  return panel;
};

afterEach(() => {
  panel?.remove();
  panel = undefined;
});

describe("ha-phone-tab-actions", () => {
  it("renders a labelled dialog with one button per row", async () => {
    const element = await mount();
    const root = element.shadowRoot!;
    expect(
      root.querySelector("[role=dialog]")?.getAttribute("aria-label")
    ).toBe("Overview");
    expect(root.querySelectorAll(".row")).toHaveLength(2);
  });

  it("keeps an unavailable row focusable and shows the reason", async () => {
    const element = await mount();
    const rows =
      element.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row");
    expect(rows[1].getAttribute("aria-disabled")).toBe("true");
    expect(rows[1].disabled).toBe(false);
    expect(rows[1].textContent).toContain("Pinned. Unpin it first.");
    expect(rows[0].hasAttribute("aria-disabled")).toBe(false);
  });

  it("fires the chosen row and ignores an unavailable one", async () => {
    const element = await mount();
    const listener = vi.fn();
    element.addEventListener("phone-action-select", listener);
    const rows =
      element.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row");
    rows[1].click();
    expect(listener).not.toHaveBeenCalled();
    rows[0].click();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({ id: "pin" });
  });

  it("asks to close on Escape and on the close button", async () => {
    const element = await mount();
    const listener = vi.fn();
    element.addEventListener("phone-actions-dismiss", listener);
    element
      .shadowRoot!.querySelector("[role=dialog]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    element.shadowRoot!.querySelector<HTMLButtonElement>(".round")!.click();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("names the close button for screen readers", async () => {
    const element = await mount();
    expect(
      element.shadowRoot!.querySelector(".round")?.getAttribute("aria-label")
    ).toBe("Close this menu");
  });
});
