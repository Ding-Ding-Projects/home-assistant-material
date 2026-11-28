import { describe, expect, it, vi } from "vitest";
import "../../../src/panels/profile/dialog-ha-authenticator-setup";
import type { HomeAssistant } from "../../../src/types";

describe("authenticator enrollment cancellation", () => {
  it("keeps a new pending verification independent of a canceled one", async () => {
    const first = Promise.withResolvers<unknown>();
    const second = Promise.withResolvers<unknown>();
    const form = (id: string) => ({ type: "form", flow_id: id });
    const callWS = vi
      .fn()
      .mockResolvedValueOnce(form("first"))
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(form("second"))
      .mockReturnValueOnce(second.promise);
    const dialog = document.createElement("ha-authenticator-setup-dialog");
    dialog.hass = {
      callWS,
      localize: (key: string) => key,
    } as unknown as HomeAssistant;
    const params = { dialogClosedCallback: vi.fn() };
    // Drive both requests without attaching a browser modal or a real account.
    const verify = () => {
      dialog["_code"] = "000000";
      return dialog["_submit"]();
    };
    await dialog.showDialog(params);
    const previous = verify();
    dialog.closeDialog();
    await dialog.showDialog(params);
    const current = verify();
    expect(callWS).toHaveBeenCalledTimes(4);
    first.resolve({ type: "create_entry" });
    await previous;
    await verify();
    expect(callWS).toHaveBeenCalledTimes(4);
    expect(dialog["_done"]).toBe(false);
    second.resolve({ type: "create_entry" });
    await current;
    expect(dialog["_done"]).toBe(true);
    dialog.closeDialog();
  });
});
