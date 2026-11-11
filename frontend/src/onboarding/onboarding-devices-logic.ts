import { DISCOVERY_SOURCES } from "../data/config_flow";

/** Where an item stands while the person sets devices up. */
export type DeviceStatus = "ready" | "running" | "added" | "unfinished";

/** The part of a discovery flow in progress that this step needs. */
export interface DiscoveredFlow {
  flow_id: string;
  handler: string;
  title: string;
  source?: string;
}

export interface DeviceItem {
  /** Flow id for a discovered item, `entry:<domain>` for an existing one. */
  id: string;
  domain: string;
  title: string;
  source?: string;
  flowId?: string;
  status: DeviceStatus;
  /** Only an item with a flow still to be set up can be chosen. */
  selectable: boolean;
}

export type SourceKey = (typeof DISCOVERY_SOURCES)[number] | "other";

export const sourceKey = (source: string | undefined): SourceKey =>
  source && DISCOVERY_SOURCES.includes(source) ? source : "other";

/**
 * Items shown in the list: every discovered flow, then each configured
 * integration that has no discovered flow left, sorted by title.
 */
export const buildDeviceItems = (
  flows: Iterable<DiscoveredFlow>,
  configuredDomains: ReadonlySet<string>,
  progress: ReadonlyMap<string, DeviceStatus>,
  domainTitle: (domain: string) => string,
  compare: (a: string, b: string) => number
): DeviceItem[] => {
  const items: DeviceItem[] = [];
  const withFlow = new Set<string>();
  for (const flow of flows) {
    withFlow.add(flow.handler);
    const status = progress.get(flow.flow_id) ?? "ready";
    items.push({
      id: flow.flow_id,
      domain: flow.handler,
      title: flow.title,
      source: flow.source,
      flowId: flow.flow_id,
      status,
      selectable: status === "ready" || status === "unfinished",
    });
  }
  for (const domain of configuredDomains) {
    if (withFlow.has(domain)) {
      continue;
    }
    items.push({
      id: `entry:${domain}`,
      domain,
      title: domainTitle(domain),
      status: "added",
      selectable: false,
    });
  }
  return items.sort((a, b) => compare(a.title, b.title) || compare(a.id, b.id));
};

/** Flow ids that are chosen and still waiting, in list order. */
export const itemsToSetUp = (
  items: readonly DeviceItem[],
  chosen: ReadonlySet<string>
): string[] =>
  items
    .filter((item) => item.selectable && item.flowId && chosen.has(item.id))
    .map((item) => item.flowId!);

/** Keeps the choice of items that still exist and adds new ones as chosen. */
export const syncChoice = (
  chosen: ReadonlySet<string>,
  known: ReadonlySet<string>,
  items: readonly DeviceItem[]
): { chosen: Set<string>; known: Set<string> } => {
  const nextChosen = new Set<string>();
  const nextKnown = new Set<string>();
  for (const item of items) {
    if (!item.selectable) {
      continue;
    }
    nextKnown.add(item.id);
    // A new item starts chosen; an earlier decision to skip it is kept.
    if (!known.has(item.id) || chosen.has(item.id)) {
      nextChosen.add(item.id);
    }
  }
  return { chosen: nextChosen, known: nextKnown };
};
