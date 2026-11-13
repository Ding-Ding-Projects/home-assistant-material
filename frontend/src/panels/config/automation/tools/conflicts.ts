import {
  asList,
  configParts,
  entityIdsOf,
  isRec,
  listSteps,
  serviceOf,
  triggerType,
} from "./step-model";

/**
 * Static analysis of stored automations. It reads configurations only: nothing
 * is run. Every result is a possibility the owner should look at, never proof
 * that two automations really collide or loop.
 */

export interface AnalysedAutomation {
  /** The automation entity id, for example `automation.arrive_home`. */
  id: string;
  name: string;
  config: unknown;
}

export type Direction = "on" | "off" | "open" | "close" | "lock" | "unlock";

const OPPOSITE: Record<Direction, Direction> = {
  on: "off",
  off: "on",
  open: "close",
  close: "open",
  lock: "unlock",
  unlock: "lock",
};

const DIRECTION_BY_SERVICE: Record<string, Direction> = {
  turn_on: "on",
  turn_off: "off",
  open_cover: "open",
  close_cover: "close",
  open_valve: "open",
  close_valve: "close",
  lock: "lock",
  unlock: "unlock",
};

/** The state a trigger waits for after a command of this direction. */
const STATE_AFTER: Record<Direction, string[]> = {
  on: ["on"],
  off: ["off"],
  open: ["open", "opening"],
  close: ["closed", "closing"],
  lock: ["locked"],
  unlock: ["unlocked"],
};

export interface Command {
  entity: string;
  /** Undefined for a service whose direction is not known (a toggle, a setter). */
  direction?: Direction;
  service: string;
  path: string;
}

export interface TriggerFact {
  path: string;
  type: string;
  entities: string[];
  to?: string[];
  at?: string;
  /** A stable text of the whole trigger, used to spot identical triggers. */
  fingerprint: string;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (isRec(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${k}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "";
};

export const extractTriggers = (config: unknown): TriggerFact[] => {
  const out: TriggerFact[] = [];
  configParts(config).triggers.forEach((trigger, index) => {
    if (trigger.enabled === false) {
      return;
    }
    const type = triggerType(trigger);
    const to =
      trigger.to === undefined || trigger.to === null
        ? undefined
        : asList(trigger.to).map(String);
    const at = typeof trigger.at === "string" ? trigger.at : undefined;
    const { alias: _alias, id: _id, note: _note, ...rest } = trigger;
    out.push({
      path: `trigger/${index}`,
      type,
      entities: entityIdsOf(trigger),
      to,
      at,
      fingerprint: stable({ ...rest, platform: undefined, trigger: type }),
    });
  });
  return out;
};

/** Every service call of an automation that names entities, enabled steps only. */
export const extractCommands = (config: unknown): Command[] => {
  const out: Command[] = [];
  const disabledPrefixes: string[] = [];
  for (const step of listSteps(config)) {
    if (step.section !== "action" || !isRec(step.raw)) {
      continue;
    }
    if (step.raw.enabled === false) {
      disabledPrefixes.push(`${step.path}/`, step.path);
      continue;
    }
    if (
      disabledPrefixes.some(
        (p) => step.path === p || step.path.startsWith(`${p}/`)
      )
    ) {
      continue;
    }
    if (step.kind !== "service") {
      continue;
    }
    const service = serviceOf(step.raw);
    if (!service || !service.includes(".")) {
      continue;
    }
    const name = service.split(".")[1];
    const direction = DIRECTION_BY_SERVICE[name];
    for (const entity of entityIdsOf(step.raw)) {
      out.push({ entity, direction, service, path: step.path });
    }
  }
  return out;
};

export type OverlapBasis = "same_trigger" | "same_time" | "same_trigger_entity";

export interface ConflictFinding {
  kind: "conflict";
  entity: string;
  first: { id: string; name: string; command: Command };
  second: { id: string; name: string; command: Command };
  basis: OverlapBasis;
}

export interface LoopFinding {
  kind: "loop";
  /** Automations in the cycle, in order; the last one leads back to the first. */
  cycle: { id: string; name: string }[];
  /** The entities that connect one automation to the next. */
  via: string[];
}

export type Finding = ConflictFinding | LoopFinding;

const overlap = (
  a: TriggerFact[],
  b: TriggerFact[]
): OverlapBasis | undefined => {
  for (const x of a) {
    for (const y of b) {
      if (x.fingerprint === y.fingerprint) {
        return "same_trigger";
      }
      if (x.type === "time" && y.type === "time" && x.at && x.at === y.at) {
        return "same_time";
      }
      if (
        x.type === "state" &&
        y.type === "state" &&
        x.entities.some((e) => y.entities.includes(e))
      ) {
        return "same_trigger_entity";
      }
    }
  }
  return undefined;
};

export const findConflicts = (
  automations: AnalysedAutomation[]
): ConflictFinding[] => {
  const facts = automations.map((a) => ({
    a,
    triggers: extractTriggers(a.config),
    commands: extractCommands(a.config),
  }));
  const out: ConflictFinding[] = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const basis = overlap(facts[i].triggers, facts[j].triggers);
      if (!basis) {
        continue;
      }
      const seen = new Set<string>();
      for (const c1 of facts[i].commands) {
        if (!c1.direction) {
          continue;
        }
        for (const c2 of facts[j].commands) {
          if (
            c2.entity === c1.entity &&
            c2.direction === OPPOSITE[c1.direction]
          ) {
            if (seen.has(c1.entity)) {
              continue;
            }
            seen.add(c1.entity);
            out.push({
              kind: "conflict",
              entity: c1.entity,
              first: { id: facts[i].a.id, name: facts[i].a.name, command: c1 },
              second: { id: facts[j].a.id, name: facts[j].a.name, command: c2 },
              basis,
            });
          }
        }
      }
    }
  }
  return out;
};

interface Edge {
  to: number;
  entity: string;
}

/** Can a command make this trigger fire? */
const commandWakes = (command: Command, trigger: TriggerFact): boolean => {
  if (trigger.type === "state" && trigger.entities.includes(command.entity)) {
    if (!trigger.to || !command.direction) {
      return true;
    }
    return STATE_AFTER[command.direction].some((s) => trigger.to!.includes(s));
  }
  return false;
};

export const findLoops = (
  automations: AnalysedAutomation[],
  maxLength = 4
): LoopFinding[] => {
  const facts = automations.map((a) => ({
    a,
    triggers: extractTriggers(a.config),
    commands: extractCommands(a.config),
  }));
  const edges: Edge[][] = facts.map(() => []);
  facts.forEach((from, i) => {
    for (const command of from.commands) {
      facts.forEach((to, j) => {
        let wakes = to.triggers.some((t) => commandWakes(command, t));
        // Starting another automation by name also wakes it.
        if (
          !wakes &&
          command.service === "automation.trigger" &&
          command.entity === to.a.id
        ) {
          wakes = true;
        }
        if (
          wakes &&
          !edges[i].some((e) => e.to === j && e.entity === command.entity)
        ) {
          edges[i].push({ to: j, entity: command.entity });
        }
      });
    }
  });

  const found: LoopFinding[] = [];
  const keys = new Set<string>();
  const walk = (start: number, node: number, path: number[], via: string[]) => {
    for (const edge of edges[node]) {
      if (edge.to === start) {
        const cycle = [...path];
        const key = [...cycle].sort((a, b) => a - b).join("-");
        if (!keys.has(key)) {
          keys.add(key);
          found.push({
            kind: "loop",
            cycle: cycle.map((n) => ({
              id: facts[n].a.id,
              name: facts[n].a.name,
            })),
            via: [...via, edge.entity],
          });
        }
      } else if (
        edge.to > start &&
        !path.includes(edge.to) &&
        path.length < maxLength
      ) {
        walk(start, edge.to, [...path, edge.to], [...via, edge.entity]);
      }
    }
  };
  facts.forEach((_f, start) => walk(start, start, [start], []));
  return found;
};

export const analyse = (automations: AnalysedAutomation[]) => ({
  conflicts: findConflicts(automations),
  loops: findLoops(automations),
});

/** Whether a configuration has steps this analysis can read. */
export const isAnalysable = (config: unknown): boolean => {
  if (!isRec(config)) {
    return false;
  }
  const parts = configParts(config);
  return parts.triggers.length > 0 || parts.actions.length > 0;
};
