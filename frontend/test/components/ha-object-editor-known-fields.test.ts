import { ContextProvider } from "@lit/context";
import { afterEach, describe, expect, it } from "vitest";
import { internationalizationContext } from "../../src/data/context";
import type { HomeAssistantInternationalization } from "../../src/types";
import { HaObjectEditor } from "../../src/components/object-editor/ha-object-editor";
import type { ResolvedKnownOption } from "../../src/common/object-editor/known-options";

let host: HTMLElement;
const mount = async (value: unknown, options: ResolvedKnownOption[]) => {
  host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: {
      localize: (key: string) => key,
      locale: { language: "en" },
    } as unknown as HomeAssistantInternationalization,
  });
  const element = new HaObjectEditor();
  element.value = value;
  element.knownOptions = options;
  host.append(element);
  document.body.append(host);
  await element.updateComplete;
  return element;
};
afterEach(() => {
  host?.remove();
});
const voice: ResolvedKnownOption = {
  key: "voice",
  label: "Voice",
  source: "declared",
  kind: { type: "choice", choices: [{ value: "new", label: "New voice" }] },
};

describe("known dictionary field controls", () => {
  it("shows the labeled choice control without a primary key or type form and retains a legacy choice", async () => {
    const element = await mount({ voice: "legacy" }, [voice]);
    const row = element.shadowRoot!.querySelector(".known-field")!;
    expect(row.querySelector(".known-label")?.textContent?.trim()).toBe(
      "Voice"
    );
    expect(row.querySelector(".key")).toBeNull();
    expect(row.querySelector("details")?.open).toBe(false);
    const select = row.querySelector(".value ha-select") as HTMLElement & {
      value: string;
      options: { value: string }[];
    };
    expect(select.value).toBe("legacy");
    expect(select.options.map((option) => option.value)).toEqual([
      "new",
      "legacy",
    ]);
    expect(element.value).toEqual({ voice: "legacy" });
    expect(row.querySelector(".custom-controls ha-input")).not.toBeNull();
  });
  it("adds a named known option directly and keeps unknown keys in the custom editor", async () => {
    const element = await mount({ custom: "kept" }, [
      {
        key: "channels",
        label: "Channels",
        source: "common",
        kind: { type: "number", min: 1, max: 8, step: 1 },
      },
    ]);
    let next: unknown;
    element.addEventListener("value-changed", (event) => {
      next = (event as CustomEvent).detail.value;
    });
    const add = element.shadowRoot!.querySelector(
      ".known-buttons ha-button"
    ) as HTMLElement;
    expect(add.textContent).toContain("Channels");
    add.click();
    await element.updateComplete;
    expect(next).toEqual({ custom: "kept", channels: 1 });
    expect(element.shadowRoot!.querySelectorAll(".key")).toHaveLength(1);
    expect(element.shadowRoot!.querySelector(".add")?.textContent).toContain(
      "add_custom_entry"
    );
  });
  it("preserves an incompatible saved value rather than converting its type", async () => {
    const original = { voice: { nested: true } };
    const element = await mount(original, [voice]);
    expect(
      element.shadowRoot!.querySelector(".known-field")?.textContent
    ).toContain("saved_value_type");
    expect(element.value).toBe(original);
    expect(element.shadowRoot!.querySelector("ha-switch")).not.toBeNull();
  });
});
