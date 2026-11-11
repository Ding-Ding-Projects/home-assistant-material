import { afterEach, describe, expect, it, vi } from "vitest";
import type { HaToast } from "../../src/components/ha-toast";
import "../../src/components/ha-toast";

let toast: HaToast | undefined;

const mountToast = async (properties: Partial<HaToast> = {}) => {
  toast = document.createElement("ha-toast");
  Object.assign(toast, properties);
  document.body.append(toast);
  await toast.updateComplete;
  return toast;
};

afterEach(() => {
  toast?.remove();
  toast = undefined;
  vi.useRealTimers();
});

const showToast = async (element: HaToast) => {
  vi.useFakeTimers();
  const shown = element.show();
  await element.updateComplete;
  Object.defineProperty(
    element.shadowRoot!.querySelector(".toast"),
    "getAnimations",
    {
      configurable: true,
      value: () => [],
    }
  );
  await vi.advanceTimersByTimeAsync(20);
  await shown;
};

describe("ha-toast", () => {
  it.each(["action", "dismiss", "programmatic"] as const)(
    "reports a %s close reason",
    async (reason) => {
      const element = await mountToast({ timeoutMs: -1 });
      const listener = vi.fn();
      element.addEventListener("toast-closed", listener);
      await showToast(element);

      await element.hide(reason);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].detail).toEqual({ reason });
      expect(
        element
          .shadowRoot!.querySelector(".toast")!
          .classList.contains("active")
      ).toBe(false);
      expect(
        element
          .shadowRoot!.querySelector(".assistive-message")!
          .getAttribute("aria-live")
      ).toBe("off");
    }
  );

  it("closes with a timeout reason", async () => {
    const element = await mountToast({ timeoutMs: 1000 });
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);
    await showToast(element);

    await vi.advanceTimersByTimeAsync(1000);

    expect(listener.mock.calls[0][0].detail).toEqual({ reason: "timeout" });
  });

  it("does not close automatically when the timeout is disabled", async () => {
    const element = await mountToast({ timeoutMs: -1 });
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);
    await showToast(element);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("pauses its timer while hovered and resumes with the time left", async () => {
    const element = await mountToast({ timeoutMs: 1000 });
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);
    await showToast(element);
    const surface = element.shadowRoot!.querySelector(".toast")!;

    await vi.advanceTimersByTimeAsync(600);
    surface.dispatchEvent(new Event("pointerenter"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).not.toHaveBeenCalled();

    surface.dispatchEvent(new Event("pointerleave"));
    await vi.advanceTimersByTimeAsync(300);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(listener.mock.calls[0][0].detail).toEqual({ reason: "timeout" });
  });

  it("stays paused while focus is inside the toast and resumes when it leaves", async () => {
    const element = await mountToast({ timeoutMs: 1000 });
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);
    await showToast(element);
    const surface = element.shadowRoot!.querySelector(".toast")!;

    surface.dispatchEvent(new Event("focusin"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).not.toHaveBeenCalled();

    surface.dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not resume while it is still hovered after focus leaves", async () => {
    const element = await mountToast({ timeoutMs: 1000 });
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);
    await showToast(element);
    const surface = element.shadowRoot!.querySelector(".toast")!;

    surface.dispatchEvent(new Event("pointerenter"));
    surface.dispatchEvent(new Event("focusin"));
    surface.dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    await vi.advanceTimersByTimeAsync(5000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves announcing to its stack when silent", async () => {
    const element = await mountToast({ timeoutMs: -1, silent: true });
    await showToast(element);
    await element.updateComplete;

    const message = element.shadowRoot!.querySelector(".assistive-message")!;
    expect(message.getAttribute("aria-live")).toBe("off");
    expect(message.textContent!.trim()).toBe("");
  });

  it("does not emit a close event when already hidden", async () => {
    const element = await mountToast();
    const listener = vi.fn();
    element.addEventListener("toast-closed", listener);

    await element.hide("dismiss");

    expect(listener).not.toHaveBeenCalled();
  });
});
