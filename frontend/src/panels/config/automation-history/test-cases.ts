/**
 * Named test cases for an automation.
 *
 * A test case describes a situation: which trigger fires, with which
 * variables, and what the entities are pretending to be. It is only ever used
 * for a simulated run, which changes nothing in the house. Cases are kept in
 * this browser, one list per automation.
 */

/** What a person expects the conditions to do in the situation. */
export type ExpectedOutcome = "pass" | "fail";

export const EXPECTED_OUTCOMES: readonly ExpectedOutcome[] = ["pass", "fail"];

export interface TestCase {
  id: string;
  name: string;
  trigger: {
    /** The `id` of the trigger that fires, when it has one. */
    id: string;
    /** A plain description of what fires it. */
    description: string;
    variables: Record<string, string>;
  };
  /** Fake states, by entity id. Nothing outside this list exists. */
  states: Record<string, string>;
  expected: ExpectedOutcome;
}

/** Limits that keep a list of cases small enough to store and to read. */
export const TEST_CASE_LIMITS = {
  maxCases: 20,
  maxName: 80,
  maxTriggerId: 80,
  maxDescription: 200,
  maxVariables: 20,
  maxVariableName: 64,
  maxValue: 255,
  maxStates: 50,
  maxEntityId: 255,
} as const;

export type TestCaseError =
  | "name_empty"
  | "name_too_long"
  | "name_taken"
  | "too_many_cases"
  | "trigger_id_too_long"
  | "description_too_long"
  | "too_many_variables"
  | "variable_name_invalid"
  | "variable_too_long"
  | "too_many_states"
  | "entity_id_invalid"
  | "state_too_long"
  | "expected_invalid";

export interface TestCaseDraft {
  name: string;
  trigger: { id?: string; description?: string; variables?: unknown };
  states?: unknown;
  expected?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: TestCaseError[];
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const entriesOf = (value: unknown): [string, unknown][] =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>)
    : [];

/**
 * Checks a draft against the limits. `others` are the cases already in the
 * list, so a name cannot be used twice and the list cannot outgrow its cap.
 * `selfId` is the case being edited, which is allowed to keep its own name.
 */
export const validateTestCase = (
  draft: TestCaseDraft,
  others: readonly TestCase[] = [],
  selfId?: string
): ValidationResult => {
  const errors = new Set<TestCaseError>();
  const limits = TEST_CASE_LIMITS;
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  if (!name) {
    errors.add("name_empty");
  } else if (name.length > limits.maxName) {
    errors.add("name_too_long");
  } else if (
    others.some(
      (item) =>
        item.id !== selfId && item.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    errors.add("name_taken");
  }
  if (selfId === undefined && others.length >= limits.maxCases) {
    errors.add("too_many_cases");
  }
  const trigger = draft.trigger ?? {};
  if (String(trigger.id ?? "").length > limits.maxTriggerId) {
    errors.add("trigger_id_too_long");
  }
  if (String(trigger.description ?? "").length > limits.maxDescription) {
    errors.add("description_too_long");
  }
  const variables = entriesOf(trigger.variables);
  if (variables.length > limits.maxVariables) {
    errors.add("too_many_variables");
  }
  variables.forEach(([key, value]) => {
    if (key.length > limits.maxVariableName || !VARIABLE_NAME.test(key)) {
      errors.add("variable_name_invalid");
    }
    if (String(value ?? "").length > limits.maxValue) {
      errors.add("variable_too_long");
    }
  });
  const states = entriesOf(draft.states);
  if (states.length > limits.maxStates) {
    errors.add("too_many_states");
  }
  states.forEach(([entityId, value]) => {
    if (entityId.length > limits.maxEntityId || !ENTITY_ID.test(entityId)) {
      errors.add("entity_id_invalid");
    }
    if (String(value ?? "").length > limits.maxValue) {
      errors.add("state_too_long");
    }
  });
  if (
    draft.expected !== undefined &&
    !EXPECTED_OUTCOMES.includes(draft.expected as ExpectedOutcome)
  ) {
    errors.add("expected_invalid");
  }
  return { ok: errors.size === 0, errors: [...errors] };
};

const stringRecord = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  entriesOf(value).forEach(([key, item]) => {
    out[key] = String(item ?? "");
  });
  return out;
};

/** Builds a case from a validated draft. Call `validateTestCase` first. */
export const buildTestCase = (draft: TestCaseDraft, id: string): TestCase => ({
  id,
  name: draft.name.trim(),
  trigger: {
    id: String(draft.trigger?.id ?? "").trim(),
    description: String(draft.trigger?.description ?? "").trim(),
    variables: stringRecord(draft.trigger?.variables),
  },
  states: stringRecord(draft.states),
  expected: draft.expected === "fail" ? "fail" : "pass",
});

let idCounter = 0;

export const newTestCaseId = (): string => {
  idCounter++;
  return `tc-${Date.now().toString(36)}-${idCounter}-${Math.floor(
    Math.random() * 1296
  ).toString(36)}`;
};

// ---- Plain text editing of key and value lines ----

/** Reads lines such as `sensor.temp = 21` into a record. Blank lines go. */
export const parseKeyValueLines = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf("=");
    if (index < 0) {
      return;
    }
    const key = line.slice(0, index).trim();
    if (key) {
      out[key] = line.slice(index + 1).trim();
    }
  });
  return out;
};

export const formatKeyValueLines = (record: Record<string, string>): string =>
  Object.entries(record)
    .map(([key, value]) => `${key} = ${value}`)
    .join("\n");

// ---- List operations, free of storage ----

export const renameTestCase = (
  cases: readonly TestCase[],
  id: string,
  name: string
): { cases: TestCase[]; errors: TestCaseError[] } => {
  const target = cases.find((item) => item.id === id);
  if (!target) {
    return { cases: [...cases], errors: [] };
  }
  const { errors } = validateTestCase({ ...target, name }, cases, id);
  const nameErrors = errors.filter((error) => error.startsWith("name_"));
  if (nameErrors.length) {
    return { cases: [...cases], errors: nameErrors };
  }
  return {
    cases: cases.map((item) =>
      item.id === id ? { ...item, name: name.trim() } : item
    ),
    errors: [],
  };
};

/** The first name `<name> copy`, `<name> copy 2`, ... that fits and is free. */
export const copyName = (
  cases: readonly TestCase[],
  name: string,
  copyWord: string
): string => {
  const taken = new Set(cases.map((item) => item.name.toLowerCase()));
  const max = TEST_CASE_LIMITS.maxName;
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? ` ${copyWord}` : ` ${copyWord} ${n}`;
    const candidate = `${name.slice(0, max - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return name.slice(0, max);
};

export const duplicateTestCase = (
  cases: readonly TestCase[],
  id: string,
  copyWord: string,
  newId: string = newTestCaseId()
): { cases: TestCase[]; errors: TestCaseError[] } => {
  const source = cases.find((item) => item.id === id);
  if (!source) {
    return { cases: [...cases], errors: [] };
  }
  if (cases.length >= TEST_CASE_LIMITS.maxCases) {
    return { cases: [...cases], errors: ["too_many_cases"] };
  }
  const copy: TestCase = {
    ...source,
    id: newId,
    name: copyName(cases, source.name, copyWord),
    trigger: {
      ...source.trigger,
      variables: { ...source.trigger.variables },
    },
    states: { ...source.states },
  };
  return { cases: [...cases, copy], errors: [] };
};

export const deleteTestCase = (
  cases: readonly TestCase[],
  id: string
): TestCase[] => cases.filter((item) => item.id !== id);

// ---- Storage, in this browser ----

const STORAGE_PREFIX = "ha-automation-test-cases:";

export const testCaseStorageKey = (automationId: string): string =>
  `${STORAGE_PREFIX}${automationId}`;

/**
 * Reads the cases of an automation. Storage that is missing, blocked or
 * holds something unreadable gives an empty list, and a stored case that
 * breaks the limits is left out rather than shown half-valid.
 */
export const loadTestCases = (automationId: string): TestCase[] => {
  try {
    const raw = localStorage.getItem(testCaseStorageKey(automationId));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const kept: TestCase[] = [];
    parsed.forEach((item: any) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.name !== "string" ||
        kept.length >= TEST_CASE_LIMITS.maxCases
      ) {
        return;
      }
      const draft: TestCaseDraft = {
        name: item.name,
        trigger: item.trigger ?? {},
        states: item.states,
        expected: item.expected,
      };
      const { ok } = validateTestCase(
        draft,
        kept.filter((other) => other.id !== item.id),
        item.id
      );
      if (ok) {
        kept.push(
          buildTestCase({ ...draft, expected: item.expected }, item.id)
        );
      }
    });
    return kept;
  } catch (_err) {
    return [];
  }
};

/** Whether the list was stored. False when storage refuses. */
export const saveTestCases = (
  automationId: string,
  cases: readonly TestCase[]
): boolean => {
  try {
    const key = testCaseStorageKey(automationId);
    if (cases.length) {
      localStorage.setItem(key, JSON.stringify(cases));
    } else {
      localStorage.removeItem(key);
    }
    return true;
  } catch (_err) {
    return false;
  }
};
