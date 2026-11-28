import { afterEach, describe, expect, it, vi } from "vitest";
import { showConfirmationDialog } from "../../../../src/dialogs/generic/show-dialog-box";
import "../../../../src/panels/config/notifications/ha-config-notifications";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __STATIC_PATH__: "/",
    __HASS_URL__: "",
    __BUILD__: "modern",
    __VERSION__: "test",
    __BACKWARDS_COMPAT__: false,
    __SUPERVISOR__: false,
    __NAMESPACE__: "frontend",
  });
});

vi.mock(
  "../../../../src/dialogs/generic/show-dialog-box",
  async (original) => ({
    ...(await original<
      typeof import("../../../../src/dialogs/generic/show-dialog-box")
    >()),
    showConfirmationDialog: vi.fn(),
  })
);

const makePanel = () => {
  const panel = document.createElement("ha-config-notifications");
  const state = panel as unknown as {
    _notifications: { notification_id: string; message: string }[];
    _filter: string;
    _dismissAll(): Promise<void>;
    _dismissMany(ids: string[]): Promise<string[]>;
  };
  Object.defineProperty(panel, "_modeLocalize", {
    value: (key: string) => key,
  });
  state._notifications = [
    { notification_id: "one", message: "visible" },
    { notification_id: "two", message: "hidden" },
  ];
  state._filter = "visible";
  const dismiss = vi.spyOn(state, "_dismissMany").mockResolvedValue([]);
  return { state, dismiss };
};

afterEach(() => vi.clearAllMocks());

describe("dismiss all on the notifications page", () => {
  it("keeps hidden and newly arrived rows outside the confirmed set", async () => {
    const { state, dismiss } = makePanel();
    vi.mocked(showConfirmationDialog).mockImplementationOnce(async () => {
      state._notifications.push({
        notification_id: "three",
        message: "visible",
      });
      return true;
    });
    await state._dismissAll();
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(["one"]);
  });

  it("preserves every row when the person cancels", async () => {
    const { state, dismiss } = makePanel();
    vi.mocked(showConfirmationDialog).mockResolvedValueOnce(false);
    await state._dismissAll();
    expect(showConfirmationDialog).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("makes no request when the filter matches nothing", async () => {
    const { state, dismiss } = makePanel();
    state._filter = "nonexistent";
    await state._dismissAll();
    expect(showConfirmationDialog).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
