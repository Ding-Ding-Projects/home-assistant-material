import { describe, expect, it } from "vitest";
import {
  normalizeToastDuration,
  ToastStack,
} from "../../../src/common/toast/toast-stack";

const item = (key: string, text = key, identified = true) => ({
  key,
  text,
  identified,
  data: key,
});

describe("ToastStack queueing", () => {
  it("shows up to three toasts and queues the rest in order", () => {
    const stack = new ToastStack<string>();
    expect(stack.push(item("a")).outcome).toBe("shown");
    expect(stack.push(item("b")).outcome).toBe("shown");
    expect(stack.push(item("c")).outcome).toBe("shown");
    expect(stack.push(item("d")).outcome).toBe("queued");
    expect(stack.push(item("e")).outcome).toBe("queued");

    expect(stack.visible.map((entry) => entry.key)).toEqual(["a", "b", "c"]);
    expect(stack.queued.map((entry) => entry.key)).toEqual(["d", "e"]);
  });

  it("promotes the oldest waiting toast when a visible one closes", () => {
    const stack = new ToastStack<string>({ maxVisible: 2 });
    ["a", "b", "c", "d"].forEach((key) => stack.push(item(key)));

    const promoted = stack.remove("a");

    expect(promoted?.key).toBe("c");
    expect(stack.visible.map((entry) => entry.key)).toEqual(["b", "c"]);
    expect(stack.queued.map((entry) => entry.key)).toEqual(["d"]);
  });

  it("drops a waiting toast without promoting anything", () => {
    const stack = new ToastStack<string>({ maxVisible: 1 });
    stack.push(item("a"));
    stack.push(item("b"));

    expect(stack.remove("b")).toBeUndefined();
    expect(stack.visible.map((entry) => entry.key)).toEqual(["a"]);
    expect(stack.queued).toHaveLength(0);
  });

  it("updates a toast with the same key in place, visible or waiting", () => {
    const stack = new ToastStack<string>({ maxVisible: 1 });
    stack.push(item("a"));
    stack.push(item("b"));

    expect(stack.push({ ...item("a"), data: "a2" }).outcome).toBe("updated");
    expect(stack.push({ ...item("b"), data: "b2" }).outcome).toBe(
      "updated-queued"
    );
    expect(stack.get("a")?.data).toBe("a2");
    expect(stack.get("b")?.data).toBe("b2");
    expect(stack.all).toHaveLength(2);
  });
});

describe("ToastStack de-duplication", () => {
  it("drops an identical message arriving within two seconds", () => {
    let now = 1000;
    const stack = new ToastStack<string>({ now: () => now });
    expect(stack.push(item("a1", "Saved", false)).outcome).toBe("shown");

    now = 2500;
    expect(stack.push(item("a2", "Saved", false)).outcome).toBe("duplicate");
    expect(stack.all).toHaveLength(1);
  });

  it("accepts the same message again after the window has passed", () => {
    let now = 1000;
    const stack = new ToastStack<string>({ now: () => now });
    stack.push(item("a1", "Saved", false));

    now = 3500;
    expect(stack.push(item("a2", "Saved", false)).outcome).toBe("shown");
    expect(stack.all).toHaveLength(2);
  });

  it("accepts the message again once the earlier one has closed", () => {
    let now = 1000;
    const stack = new ToastStack<string>({ now: () => now });
    stack.push(item("a1", "Saved", false));
    stack.remove("a1");

    now = 1200;
    expect(stack.push(item("a2", "Saved", false)).outcome).toBe("shown");
  });

  it("never treats identified toasts as duplicates of each other", () => {
    const stack = new ToastStack<string>();
    stack.push(item("x", "Same", true));
    expect(stack.push(item("y", "Same", true)).outcome).toBe("shown");
  });
});

describe("normalizeToastDuration", () => {
  it.each([
    { duration: undefined, severity: undefined, expected: 4000 },
    { duration: 1, severity: undefined, expected: 4000 },
    { duration: 4000, severity: undefined, expected: 4000 },
    { duration: 9000, severity: undefined, expected: 9000 },
    { duration: -1, severity: undefined, expected: -1 },
    { duration: undefined, severity: "error" as const, expected: -1 },
    { duration: undefined, severity: "warning" as const, expected: -1 },
    { duration: 6000, severity: "error" as const, expected: 6000 },
  ])(
    "maps $duration with severity $severity to $expected",
    ({ duration, severity, expected }) => {
      expect(normalizeToastDuration(duration, severity)).toBe(expected);
    }
  );

  it("keeps a progress toast until it is closed", () => {
    expect(normalizeToastDuration(2000, undefined, true)).toBe(-1);
  });
});
