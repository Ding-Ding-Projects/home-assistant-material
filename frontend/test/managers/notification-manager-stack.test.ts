import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../src/types";
import "../../src/managers/notification-manager";

const localize = vi.fn((key: string, args?: Record<string, string | number>) =>
  args ? `${key}:${JSON.stringify(args)}` : key
);

vi.mock("../../src/components/ha-button", () => {
  customElements.define("ha-button", class extends HTMLElement {});
  return {};
});

vi.mock("../../src/components/ha-icon-button", () => {
  customElements.define("ha-icon-button", class extends HTMLElement {});
  return {};
});

vi.mock("../../src/components/ha-toast", () => {
  customElements.define(
    "ha-toast",
    class extends HTMLElement {
      public show = vi.fn();

      public hide = vi.fn();
    }
  );
  return {};
});

@customElement("test-notification-stack-host")
class TestNotificationStackHost extends LitElement {
  @property({ attribute: false }) public hass = {
    localize,
  } as unknown as HomeAssistant;

  protected render() {
    return html`<notification-manager
      .hass=${this.hass}
    ></notification-manager>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "test-notification-stack-host": TestNotificationStackHost;
  }
}

let host: TestNotificationStackHost | undefined;

const mountManager = async () => {
  host = document.createElement(
    "test-notification-stack-host"
  ) as TestNotificationStackHost;
  document.body.append(host);
  await host.updateComplete;
  return host.shadowRoot!.querySelector("notification-manager")!;
};

const labels = (manager: HTMLElement) =>
  [...manager.shadowRoot!.querySelectorAll("ha-toast")].map(
    (toast) => (toast as unknown as { labelText: string }).labelText
  );

const showAll = (
  manager: ReturnType<typeof mountManager> extends Promise<infer M> ? M : never,
  messages: string[]
) =>
  messages.reduce(
    (previous, message) =>
      previous.then(() => manager.showDialog({ message, duration: -1 })),
    Promise.resolve()
  );

afterEach(() => {
  host?.remove();
  host = undefined;
  vi.clearAllMocks();
});

describe("notification-manager stack", () => {
  it("shows three toasts and holds the others in a queue", async () => {
    const manager = await mountManager();
    await showAll(manager, ["One", "Two", "Three", "Four", "Five"]);
    await manager.updateComplete;

    expect(labels(manager)).toEqual(["One", "Two", "Three"]);
    expect(manager.shadowRoot!.querySelector(".more")!.textContent).toContain(
      '"count":2'
    );
  });

  it("makes older toasts progressively smaller through the depth property", async () => {
    const manager = await mountManager();
    await showAll(manager, ["One", "Two", "Three"]);

    const depths = [...manager.shadowRoot!.querySelectorAll("ha-toast")].map(
      (toast) => (toast as unknown as { depth: number }).depth
    );
    expect(depths).toEqual([2, 1, 0]);
  });

  it("shows the next waiting toast when one closes", async () => {
    const manager = await mountManager();
    await showAll(manager, ["One", "Two", "Three", "Four"]);
    manager
      .shadowRoot!.querySelector("ha-toast")!
      .dispatchEvent(
        new CustomEvent("toast-closed", { detail: { reason: "timeout" } })
      );
    await manager.updateComplete;
    await manager.updateComplete;

    expect(labels(manager)).toEqual(["Two", "Three", "Four"]);
    expect(manager.shadowRoot!.querySelector(".more")).toBeNull();
  });

  it("drops an identical anonymous message that arrives straight away", async () => {
    const manager = await mountManager();
    await manager.showDialog({ message: "Saved", duration: -1 });
    await manager.showDialog({ message: "Saved", duration: -1 });

    expect(labels(manager)).toEqual(["Saved"]);
  });

  it("runs the action of the toast whose button was pressed", async () => {
    const manager = await mountManager();
    const undo = vi.fn();
    await manager.showDialog({
      message: "Deleted",
      action: { action: undo, text: "Undo" },
      duration: -1,
    });

    manager.shadowRoot!.querySelector<HTMLElement>("ha-button")!.click();

    expect(undo).toHaveBeenCalledOnce();
  });

  it("keeps an error until it is dismissed and offers a close button", async () => {
    const manager = await mountManager();
    await manager.showDialog({ message: "Failed", severity: "error" });

    const toast = manager.shadowRoot!.querySelector("ha-toast")!;
    expect((toast as unknown as { timeoutMs: number }).timeoutMs).toBe(-1);
    expect(manager.shadowRoot!.querySelector("ha-icon-button")).not.toBeNull();
  });

  it("announces only the newest toast through one polite live region", async () => {
    const manager = await mountManager();
    await manager.showDialog({ message: "First", duration: -1 });
    await manager.updateComplete;
    await manager.showDialog({ message: "Second", duration: -1 });
    await manager.updateComplete;
    await manager.updateComplete;

    const live = manager.shadowRoot!.querySelector(".live")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent!.trim()).toBe("Second");
    for (const toast of manager.shadowRoot!.querySelectorAll("ha-toast")) {
      expect((toast as unknown as { silent: boolean }).silent).toBe(true);
    }
  });
});
