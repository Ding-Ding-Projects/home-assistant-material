import { describe, expect, it } from "vitest";
import { buildFlowGraph } from "../../../../../src/panels/config/automation/tools/flow-graph";

const config = {
  triggers: [
    { trigger: "state", entity_id: "person.alex", to: "home" },
    { trigger: "sun", event: "sunset" },
  ],
  conditions: [
    { condition: "state", entity_id: "input_boolean.guest", state: "off" },
  ],
  actions: [
    {
      choose: [
        {
          conditions: [
            { condition: "zone", entity_id: "person.alex", zone: "zone.home" },
          ],
          sequence: [
            { action: "light.turn_on", target: { entity_id: "light.hall" } },
          ],
        },
      ],
      default: [{ action: "notify.alex", enabled: false }],
    },
    { delay: "00:00:05" },
  ],
};

describe("buildFlowGraph", () => {
  it("lists triggers in the first column and follows with conditions and actions", () => {
    const graph = buildFlowGraph(config);
    const triggers = graph.nodes.filter((n) => n.role === "trigger");
    expect(triggers.map((n) => [n.col, n.row])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    const condition = graph.nodes.find((n) => n.role === "condition")!;
    expect(condition.col).toBe(1);
    // Every trigger leads to the first condition.
    expect(
      graph.edges.filter((e) => e.to === condition.id).map((e) => e.from)
    ).toEqual(triggers.map((n) => n.id));
  });

  it("draws one branch per option and the default as an alternative edge", () => {
    const graph = buildFlowGraph(config);
    const branches = graph.nodes.filter((n) => n.role === "branch");
    expect(branches.map((n) => n.path)).toEqual([
      "action/0/choose/0",
      "action/0/default",
    ]);
    const choose = graph.nodes.find((n) => n.path === "action/0")!;
    const toDefault = graph.edges.find(
      (e) => e.from === choose.id && e.to === branches[1].id
    )!;
    expect(toDefault.tone).toBe("alternative");
    const off = graph.nodes.find((n) => n.path === "action/0/default/0")!;
    expect(off.disabled).toBe(true);
  });

  it("joins both branches into the next step", () => {
    const graph = buildFlowGraph(config);
    const delay = graph.nodes.find((n) => n.path === "action/1")!;
    expect(graph.edges.filter((e) => e.to === delay.id)).toHaveLength(2);
    expect(delay.col).toBeGreaterThan(
      graph.nodes.find((n) => n.path === "action/0/choose/0/sequence/0")!.col
    );
  });

  it("handles an empty configuration", () => {
    const graph = buildFlowGraph({});
    expect(graph.nodes).toEqual([]);
    expect(graph.cols).toBe(1);
  });
});
