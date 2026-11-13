/**
 * Evaluates regular expressions away from the page, so that a slow pattern
 * can be stopped by ending this worker. See `runner.ts`.
 */

import type { TraceResult } from "./trace";
import { traceMatch } from "./trace";

export interface RegexGroupResult {
  /** Undefined when the group did not take part in the match. */
  text?: string;
  start?: number;
  end?: number;
  name?: string;
}

export interface RegexMatchResult {
  index: number;
  end: number;
  text: string;
  groups: RegexGroupResult[];
}

export type RegexWorkerRequest =
  | {
      id: number;
      type: "run";
      pattern: string;
      flags: string;
      sample: string;
      maxMatches: number;
      replacement?: string;
      split?: boolean;
    }
  | {
      id: number;
      type: "cases";
      pattern: string;
      flags: string;
      cases: string[];
    }
  | {
      id: number;
      type: "time";
      pattern: string;
      flags: string;
      sample: string;
      iterations: number;
    }
  | {
      id: number;
      type: "trace";
      pattern: string;
      flags: string;
      sample: string;
      from: number;
    };

export type RegexWorkerResult =
  | {
      type: "run";
      matches: RegexMatchResult[];
      /** All matches found, also those beyond the listed ones. */
      total: number;
      /** True when counting stopped at the hard limit. */
      truncated: boolean;
      durationMs: number;
      replaced?: string;
      parts?: string[];
      /** Whether match positions for groups are available in this engine. */
      groupPositions: boolean;
    }
  | { type: "cases"; matched: boolean[]; durationMs: number }
  | { type: "time"; timings: number[]; total: number }
  | { type: "trace"; trace: TraceResult };

export type RegexWorkerResponse =
  | { id: number; ok: true; result: RegexWorkerResult }
  | { id: number; ok: false; message: string };

const HARD_MATCH_LIMIT = 100000;
const MAX_PARTS = 1000;
const MAX_OUTPUT = 200000;

// A literal with an unknown flag would stop the whole file from parsing, so
// the flag is passed as a variable.
const INDICES_FLAG = "d";

const supportsIndices = (() => {
  try {
    const probe: RegExp & { hasIndices?: boolean } = new RegExp(
      "",
      INDICES_FLAG
    );
    return probe.hasIndices === true;
  } catch (_err) {
    return false;
  }
})();

const advance = (sample: string, index: number, unicode: boolean): number => {
  if (unicode && index < sample.length) {
    const code = sample.codePointAt(index)!;
    return index + (code > 0xffff ? 2 : 1);
  }
  return index + 1;
};

const run = (
  request: Extract<RegexWorkerRequest, { type: "run" }>
): RegexWorkerResult => {
  const { pattern, flags, sample, maxMatches } = request;
  const withIndices =
    supportsIndices && !flags.includes("d") ? `${flags}d` : flags;
  const regex = new RegExp(pattern, withIndices);
  const repeat = regex.global || regex.sticky;
  const unicode = regex.unicode || flags.includes("v");
  const names = new Map<number, string>();
  const matches: RegexMatchResult[] = [];
  let total = 0;
  let truncated = false;

  const started = performance.now();
  regex.lastIndex = 0;
  for (;;) {
    const match = regex.exec(sample);
    if (!match) {
      break;
    }
    total++;
    if (matches.length < maxMatches) {
      const indices = (
        match as RegExpExecArray & {
          indices?: ([number, number] | undefined)[] & {
            groups?: Record<string, [number, number] | undefined>;
          };
        }
      ).indices;
      if (match.groups && !names.size && indices?.groups) {
        // Map each name to its group number through the positions.
        Object.entries(indices.groups).forEach(([name, range]) => {
          const number = indices.findIndex(
            (candidate, position) => position > 0 && candidate === range
          );
          if (number > 0) {
            names.set(number, name);
          }
        });
      }
      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        text: match[0],
        groups: match.slice(1).map((text, position) => ({
          text,
          start: indices?.[position + 1]?.[0],
          end: indices?.[position + 1]?.[1],
          name: names.get(position + 1),
        })),
      });
    }
    if (!repeat) {
      break;
    }
    if (match[0] === "") {
      regex.lastIndex = advance(sample, regex.lastIndex, unicode);
      if (regex.lastIndex > sample.length) {
        break;
      }
    }
    if (total >= HARD_MATCH_LIMIT) {
      truncated = true;
      break;
    }
  }
  const durationMs = performance.now() - started;

  const result: RegexWorkerResult = {
    type: "run",
    matches,
    total,
    truncated,
    durationMs,
    groupPositions: supportsIndices,
  };
  if (request.replacement !== undefined) {
    regex.lastIndex = 0;
    result.replaced = sample
      .replace(new RegExp(pattern, flags), request.replacement)
      .slice(0, MAX_OUTPUT);
  }
  if (request.split) {
    result.parts = sample
      .split(new RegExp(pattern, flags), MAX_PARTS)
      .map((part) => (part === undefined ? "" : String(part)));
  }
  return result;
};

const cases = (
  request: Extract<RegexWorkerRequest, { type: "cases" }>
): RegexWorkerResult => {
  const flags = request.flags.replace(/[gy]/g, "");
  const regex = new RegExp(request.pattern, flags);
  const started = performance.now();
  const matched = request.cases.map((text) => regex.test(text));
  return { type: "cases", matched, durationMs: performance.now() - started };
};

const time = (
  request: Extract<RegexWorkerRequest, { type: "time" }>
): RegexWorkerResult => {
  const flags = request.flags.includes("g")
    ? request.flags
    : `${request.flags}g`;
  const timings: number[] = [];
  let total = 0;
  for (let iteration = 0; iteration < request.iterations; iteration++) {
    const regex = new RegExp(request.pattern, flags.replace("y", ""));
    const unicode = regex.unicode || flags.includes("v");
    let count = 0;
    const started = performance.now();
    for (;;) {
      const match = regex.exec(request.sample);
      if (!match) {
        break;
      }
      count++;
      if (match[0] === "") {
        regex.lastIndex = advance(request.sample, regex.lastIndex, unicode);
        if (regex.lastIndex > request.sample.length) {
          break;
        }
      }
      if (count >= HARD_MATCH_LIMIT) {
        break;
      }
    }
    timings.push(performance.now() - started);
    total = count;
  }
  return { type: "time", timings, total };
};

const trace = (
  request: Extract<RegexWorkerRequest, { type: "trace" }>
): RegexWorkerResult => ({
  type: "trace",
  trace: traceMatch(
    request.pattern,
    request.flags,
    request.sample,
    request.from
  ),
});

self.onmessage = (ev: MessageEvent<RegexWorkerRequest>) => {
  const request = ev.data;
  let response: RegexWorkerResponse;
  try {
    const result =
      request.type === "run"
        ? run(request)
        : request.type === "cases"
          ? cases(request)
          : request.type === "trace"
            ? trace(request)
            : time(request);
    response = { id: request.id, ok: true, result };
  } catch (err: unknown) {
    response = {
      id: request.id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  (self as unknown as Worker).postMessage(response);
};
