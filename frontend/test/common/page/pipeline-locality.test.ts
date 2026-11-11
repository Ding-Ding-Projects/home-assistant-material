import { describe, expect, it } from "vitest";
import { pipelineRunsLocally } from "../../../src/dialogs/voice-command-dialog/pipeline-locality";

const base = {
  conversation_engine: "conversation.home_assistant",
  stt_engine: "stt.faster_whisper",
  tts_engine: "tts.piper",
};

describe("pipelineRunsLocally", () => {
  it("is true when all three parts are known to run here", () => {
    expect(pipelineRunsLocally(base)).toBe(true);
  });

  it("treats a part that is not set as not used", () => {
    expect(
      pipelineRunsLocally({ ...base, stt_engine: null, tts_engine: null })
    ).toBe(true);
  });

  it("is false when speech to text or text to speech is a cloud engine", () => {
    expect(
      pipelineRunsLocally({ ...base, stt_engine: "stt.home_assistant_cloud" })
    ).toBe(false);
    expect(
      pipelineRunsLocally({ ...base, tts_engine: "tts.home_assistant_cloud" })
    ).toBe(false);
  });

  it("is false for a cloud or unknown conversation engine", () => {
    expect(
      pipelineRunsLocally({
        ...base,
        conversation_engine: "conversation.cloud",
      })
    ).toBe(false);
    expect(
      pipelineRunsLocally({
        ...base,
        conversation_engine: "conversation.other",
      })
    ).toBe(false);
  });

  it("is false for an engine it cannot place", () => {
    expect(pipelineRunsLocally({ ...base, tts_engine: "tts.mystery" })).toBe(
      false
    );
  });
});
