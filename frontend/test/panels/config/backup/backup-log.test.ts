import { describe, expect, it } from "vitest";
import {
  appendLogLines,
  cleanLogLine,
  filterLinesSince,
  findUploadFailureReason,
  lineTimestamp,
  maskSensitive,
  wallClock,
} from "../../../../src/panels/config/backup/helper/backup-log";

describe("maskSensitive", () => {
  it.each([
    ["password=hunter2 next", "hunter2"],
    ["token: abc123def456", "abc123def456"],
    ["Authorization: Bearer abcdefghijklmnop", "abcdefghijklmnop"],
    ['{"api_key": "sk_live_1234567890"}', "sk_live_1234567890"],
    ["client_secret=Zm9vYmFy", "Zm9vYmFy"],
    [
      "GET https://bucket.example.com/file.tar?X-Amz-Signature=deadbeef&X-Amz-Credential=AKIAXXX",
      "deadbeef",
    ],
    ["open https://u:pw12345@host.example/path", "pw12345"],
    [
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
      "eyJhbGciOiJIUzI1NiJ9",
    ],
    ["key ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ12-3456", "ABCD-EFGH"],
    [
      "hash 0123456789abcdef0123456789abcdef0123",
      "0123456789abcdef0123456789abcdef",
    ],
  ])("hides the secret in %s", (line, secret) => {
    const masked = maskSensitive(line);
    expect(masked).not.toContain(secret);
    expect(masked).toContain("•••");
  });

  it("leaves ordinary lines alone", () => {
    const line =
      "2026-11-17 19:49:01.123 INFO (MainThread) [homeassistant.components.backup.manager] Creating backup";
    expect(maskSensitive(line)).toBe(line);
  });

  it("hides the query of any address but keeps the path", () => {
    expect(maskSensitive("see https://example.com/a/b?x=1&y=2 done")).toBe(
      "see https://example.com/a/b?••• done"
    );
  });

  it("is applied when a line is cleaned for display", () => {
    expect(cleanLogLine("\u001b[32mpassword=abc\u001b[0m\r")).not.toContain(
      "abc"
    );
  });
});

describe("filtering by start time", () => {
  const since = wallClock(Date.UTC(2026, 10, 17, 19, 49, 0), "UTC");

  it("formats a wall clock string in a time zone", () => {
    expect(since).toBe("2026-11-17 19:49:00");
    expect(wallClock(Date.UTC(2026, 10, 17, 19, 49, 0), "Asia/Hong_Kong")).toBe(
      "2026-11-18 03:49:00"
    );
  });

  it("reads timestamps from core and supervisor lines", () => {
    expect(lineTimestamp("2026-11-17 19:49:01.123 INFO x")).toBe(
      "2026-11-17 19:49:01"
    );
    expect(lineTimestamp("26-11-17 19:49:01 INFO (MainThread) y")).toBe(
      "2026-11-17 19:49:01"
    );
    expect(lineTimestamp("  File traceback")).toBeUndefined();
  });

  it("keeps lines written since the start, with their continuation lines", () => {
    const lines = [
      "2026-11-17 19:48:00.000 INFO old",
      "Traceback of the old line",
      "2026-11-17 19:49:30.000 ERROR new",
      "Traceback of the new line",
    ];
    expect(filterLinesSince(lines, since)).toEqual([
      "2026-11-17 19:49:30.000 ERROR new",
      "Traceback of the new line",
    ]);
  });
});

describe("appendLogLines", () => {
  it("skips lines already shown and returns the same list when nothing is new", () => {
    const list = ["a", "b"];
    expect(appendLogLines(list, ["b", ""])).toBe(list);
    expect(appendLogLines(list, ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("keeps only the latest lines", () => {
    expect(appendLogLines(["a", "b"], ["c", "d"], 3)).toEqual(["b", "c", "d"]);
  });
});

describe("findUploadFailureReason", () => {
  const lines = [
    "2026-11-17 19:50:00 ERROR (MainThread) [x] Upload failed for google_drive.abc: Quota exceeded",
    "2026-11-17 19:50:01 ERROR (MainThread) [x] Upload failed for onedrive.def: Timeout",
  ];

  it("returns the reason written for that location", () => {
    expect(findUploadFailureReason(lines, "google_drive.abc")).toBe(
      "Quota exceeded"
    );
    expect(findUploadFailureReason(lines, "onedrive.def")).toBe("Timeout");
  });

  it("returns nothing when no line names the location", () => {
    expect(findUploadFailureReason(lines, "dropbox.zzz")).toBeUndefined();
  });
});
