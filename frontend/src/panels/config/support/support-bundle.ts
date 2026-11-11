import { redactDetails } from "../../../common/activity/redact-details";

/** One distinct problem, reduced to what a person needs to describe it. */
export interface BundleProblem {
  title: string;
  logger?: string;
  level?: string;
  version?: string;
  count: number;
  last_seen: string;
}

export interface BundleInput {
  generatedAt: Date;
  version: string;
  language: string;
  timeZone: string;
  state: string;
  safeMode: boolean;
  recoveryMode: boolean;
  components: string[];
  problems: BundleProblem[];
  /** True when the problem log could not be read; the bundle says so. */
  problemsUnavailable: boolean;
  userAgent: string;
}

/** Most problems listed; the rest are counted. */
export const BUNDLE_PROBLEM_LIMIT = 25;

/** Most integration names listed; the rest are counted. */
export const BUNDLE_COMPONENT_LIMIT = 400;

const oneLine = (value: string): string =>
  redactDetails(value).replace(/\s+/g, " ").trim();

/**
 * Builds the plain text a person may copy or save. Every free-text value goes
 * through the redaction first, and the problem details (messages and
 * tracebacks) are left out altogether: only titles, counts and dates are kept.
 */
export const buildSupportBundle = (input: BundleInput): string => {
  const lines: string[] = [];
  lines.push("Support bundle");
  lines.push(`Created: ${input.generatedAt.toISOString()}`);
  lines.push("");
  lines.push("System");
  lines.push(`  Version: ${oneLine(input.version)}`);
  lines.push(`  State: ${oneLine(input.state)}`);
  lines.push(`  Safe mode: ${input.safeMode ? "yes" : "no"}`);
  lines.push(`  Recovery mode: ${input.recoveryMode ? "yes" : "no"}`);
  lines.push(`  Language: ${oneLine(input.language)}`);
  lines.push(`  Time zone: ${oneLine(input.timeZone)}`);
  lines.push(`  Browser: ${oneLine(input.userAgent)}`);
  lines.push("");

  const components = [...new Set(input.components)].sort();
  lines.push(`Loaded integrations (${components.length})`);
  const shownComponents = components.slice(0, BUNDLE_COMPONENT_LIMIT);
  lines.push(`  ${shownComponents.map(oneLine).join(", ") || "none"}`);
  if (components.length > shownComponents.length) {
    lines.push(
      `  and ${components.length - shownComponents.length} more not listed`
    );
  }
  lines.push("");

  lines.push("Recorded problems");
  if (input.problemsUnavailable) {
    lines.push("  The problem log could not be read.");
  } else if (!input.problems.length) {
    lines.push("  None recorded.");
  } else {
    const ordered = [...input.problems].sort((a, b) =>
      b.last_seen.localeCompare(a.last_seen)
    );
    ordered.slice(0, BUNDLE_PROBLEM_LIMIT).forEach((problem) => {
      const parts = [
        problem.level,
        problem.logger,
        problem.version ? `version ${problem.version}` : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .map(oneLine);
      lines.push(
        `  - ${oneLine(problem.title)} (${problem.count} time${
          problem.count === 1 ? "" : "s"
        }, last ${oneLine(problem.last_seen)}${
          parts.length ? `; ${parts.join(", ")}` : ""
        })`
      );
    });
    if (ordered.length > BUNDLE_PROBLEM_LIMIT) {
      lines.push(
        `  and ${ordered.length - BUNDLE_PROBLEM_LIMIT} more not listed`
      );
    }
  }
  lines.push("");
  lines.push(
    "Not included: messages and tracebacks, passwords, tokens, addresses, names of people, devices or places, and the contents of any dashboard."
  );
  return `${lines.join("\n")}\n`;
};
