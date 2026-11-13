import type { HomeAssistant } from "../../../../types";
import type { FlowNode } from "./flow-graph";

/**
 * A readable name for a flow graph node: the title of a step, or for a branch
 * the title of the step that owns it and the name of the branch.
 */
export const flowNodeLabel = (
  hass: Pick<HomeAssistant, "localize">,
  nodes: FlowNode[],
  node: FlowNode
): string => {
  if (node.role !== "branch") {
    return node.title;
  }
  const flow = (key: string, vars?: Record<string, string | number>) =>
    hass.localize(
      `ui.panel.config.automation.editor.tools.flow.${key}` as any,
      vars as any
    );
  const segments = node.path.split("/");
  const last = segments[segments.length - 1];
  const numbered = /^\d+$/.test(last);
  const branch = numbered
    ? flow("branch.option", { number: Number(last) + 1 })
    : flow(`branch.${last}`);
  const parentPath = segments.slice(0, numbered ? -2 : -1).join("/");
  const parent = nodes.find((n) => n.path === parentPath);
  return parent ? `${parent.title}: ${branch}` : branch;
};
