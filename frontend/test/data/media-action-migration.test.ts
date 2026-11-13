import { describe, expect, it } from "vitest";
import { migrateAutomationAction } from "../../src/data/script";
import type { ServiceAction } from "../../src/data/script";

describe("play media migration", () => {
  it("keeps the selected nested media when both representations exist", () => {
    const media = { media_content_id: "chosen", media_content_type: "music" };
    const action: ServiceAction = {
      action: "media_player.play_media",
      data: {
        media,
        media_content_id: "legacy",
        media_content_type: "audio/wav",
      },
    };
    expect(migrateAutomationAction(action)).toBe(action);
    expect(action.data?.media).toBe(media);
    expect(action.data?.media_content_id).toBe("legacy");
  });

  it("still migrates split media and preserves other action data", () => {
    const action: ServiceAction = {
      action: "media_player.play_media",
      metadata: { title: "Original media" },
      data: {
        media_content_id: "legacy",
        media_content_type: "music",
        announce: false,
      },
    };
    expect(migrateAutomationAction(action)).toEqual({
      action: "media_player.play_media",
      data: {
        media: {
          media_content_id: "legacy",
          media_content_type: "music",
          metadata: { title: "Original media" },
        },
        announce: false,
      },
    });
  });
});
