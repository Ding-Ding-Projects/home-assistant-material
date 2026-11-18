import type { PickerComboBoxItem } from "../../../../components/ha-picker-combo-box";

export interface EventListenerCount {
  event: string;
  listener_count: number;
}

/** Events every installation fires, offered before the real list has loaded. */
export const COMMON_EVENT_TYPES = [
  "homeassistant_start",
  "homeassistant_started",
  "homeassistant_stop",
  "homeassistant_final_write",
  "automation_triggered",
  "script_started",
  "call_service",
  "state_changed",
  "service_registered",
  "core_config_updated",
  "component_loaded",
  "themes_updated",
  "user_added",
  "user_removed",
  "area_registry_updated",
  "device_registry_updated",
  "entity_registry_updated",
  "logbook_entry",
  "mobile_app_notification_action",
];

/**
 * The events a picker offers: the ones the instance reports, with how many
 * things listen to each, then the common ones that are not reported yet.
 * Sorted by name; an empty or failed report still gives the common list.
 */
export const eventTypeItems = (
  reported: EventListenerCount[] | undefined,
  listenersLabel: (count: number) => string
): PickerComboBoxItem[] => {
  const seen = new Set<string>();
  const items: PickerComboBoxItem[] = [];
  for (const item of reported ?? []) {
    if (!item.event || seen.has(item.event)) {
      continue;
    }
    seen.add(item.event);
    items.push({
      id: item.event,
      primary: item.event,
      secondary: listenersLabel(item.listener_count),
      sorting_label: item.event,
    });
  }
  for (const event of COMMON_EVENT_TYPES) {
    if (seen.has(event)) {
      continue;
    }
    seen.add(event);
    items.push({ id: event, primary: event, sorting_label: event });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
};
