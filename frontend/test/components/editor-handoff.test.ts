import { afterEach, expect, it, vi } from "vitest";
import { HaEditorHandoff } from "../../src/panels/config/handoff/ha-editor-handoff";
import type { HomeAssistant } from "../../src/types";

afterEach(() => document.body.replaceChildren());

async function mount(callWS = vi.fn()) {
  const el = new HaEditorHandoff();
  el.hass = {
    config: { components: ["hassio"] },
    localize: (key: string) => key,
    callWS,
  } as unknown as HomeAssistant;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

it("opens only the verified running editor through its own app route", async () => {
  const callWS = vi
    .fn()
    .mockResolvedValueOnce({
      addons: [
        { slug: "core_configurator", state: "started" },
        { slug: "a0d7b954_vscode", state: "stopped" },
        { slug: "unrelated", state: "started" },
      ],
    })
    .mockResolvedValueOnce({
      slug: "core_configurator",
      name: "File editor",
      state: "started",
      version: "1",
      ingress_url: "/api/hassio_ingress/private-session",
    });
  const el = await mount(callWS);
  el.shadowRoot!.querySelector("ha-button")!.click();
  await vi.waitFor(() =>
    expect(el.shadowRoot!.querySelector("a")?.getAttribute("href")).toBe(
      "/app/core_configurator"
    )
  );
  expect(callWS).toHaveBeenCalledTimes(2);
  expect(el.shadowRoot!.innerHTML).not.toContain("private-session");
});

it("retains a valid file when a replacement is oversized or binary", async () => {
  const el = await mount();
  const input = el.shadowRoot!.querySelector("input")!;
  async function pick(name: string, bytes: number[], size = bytes.length) {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        { name, size, arrayBuffer: async () => Uint8Array.from(bytes).buffer },
      ],
    });
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await el.updateComplete;
  }
  await pick("fixture.yaml", [65]);
  expect(el.shadowRoot!.querySelector("textarea")?.value).toBe("A");
  await pick("binary", [0]);
  expect(el.shadowRoot!.querySelector('[role="alert"]')).toBeTruthy();
  await pick("large", [66], 1024 * 1024 + 1);
  expect(el.shadowRoot!.querySelector("textarea")?.value).toBe("A");
});
it("keeps edits when the user cancels replacing a file", async () => {
  const el = await mount();
  const input = el.shadowRoot!.querySelector("input")!;
  const pick = async (value: number) => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        {
          name: "example.yaml",
          size: 1,
          arrayBuffer: async () => Uint8Array.of(value).buffer,
        },
      ],
    });
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await el.updateComplete;
  };
  await pick(65);
  const draft = el.shadowRoot!.querySelector("textarea")!;
  draft.value = "modified";
  draft.dispatchEvent(new Event("input"));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await pick(66);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(draft.value).toBe("modified");
  } finally {
    confirm.mockRestore();
  }
});
