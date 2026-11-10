import type { LogbookEntry } from "../../data/logbook";

export interface LogbookStats {
  /** How many entries are in the list. */
  total: number;
  /** The hour of the day, 0 to 23, with the most entries, and its count. */
  busiestHour?: { hour: number; count: number };
  /** The things with the most entries, most first. */
  mostActive: { key: string; entityId?: string; name: string; count: number }[];
}

/**
 * Counts what a list of logbook entries holds: how many there are, which hour
 * of the day has the most, and which things appear most. Only what the list
 * says is counted.
 */
export const computeLogbookStats = (
  entries: LogbookEntry[],
  limit = 3
): LogbookStats => {
  const hours = new Array<number>(24).fill(0);
  const things = new Map<
    string,
    { entityId?: string; name: string; count: number }
  >();
  for (const entry of entries) {
    hours[new Date(entry.when * 1000).getHours()]++;
    const key = entry.entity_id ?? entry.name;
    if (!key) {
      continue;
    }
    const thing = things.get(key);
    if (thing) {
      thing.count++;
    } else {
      things.set(key, {
        entityId: entry.entity_id,
        name: entry.name ?? key,
        count: 1,
      });
    }
  }
  let busiestHour: LogbookStats["busiestHour"];
  hours.forEach((count, hour) => {
    if (count > 0 && (!busiestHour || count > busiestHour.count)) {
      busiestHour = { hour, count };
    }
  });
  return {
    total: entries.length,
    busiestHour,
    mostActive: [...things.entries()]
      .map(([key, thing]) => ({ key, ...thing }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit),
  };
};
