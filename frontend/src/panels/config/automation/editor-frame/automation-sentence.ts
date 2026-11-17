export interface SentenceConfig {
  alias?: string;
  triggers?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  condition?: unknown;
  actions?: unknown;
  action?: unknown;
  sequence?: unknown;
}

export interface SentenceDescribers {
  trigger: (item: any) => string;
  condition: (item: any) => string;
  action: (item: any) => string;
}

export interface SentenceParts {
  when: string[];
  onlyIf: string[];
  then: string[];
}

const toList = (value: unknown): unknown[] => {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const describeAll = (
  items: unknown[],
  describe: (item: any) => string
): string[] => {
  const out: string[] = [];
  for (const item of items) {
    try {
      const text = describe(item);
      if (typeof text === "string" && text.trim()) {
        out.push(text.trim());
      }
    } catch (_err) {
      // A step that cannot be described is left out of the sentence.
    }
  }
  return out;
};

/**
 * The parts of the one-sentence summary. A step that cannot be described is
 * skipped, so the result never carries an error text. When nothing at all can
 * be described the three lists are empty and the caller shows the alias only.
 */
export const buildSentenceParts = (
  config: SentenceConfig | undefined,
  describers: SentenceDescribers
): SentenceParts => {
  if (!config) {
    return { when: [], onlyIf: [], then: [] };
  }
  return {
    when: describeAll(
      toList(config.triggers ?? config.trigger),
      describers.trigger
    ),
    onlyIf: describeAll(
      toList(config.conditions ?? config.condition),
      describers.condition
    ),
    then: describeAll(
      toList(config.actions ?? config.action ?? config.sequence),
      describers.action
    ),
  };
};

/** True when the description text is one of the localized "could not describe" messages. */
export const isDescribeError = (text: string, errorPrefix: string): boolean =>
  !!errorPrefix && text.trim().startsWith(errorPrefix.trim());

/**
 * What the hero block shows: the sentence when at least one part could be
 * described, otherwise the alias, otherwise nothing.
 */
export const heroText = (
  parts: SentenceParts,
  alias: string | undefined,
  compose: (parts: SentenceParts) => string
): string => {
  const described =
    parts.when.length || parts.onlyIf.length || parts.then.length;
  if (described) {
    return compose(parts);
  }
  return alias?.trim() || "";
};
