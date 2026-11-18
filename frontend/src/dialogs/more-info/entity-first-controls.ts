/**
 * The first control of the detail sheet for every entity kind, as the entity
 * board names it. This table is data: the sheet code reads it to decide what
 * to show for kinds that have no body of their own, and the coverage test
 * checks it against the platform list of the core source, so the two cannot
 * disagree.
 */
export type FirstControl =
  | "toggle"
  | "brightness_bar"
  | "target"
  | "position"
  | "level_bar"
  | "slide_unlock"
  | "mode_tiles"
  | "transport"
  | "start_pause_dock"
  | "picture"
  | "value_graph"
  | "state_changed"
  | "slider"
  | "option_tiles"
  | "text_box"
  | "picker"
  | "press"
  | "remaining_ring"
  | "update_progress"
  | "next_items"
  | "map"
  | "forecast"
  | "named_actions"
  | "state_note";

export const ENTITY_FIRST_CONTROL: Readonly<Record<string, FirstControl>> = {
  light: "brightness_bar",
  switch: "toggle",
  input_boolean: "toggle",
  climate: "target",
  water_heater: "target",
  cover: "position",
  valve: "position",
  fan: "level_bar",
  humidifier: "level_bar",
  lock: "slide_unlock",
  alarm_control_panel: "mode_tiles",
  media_player: "transport",
  vacuum: "start_pause_dock",
  lawn_mower: "start_pause_dock",
  camera: "picture",
  image: "picture",
  sensor: "value_graph",
  binary_sensor: "state_changed",
  event: "state_changed",
  number: "slider",
  input_number: "slider",
  select: "option_tiles",
  input_select: "option_tiles",
  text: "text_box",
  input_text: "text_box",
  date: "picker",
  time: "picker",
  datetime: "picker",
  input_datetime: "picker",
  button: "press",
  input_button: "press",
  scene: "press",
  script: "press",
  timer: "remaining_ring",
  counter: "remaining_ring",
  update: "update_progress",
  calendar: "next_items",
  todo: "next_items",
  person: "map",
  device_tracker: "map",
  zone: "map",
  weather: "forecast",
  sun: "forecast",
  remote: "named_actions",
  siren: "named_actions",
  assist_satellite: "state_note",
  conversation: "state_note",
  stt: "state_note",
  tts: "state_note",
  wake_word: "state_note",
  ai_task: "state_note",
  // Platforms the board groups with "state and when it changed" because they
  // only report something.
  air_quality: "state_changed",
  geo_location: "state_changed",
  image_processing: "state_changed",
  infrared: "state_note",
  radio_frequency: "state_note",
  notify: "state_note",
  // Helper and core kinds.
  automation: "toggle",
  group: "toggle",
  schedule: "state_changed",
};

export const entityFirstControl = (domain: string): FirstControl | undefined =>
  ENTITY_FIRST_CONTROL[domain];

/** Kinds whose sheet has nothing to press and so says what the kind is for. */
export const STATE_NOTE_DOMAINS = Object.entries(ENTITY_FIRST_CONTROL)
  .filter(([, control]) => control === "state_note")
  .map(([domain]) => domain);
