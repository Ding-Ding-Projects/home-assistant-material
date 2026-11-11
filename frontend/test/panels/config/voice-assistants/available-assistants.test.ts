import { describe, expect, it } from "vitest";
import {
  getListedVoiceAssistantIds,
  isCloudVoiceAssistant,
} from "../../../../src/data/expose";
import { getAvailableAssistants } from "../../../../src/panels/config/voice-assistants/expose/available-assistants";

const loggedIn = {
  logged_in: true,
  prefs: { alexa_enabled: true, google_enabled: true },
} as any;

describe("available assistants", () => {
  it("offers only the local assistant, even for a signed-in cloud account", () => {
    const hass = { config: { components: ["conversation", "cloud"] } } as any;
    expect(getAvailableAssistants(loggedIn, hass)).toEqual(["conversation"]);
  });

  it("offers nothing when the local assistant is not loaded", () => {
    const hass = { config: { components: ["cloud"] } } as any;
    expect(getAvailableAssistants(loggedIn, hass)).toEqual([]);
  });

  it("lists no cloud assistant by id", () => {
    expect(isCloudVoiceAssistant("cloud.alexa")).toBe(true);
    expect(isCloudVoiceAssistant("conversation")).toBe(false);
    expect(getListedVoiceAssistantIds()).toEqual(["conversation"]);
  });
});
