import { html } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadConfigPanel } from "../../../../src/panels/config/integrations/integration-panels/thread/thread-config-panel";
import type { HomeAssistant } from "../../../../src/types";

class ThreadSubscriptionTestPanel extends ThreadConfigPanel {
  protected override render() {
    return html``;
  }
}

customElements.define("test-thread-subscription", ThreadSubscriptionTestPanel);

afterEach(() => document.body.replaceChildren());

describe("Thread settings data lifecycle", () => {
  it("waits for Thread setup before reading datasets or discovering routers", async () => {
    const read = vi.fn().mockResolvedValue({ datasets: [] });
    const unsubscribe = vi.fn();
    const subscribe = vi.fn().mockResolvedValue(unsubscribe);
    const hass = (components: string[]) =>
      ({
        config: { components },
        callWS: read,
        connection: { subscribeMessage: subscribe },
      }) as unknown as HomeAssistant;

    const panel = new ThreadSubscriptionTestPanel();
    panel.hass = hass([]);
    document.body.append(panel);
    await panel.updateComplete;
    expect(read).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();

    panel.hass = hass(["thread"]);
    await panel.updateComplete;
    expect(read).toHaveBeenCalledWith({ type: "thread/list_datasets" });
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function), {
      type: "thread/discover_routers",
    });

    panel.hass = hass(["thread"]);
    await panel.updateComplete;
    expect(read).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    panel.remove();
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
