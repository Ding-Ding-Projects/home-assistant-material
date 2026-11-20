/**
 * Fired on the window when the person changes a synced setting in this tab
 * through the interface. The settings sync then records the change and sends
 * it to the instance at once, instead of waiting for its next periodic look,
 * so a reload or another device right after the change reads the new value.
 *
 * Kept in its own module without imports, so a setting's owner can announce a
 * change without loading the sync itself.
 */
export const LOCAL_SETTINGS_CHANGED_EVENT = "local-settings-changed";

export const announceLocalSettingsChange = (): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOCAL_SETTINGS_CHANGED_EVENT));
  }
};
