import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../src/panels/config/ssh-access/ha-config-ssh-access";
import type { HaTextArea } from "../../../../src/components/ha-textarea";
import type { HomeAssistant } from "../../../../src/types";

// Protects the one promise the page makes about private keys: whatever way
// one is pasted, it is gone from the field at once and nothing is sent.

// The real subpage reads contexts the test does not provide.
vi.mock("../../../../src/layouts/hass-subpage", () => {
  customElements.define(
    "hass-subpage",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = "<slot></slot>";
      }
    }
  );
  return {};
});

const PRIVATE_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----";

const mounted: HTMLElement[] = [];

// The test environment has no layout engine.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();

    unobserve = vi.fn();

    disconnect = vi.fn();
  }
);

const mount = async (callWS = vi.fn()) => {
  callWS.mockImplementation(async (msg: { method: string }) =>
    msg.method === "get" ? { keys: [], mode: "os", port: 22222 } : undefined
  );
  const el = document.createElement("ha-config-ssh-access") as HTMLElement & {
    hass: HomeAssistant;
    updateComplete: Promise<boolean>;
  };
  el.hass = {
    localize: (key: string) => key,
    callWS,
    language: "en",
  } as unknown as HomeAssistant;
  document.body.append(el);
  mounted.push(el);
  // The first read, then the render that follows it.
  await el.updateComplete;
  await vi.waitFor(() =>
    expect(el.shadowRoot!.querySelector("ha-textarea")).not.toBeNull()
  );
  await el.updateComplete;
  return { el, callWS };
};

afterEach(() => {
  mounted.splice(0).forEach((el) => el.remove());
});

describe("ha-config-ssh-access", () => {
  it("empties the field when a private key is pasted into an empty field", async () => {
    const { el, callWS } = await mount();
    const field = el.shadowRoot!.querySelector<HaTextArea>("ha-textarea")!;
    expect(field.value).toBeFalsy();

    // The field has already taken the pasted text when the page hears of it.
    field.value = PRIVATE_KEY;
    field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(field.value).toBe("");
    // Only the read happened: nothing was sent.
    expect(callWS.mock.calls.every(([msg]) => msg.method === "get")).toBe(true);
  });
});
