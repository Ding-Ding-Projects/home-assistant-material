import { deepEqual } from "../../../../common/util/deep-equal";
import { resolveStepPath } from "./find-step-row";

/** A stored run must never jump to a different step occupying its old index. */
export const canShowTraceStep = (
  recordedConfig: unknown,
  editorConfig: unknown,
  path: string
): boolean => {
  const recorded = resolveStepPath(recordedConfig, path);
  const current = resolveStepPath(editorConfig, path);
  return (
    recorded !== undefined &&
    current !== undefined &&
    deepEqual(recorded, current)
  );
};
