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

const ADDRESS_HIDDEN = "[address hidden]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

const MAC =
  /(?<![\w:-])(?:[0-9a-f]{2}([:-]))(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}(?![\w:-])/gi;

const HEX = "[0-9a-f]{1,4}";

// Eight groups, or a shortened form that contains "::". A time such as
// 02:49:13 has neither, so it is left alone.
const IPV6_FULL = new RegExp(`(?<![\\w:])(?:${HEX}:){7}${HEX}(?![\\w:])`, "gi");
const IPV6_SHORT = new RegExp(
  `(?<![\\w:])(?:(?:${HEX}:){1,7}:|::)(?:${HEX}(?::${HEX}){0,6})?(?![\\w:])`,
  "gi"
);

// Four numbers up to 255. The boundaries keep a longer dotted number, such as
// the version 2026.11.1.85, from being read as an address.
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(
  `(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?![\\d])(?!\\.\\d)`,
  "g"
);

/**
 * Hides IPv4, IPv6 and MAC addresses and email addresses. Only for free text
 * such as problem titles: it would also change a version such as 1.2.3.4.
 */
export const hideAddresses = (text: string): string =>
  text
    .replace(EMAIL, ADDRESS_HIDDEN)
    .replace(MAC, ADDRESS_HIDDEN)
    .replace(IPV6_FULL, ADDRESS_HIDDEN)
    .replace(IPV6_SHORT, ADDRESS_HIDDEN)
    .replace(IPV4, ADDRESS_HIDDEN);

/** The name of the saved file, with the day the bundle was made. */
export const supportBundleFileName = (generatedAt: Date): string =>
  `support-bundle-${generatedAt.toISOString().slice(0, 10)}.txt`;

const title = (value: string): string => hideAddresses(oneLine(value));

/**
 * Builds the plain text a person may copy or save. Every free-text value goes
 * through the redaction first, problem titles also lose network and email
 * addresses, and the problem details (messages and tracebacks) are left out
 * altogether: only titles, counts and dates are kept.
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
        `  - ${title(problem.title)} (${problem.count} time${
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
    "Included: the Home Assistant version and state, language, time zone, browser, the loaded integrations, and the titles, counts and dates of recorded problems."
  );
  lines.push(
    "Not included: messages and tracebacks, passwords, tokens, and the contents of any dashboard."
  );
  lines.push(
    "Problem titles have IP addresses, MAC addresses and email addresses hidden, but may still contain names of people, devices, places or entities. Read them before you share this."
  );
  return `${lines.join("\n")}\n`;
};
