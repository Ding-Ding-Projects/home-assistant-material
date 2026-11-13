import type { StepKind, StepRef } from "./step-model";
import {
  actionKind,
  asList,
  childLists,
  configParts,
  isDisabled,
  isRec,
  stepDetail,
  stepTitle,
} from "./step-model";

export interface FlowNode {
  id: string;
  /** The trace path of the step this node stands for, or of its branch. */
  path: string;
  role: "trigger" | "condition" | "action" | "branch";
  kind: StepKind;
  title: string;
  detail?: string;
  disabled: boolean;
  col: number;
  row: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  /** "else" and "default" edges are drawn dashed. */
  tone: "normal" | "alternative";
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols: number;
  rows: number;
}

interface Tail {
  id: string;
  tone: "normal" | "alternative";
}

interface Builder {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface SequenceResult {
  tails: Tail[];
  /** The highest column used, inclusive. */
  maxCol: number;
  /** How many rows the sequence needs. */
  rows: number;
}

const connect = (b: Builder, heads: Tail[], to: string) => {
  for (const head of heads) {
    b.edges.push({ from: head.id, to, tone: head.tone });
  }
};

const addNode = (b: Builder, node: Omit<FlowNode, "id">): FlowNode => {
  const full: FlowNode = { ...node, id: `n${b.nodes.length}` };
  b.nodes.push(full);
  return full;
};

const walkSequence = (
  b: Builder,
  items: unknown[],
  prefix: string,
  col: number,
  row: number,
  heads: Tail[]
): SequenceResult => {
  let tails = heads;
  let cursorCol = col;
  let rows = 1;
  let maxCol = col - 1;
  items.forEach((raw, index) => {
    const path = `${prefix}/${index}`;
    const kind = actionKind(raw);
    const ref: StepRef = { path, kind, section: "action", depth: 0, raw };
    const node = addNode(b, {
      path,
      role: "action",
      kind,
      title: stepTitle(ref),
      detail: stepDetail(ref),
      disabled: isDisabled(raw),
      col: cursorCol,
      row,
    });
    connect(b, tails, node.id);
    maxCol = Math.max(maxCol, cursorCol);
    const lists = isRec(raw) ? childLists(raw, kind) : [];
    if (isRec(raw) && lists.length) {
      let branchRow = row;
      let reachedCol = cursorCol;
      const nextTails: Tail[] = [];
      const leaf =
        kind === "repeat" || kind === "sequence" || kind === "parallel";
      lists.forEach((list) => {
        const alternative = list.key === "else" || list.key === "default";
        let from: Tail[] = [
          { id: node.id, tone: alternative ? "alternative" : "normal" },
        ];
        let listCol = cursorCol + 1;
        if (!leaf) {
          const conds = list.conditions ?? [];
          const branch = addNode(b, {
            path: `${path}/${list.key.replace(/\/sequence$/, "")}`,
            role: "branch",
            kind: "condition",
            title: list.label,
            detail: conds.length ? `${asList(conds).length}` : undefined,
            disabled: false,
            col: listCol,
            row: branchRow,
          });
          connect(b, from, branch.id);
          from = [{ id: branch.id, tone: "normal" }];
          listCol += 1;
        }
        const inner = walkSequence(
          b,
          list.items,
          `${prefix}/${index}/${list.key}`,
          listCol,
          branchRow,
          from
        );
        nextTails.push(...inner.tails);
        reachedCol = Math.max(reachedCol, inner.maxCol, listCol - 1);
        branchRow += inner.rows;
      });
      rows = Math.max(rows, branchRow - row);
      maxCol = Math.max(maxCol, reachedCol);
      cursorCol = reachedCol + 1;
      tails = nextTails.length ? nextTails : [{ id: node.id, tone: "normal" }];
    } else {
      cursorCol += 1;
      tails = [{ id: node.id, tone: "normal" }];
    }
  });
  return { tails, maxCol, rows };
};

/**
 * Builds a graph of the automation as it is configured: triggers on the left,
 * then the top level conditions, then the actions, with one branch per option
 * of a choose and per then or else of an if.
 */
export const buildFlowGraph = (config: unknown): FlowGraph => {
  const { triggers, conditions, actions } = configParts(config);
  const b: Builder = { nodes: [], edges: [] };
  let heads: Tail[] = [];
  triggers.forEach((raw, i) => {
    const ref: StepRef = {
      path: `trigger/${i}`,
      kind: "trigger",
      section: "trigger",
      depth: 0,
      raw,
    };
    const node = addNode(b, {
      path: ref.path,
      role: "trigger",
      kind: "trigger",
      title: stepTitle(ref),
      detail: stepDetail(ref),
      disabled: isDisabled(raw),
      col: 0,
      row: i,
    });
    heads.push({ id: node.id, tone: "normal" });
  });
  let col = 1;
  const triggerRows = Math.max(1, triggers.length);
  conditions.forEach((raw, i) => {
    const ref: StepRef = {
      path: `condition/${i}`,
      kind: "condition",
      section: "condition",
      depth: 0,
      raw,
    };
    const node = addNode(b, {
      path: ref.path,
      role: "condition",
      kind: "condition",
      title: stepTitle(ref),
      detail: stepDetail(ref),
      disabled: isDisabled(raw),
      col,
      row: 0,
    });
    connect(b, heads, node.id);
    heads = [{ id: node.id, tone: "normal" }];
    col += 1;
  });
  const result = walkSequence(b, actions, "action", col, 0, heads);
  const cols = Math.max(col, result.maxCol + 1, 1);
  return {
    nodes: b.nodes,
    edges: b.edges,
    cols,
    rows: Math.max(triggerRows, result.rows, 1),
  };
};
