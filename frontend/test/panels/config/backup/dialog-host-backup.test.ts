import { LitElement } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../../../src/types";
import type { BackupContent } from "../../../../src/data/backup";
import { showDialog } from "../../../../src/dialogs/make-dialog-manager";

// Keep these lifecycle tests independent of generated icon data and native
// dialog animations. The real dialog manager and hosting component are used.
vi.mock("../../../../src/components/ha-alert", () => ({}));
vi.mock("../../../../src/components/ha-button", () => ({}));
vi.mock("../../../../src/components/ha-dialog", () => ({}));
vi.mock("../../../../src/components/ha-dialog-footer", () => ({}));
import "../../../../src/panels/config/backup/dialogs/dialog-host-backup";

const backup = (name: string) =>
  ({
    backup_id: name,
    name,
    agents: { local: { protected: false, size: 1 } },
    failed_agent_ids: [],
  }) as unknown as BackupContent;
const makeHass = () =>
  ({
    localize: (key: string) => key,
    auth: { data: { hassUrl: "http://source.test" } },
    callWS: vi.fn().mockResolvedValue({ bridges: [], jobs: [] }),
  }) as unknown as HomeAssistant;
class HostingDialogOwner extends LitElement {
  hass = makeHass();
  provideHass(element: HTMLElement) {
    (element as HTMLElement & { hass: HomeAssistant }).hass = this.hass;
  }
}
customElements.define("test-hosting-dialog-owner", HostingDialogOwner);

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

describe("backup hosting dialog initialization", () => {
  it("receives context through the real legacy dialog-manager route and renders", async () => {
    const owner = document.createElement(
      "test-hosting-dialog-owner"
    ) as HostingDialogOwner;
    document.body.append(owner);
    await owner.updateComplete;
    await showDialog(
      owner,
      "dialog-host-backup",
      { backup: backup("Selected backup"), kind: "docker" },
      async () => {},
      undefined,
      false
    );
    const dialog = owner.shadowRoot!.querySelector("dialog-host-backup")!;
    await vi.waitFor(() =>
      expect(owner.hass.callWS).toHaveBeenCalledWith({
        type: "backup/hosting/status",
      })
    );
    await dialog.updateComplete;
    expect(dialog.hass).toBe(owner.hass);
    expect(dialog.shadowRoot!.querySelector("ha-dialog")).not.toBeNull();
    expect(dialog.shadowRoot!.textContent).toContain("Selected backup");
  });

  it("waits for both reactive parameters and context, then resets on reopen", async () => {
    const dialog = document.createElement("dialog-host-backup");
    dialog.showDialog({ backup: backup("First backup"), kind: "docker" });
    document.body.append(dialog);
    await dialog.updateComplete;
    expect(dialog.shadowRoot!.querySelector("ha-dialog")).toBeNull();
    const hass = makeHass();
    dialog.hass = hass;
    await vi.waitFor(() => expect(hass.callWS).toHaveBeenCalledTimes(1));
    dialog.closeDialog();
    dialog.showDialog({ backup: backup("Second backup"), kind: "appliance" });
    await vi.waitFor(() => expect(hass.callWS).toHaveBeenCalledTimes(2));
    await dialog.updateComplete;
    expect(dialog.shadowRoot!.textContent).toContain("Second backup");
    expect(dialog.shadowRoot!.textContent).not.toContain("First backup");
  });

  it("discards an old pending load and clears transient key and timer on close", async () => {
    let release!: (value: { bridges: []; jobs: [] }) => void;
    const hass = makeHass();
    vi.mocked(hass.callWS).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const dialog = document.createElement("dialog-host-backup");
    dialog.hass = hass;
    dialog.showDialog({ backup: backup("Old backup"), kind: "docker" });
    document.body.append(dialog);
    await vi.waitFor(() => expect(hass.callWS).toHaveBeenCalledTimes(1));
    const internal = dialog as unknown as {
      _password: string;
      _timer: ReturnType<typeof setTimeout>;
      _busy: boolean;
    };
    internal._password = "transient-test-value";
    const callback = vi.fn();
    internal._timer = setTimeout(callback, 1) as unknown as ReturnType<
      typeof setTimeout
    >;
    dialog.closeDialog();
    expect(internal._password).toBe("");
    dialog.showDialog({ backup: backup("Current backup"), kind: "docker" });
    await vi.waitFor(() => expect(hass.callWS).toHaveBeenCalledTimes(2));
    release({ bridges: [], jobs: [] });
    await dialog.updateComplete;
    expect(dialog.shadowRoot!.textContent).toContain("Current backup");
    expect(callback).not.toHaveBeenCalled();
  });
});
