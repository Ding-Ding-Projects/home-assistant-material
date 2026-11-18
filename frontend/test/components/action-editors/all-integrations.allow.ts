/**
 * Hand-written exceptions to `all-integrations.test.ts`. Every entry names
 * the exact item and the reason it cannot have the control the test wants.
 * Nothing is allowed by pattern: an item that gains an editor must be removed
 * from here, and the test fails on neither side by accident.
 */

/** `domain.service` entries of a services.yaml that have no tailored editor. */
export const ALLOWED_SERVICES: Record<string, string> = {};

/** `domain.service.field` entries of a tailored service with no control. */
export const ALLOWED_FIELDS: Record<string, string> = {
  "device_tracker.see.gps":
    "A [latitude, longitude] list; the location selector stores an object, so the object editor draws it.",
  "google.add_event.start_date":
    "Shown only while the all-day switch is on; otherwise the date and time picker for start_date_time is shown.",
  "google.add_event.end_date":
    "Shown only while the all-day switch is on; otherwise the date and time picker for end_date_time is shown.",
  "google.create_event.start_date":
    "Shown only while the all-day switch is on; otherwise the date and time picker for start_date_time is shown.",
  "google.create_event.end_date":
    "Shown only while the all-day switch is on; otherwise the date and time picker for end_date_time is shown.",
  "input_datetime.set_datetime.date":
    "Shown only when the targeted helper holds a date; a date picker is used then.",
  "light.turn_on.rgbw_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.turn_on.rgbww_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.turn_on.hs_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.turn_on.xy_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.toggle.rgbw_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.toggle.rgbww_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.toggle.hs_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "light.toggle.xy_color":
    "Light colour models are written by the one colour wheel on rgb_color; the model that matches the targeted light is used, so these keys have no control of their own.",
  "mastodon.post.media_description":
    "A text without selector inside the media section; the section is edited as one object.",
  "media_player.browse_media.media_content_id":
    "An opaque content id returned by the media source; no list of ids exists to pick from.",
  "media_player.search_media.media_content_id":
    "An opaque content id returned by the media source; no list of ids exists to pick from.",
  "scene.apply.entities":
    "A mapping of entity id to state or attributes; drawn by the object selector.",
  "scene.create.entities":
    "A mapping of entity id to state or attributes; drawn by the object selector.",
};

/** `domain.service.field` entries drawn as plain text on purpose. */
export const ALLOWED_PLAIN: Record<string, string> = {
  "calendar.create_event.location":
    "A postal address or place name typed as text; it is not a coordinate pair, so the location selector does not apply.",
  "google.create_event.location":
    "A postal address or place name typed as text; it is not a coordinate pair, so the location selector does not apply.",
  "color_extractor.turn_on.color_extract_path":
    "A file path of an image to read the colour from. The name only contains the word colour.",
  "color_extractor.get_color.color_extract_path":
    "A file path of an image to read the colour from. The name only contains the word colour.",
  "hdmi_cec.select_device.device":
    "A CEC device name, address or number typed by the person; it is not a device registry device.",
  "remote.send_command.device":
    "The name of a device known to the remote itself, not a device registry device.",
  "remote.learn_command.device":
    "The name of a device known to the remote itself, not a device registry device.",
  "remote.delete_command.device":
    "The name of a device known to the remote itself, not a device registry device.",
  "html5.send_message.icon":
    "A web address of a notification image, not an icon name.",
  "ntfy.publish.icon":
    "A web address of a notification image, not an icon name.",
  "kiosker.set_blackout.icon":
    "A SF Symbols name of the device vendor; the icon picker lists Material Design icons only.",
  "lametric.message.icon":
    "An icon id from the LaMetric icon gallery (such as i1234); the picker lists Material Design icons only.",
  "husqvarna_automower.override_schedule_work_area.work_area_id":
    "A numeric id the mower reports; the service has no list of ids to pick from.",
  "kodi.add_to_playlist.media_id":
    "A Kodi library id or file path typed as text; no media source lists them.",
  "media_extractor.play_media.media_content_id":
    "A web address of a video page that the extractor resolves; a media source picker does not apply.",
  "music_assistant.play_media.media_id":
    "A media URI or a list of them; a typed URI keeps the text box and a stored list keeps the object editor.",
  "lifx.effect_pulse.color_name":
    "A CSS colour name typed as text; the same service has a colour picker on rgb_color.",
  "simplisafe.remove_pin.label_or_pin":
    "Either a label or the PIN itself, so it cannot be a masked field.",
};

/** `trigger:domain.name` and `condition:domain.name` with no editor. */
export const ALLOWED_TRIGGER_CONDITIONS: Record<string, string> = {};
