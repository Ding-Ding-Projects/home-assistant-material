import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../src/types";
import { HaSelectorState } from "../../src/components/ha-selector/ha-selector-state";

vi.mock("../../src/components/entity/ha-entity-state-picker", () => ({}));
vi.mock("../../src/components/entity/ha-entity-states-picker", () => ({}));

const deferred = () => {
  let resolve!: (ids: string[]) => void;
  const promise = new Promise<string[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const mount = async () => {
  const selector = new HaSelectorState();
  selector.hass = {
    connection: {},
    entities: {},
    devices: {},
    areas: {},
  } as HomeAssistant;
  selector.selector = { state: {} };
  selector.context = {
    filter_entity: ["media_player.initial"],
    common_options_only: true,
  };
  selector.value = "Custom source";
  document.body.append(selector);
  await selector.updateComplete;
  await selector.updateComplete;
  return selector;
};
const currentPicker = (selector: HaSelectorState) =>
  selector.shadowRoot!.querySelector(
    "ha-entity-state-picker"
  ) as HTMLElement & {
    entityId?: string[];
    value?: string;
    commonOptionsOnly: boolean;
  };
afterEach(() => {
  document.body.innerHTML = "";
});

describe("state selector target resolution", () => {
  it("discards an older target response after a newer target resolves", async () => {
    const selector = await mount();
    const older = deferred();
    const newer = deferred();
    const resolve = vi
      .spyOn(selector as any, "_resolveEntityIds")
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    selector.context = {
      filter_target: { area_id: "old" },
      common_options_only: true,
    };
    await selector.updateComplete;
    expect(currentPicker(selector).entityId).toBeUndefined();
    selector.context = {
      filter_target: { area_id: "new" },
      common_options_only: true,
    };
    await selector.updateComplete;
    newer.resolve(["media_player.new", "media_player.new"]);
    await newer.promise;
    await selector.updateComplete;
    older.resolve(["media_player.old"]);
    await older.promise;
    await selector.updateComplete;
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(currentPicker(selector).entityId).toEqual(["media_player.new"]);
    expect(currentPicker(selector).value).toBe("Custom source");
    expect(currentPicker(selector).commonOptionsOnly).toBe(true);
  });
  it("rejects an in-flight response from the previous connection", async () => {
    const selector = await mount();
    const older = deferred();
    const newer = deferred();
    vi.spyOn(selector as any, "_resolveEntityIds")
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    selector.context = { filter_target: { area_id: "same" } };
    await selector.updateComplete;
    selector.hass = { ...selector.hass, connection: {} } as HomeAssistant;
    await selector.updateComplete;
    older.resolve(["media_player.old"]);
    await older.promise;
    await selector.updateComplete;
    expect(currentPicker(selector).entityId).toBeUndefined();
    newer.resolve(["media_player.new"]);
    await newer.promise;
    await selector.updateComplete;
    expect(currentPicker(selector).entityId).toEqual(["media_player.new"]);
  });
  it("forwards common-option context to the multiple-state picker", async () => {
    const selector = await mount();
    selector.selector = { state: { multiple: true } };
    await selector.updateComplete;
    const picker = selector.shadowRoot!.querySelector(
      "ha-entity-states-picker"
    ) as HTMLElement & { commonOptionsOnly: boolean };
    expect(picker.commonOptionsOnly).toBe(true);
  });
});
