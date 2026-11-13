import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../src/types";
import { showMediaBrowserDialog } from "../../src/components/media-player/show-media-browser-dialog";
import "../../src/components/ha-media-item-picker";

vi.mock("../../src/components/media-player/show-media-browser-dialog", () => ({
  showMediaBrowserDialog: vi.fn(),
}));

const mount = async (features: number, allowLocal: boolean) => {
  const picker = document.createElement("ha-media-item-picker");
  picker.hass = {
    localize: (key: string) => key,
    states: {
      "media_player.sample": { attributes: { supported_features: features } },
    },
  } as unknown as HomeAssistant;
  picker.selector = { media: {} };
  picker.context = {
    filter_entity: ["media_player.sample"],
    allow_local_media: allowLocal,
  };
  document.body.append(picker);
  await picker.updateComplete;
  return picker;
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("media selection for a playback action", () => {
  it("opens the local media chooser when the playback target cannot browse", async () => {
    const picker = await mount(512, true);
    picker.shadowRoot!.querySelector<HTMLElement>("ha-card")!.click();
    expect(showMediaBrowserDialog).toHaveBeenCalledWith(
      picker,
      expect.objectContaining({ action: "pick", entityId: undefined })
    );
  });

  it("uses the target library when the playback target advertises it", async () => {
    const picker = await mount(131072, true);
    picker.shadowRoot!.querySelector<HTMLElement>("ha-card")!.click();
    expect(showMediaBrowserDialog).toHaveBeenCalledWith(
      picker,
      expect.objectContaining({ entityId: "media_player.sample" })
    );
  });

  it("keeps the original manual route for selectors without local fallback", async () => {
    const picker = await mount(512, false);
    expect(picker.shadowRoot!.querySelector("ha-card")).toBeNull();
    expect(picker.shadowRoot!.querySelector("ha-form")).toBeTruthy();
    expect(showMediaBrowserDialog).not.toHaveBeenCalled();
  });
});
