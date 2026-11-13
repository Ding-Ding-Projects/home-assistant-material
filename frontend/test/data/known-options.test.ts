import { describe, expect, it, vi } from "vitest";
import { loadDeclaredOptions } from "../../src/data/known-options";
import type { HomeAssistant } from "../../src/types";

const context = { action: "tts.speak", field: "options" };
const result = (keys: string[], language: string | null = "en_US") => ({
  supported_options: keys,
  common_options: ["preferred_format"],
  effective_language: language,
});
const mockHass = (callWS: ReturnType<typeof vi.fn>, admin = true) =>
  ({ callWS, user: { is_admin: admin } }) as unknown as HomeAssistant;

describe("TTS dictionary metadata", () => {
  it("intersects keys and exact-language voices across the selected engines", async () => {
    const callWS = vi
      .fn()
      .mockImplementation(({ type, engine_id, language }) => {
        if (type === "tts/engine/options") {
          return engine_id === "tts.one"
            ? result(["voice", "speed"], "en_US")
            : result(["voice", "model"], "en_GB");
        }
        expect(type).toBe("tts/engine/voices");
        expect(language).toBe(engine_id === "tts.one" ? "en_US" : "en_GB");
        return {
          voices: [
            { voice_id: "shared", name: "Shared voice" },
            { voice_id: engine_id, name: "Engine-specific voice" },
          ],
        };
      });

    expect(
      await loadDeclaredOptions(mockHass(callWS), {
        ...context,
        entityIds: ["tts.one", "tts.two", "tts.one"],
      })
    ).toEqual({
      acceptedKeys: ["voice", "preferred_format"],
      options: [
        {
          key: "voice",
          source: "declared",
          kind: {
            type: "choice",
            choices: [{ value: "shared", label: "Shared voice" }],
          },
        },
      ],
    });
    expect(callWS).toHaveBeenCalledTimes(4);
  });

  it("uses the action language and omits voices when the engine cannot use it", async () => {
    const callWS = vi.fn().mockResolvedValue(result(["voice"], null));
    expect(
      await loadDeclaredOptions(mockHass(callWS), {
        ...context,
        entityIds: ["tts.one"],
        language: "en-US",
      })
    ).toEqual({
      acceptedKeys: ["voice", "preferred_format"],
      options: [{ key: "voice", source: "declared" }],
    });
    expect(callWS).toHaveBeenCalledExactlyOnceWith({
      type: "tts/engine/options",
      engine_id: "tts.one",
      language: "en-US",
    });
  });

  it("uses target expansion with exclusions before loading options", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({
        includes: [
          { type: "area", id: "office", entities: ["tts.one", "tts.two"] },
        ],
        excludes: [
          {
            type: "entity",
            id: "tts.two",
            removed: [{ type: "area", id: "office", entities: ["tts.two"] }],
          },
        ],
      })
      .mockResolvedValueOnce(result(["speed"]));

    await expect(
      loadDeclaredOptions(mockHass(callWS), {
        ...context,
        target: { area_id: "office", exclude: { entity_id: "tts.two" } },
      })
    ).resolves.toMatchObject({ acceptedKeys: ["speed", "preferred_format"] });
    expect(callWS).toHaveBeenLastCalledWith({
      type: "tts/engine/options",
      engine_id: "tts.one",
      language: undefined,
    });
  });

  it("falls back when even one engine cannot supply its metadata", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce(result(["voice"]))
      .mockRejectedValueOnce({ code: "not_found" });
    await expect(
      loadDeclaredOptions(mockHass(callWS), {
        ...context,
        entityIds: ["tts.one", "tts.two"],
      })
    ).resolves.toBeUndefined();
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it("makes no metadata requests for unrelated, unresolved, or over-limit targets", async () => {
    const callWS = vi.fn();
    const hass = mockHass(callWS);
    await expect(
      loadDeclaredOptions(hass, { ...context, action: "light.turn_on" })
    ).resolves.toBeUndefined();
    await expect(
      loadDeclaredOptions(hass, { ...context, entityIds: ["tts.one", "all"] })
    ).resolves.toBeUndefined();
    await expect(
      loadDeclaredOptions(hass, {
        ...context,
        entityIds: Array.from(
          { length: 6 },
          (_, index) => `tts.engine_${index}`
        ),
      })
    ).resolves.toBeUndefined();
    await expect(
      loadDeclaredOptions(mockHass(callWS, false), {
        ...context,
        entityIds: ["tts.one"],
      })
    ).resolves.toBeUndefined();
    expect(callWS).not.toHaveBeenCalled();
  });

  it("does not reuse metadata for identical entity IDs on another connection", async () => {
    const selection = { ...context, entityIds: ["tts.one"] };
    const first = mockHass(vi.fn().mockResolvedValue(result(["speed"])));
    const second = mockHass(vi.fn().mockResolvedValue(result(["model"])));
    await expect(loadDeclaredOptions(first, selection)).resolves.toMatchObject({
      acceptedKeys: ["speed", "preferred_format"],
    });
    await expect(loadDeclaredOptions(second, selection)).resolves.toMatchObject(
      {
        acceptedKeys: ["model", "preferred_format"],
      }
    );
  });
});
