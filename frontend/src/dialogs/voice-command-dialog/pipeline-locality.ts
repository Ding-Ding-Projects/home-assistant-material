import type { AssistPipeline } from "../../data/assist_pipeline";

/**
 * Engines that are known to run on this instance and send nothing to a
 * cloud service. The instance does not report where an engine runs, so an
 * engine that is not named here is treated as unknown, never as local.
 */
const LOCAL_CONVERSATION = ["conversation.home_assistant"];
const LOCAL_SPEECH = [
  "stt.faster_whisper",
  "stt.whisper",
  "stt.speech_to_phrase",
  "tts.piper",
];

const isCloudName = (engine: string): boolean => /cloud/i.test(engine);

/**
 * True only when every part of the pipeline is known to run locally. A part
 * that is not set is not used, so it sends nothing anywhere. A cloud engine,
 * or one this check cannot place, makes the answer false.
 */
export const pipelineRunsLocally = (
  pipeline: Pick<
    AssistPipeline,
    "conversation_engine" | "stt_engine" | "tts_engine"
  >
): boolean => {
  const parts: [string | null, string[]][] = [
    [pipeline.conversation_engine, LOCAL_CONVERSATION],
    [pipeline.stt_engine, LOCAL_SPEECH],
    [pipeline.tts_engine, LOCAL_SPEECH],
  ];
  return parts.every(
    ([engine, known]) =>
      engine === null ||
      (!isCloudName(engine) && known.some((name) => engine === name))
  );
};
