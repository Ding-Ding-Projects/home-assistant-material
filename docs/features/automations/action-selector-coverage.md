# Action selector coverage

In an automation or script, add a **Perform action** step and choose the action and target
entities. The form uses the action description and, where supported, the selected entities'
advertised capabilities to offer relevant controls. A target can change which choices are
available. Review any existing value after changing the target, especially when moving an
action to a device from a different integration.

## First-party source inventory

The audit parsed 356 checked-in `core/homeassistant/components/*/services.yaml` files on
2026-11-13. It counted all top-level action entries, including null descriptions, and excluded
seven dot-prefixed YAML anchors. For actions with a `target` declaration, it counted each
leaf field once, including fields nested in a UI section. An object selector counts as one
field, regardless of its internal structure.

| Coverage measure | Count |
| --- | ---: |
| Action descriptions | 1,133 |
| Actions with a target declaration | 522 |
| Actions with an entity target declaration | 516 |
| Actions with a generic target declaration | 6 |
| Actions that explicitly name at least one target domain | 502 |
| Targeted actions with no declared fields | 176 |
| Leaf fields of targeted actions | 788 |
| Leaf fields with a selector | 788 |
| Leaf fields with a text selector | 188 |
| Leaf fields without a selector | 0 |

Selector counts for the 788 leaf fields are shown below. The action form also provides
dedicated controls for Calendar offsets, to-do items, WiLight triggers, Number values,
and compatible date and time fields.

| Selector | Fields | Selector | Fields |
| --- | ---: | --- | ---: |
| Number | 256 | Text | 188 |
| Select | 92 | Boolean | 75 |
| Object | 69 | State | 25 |
| Duration | 19 | Date and time | 17 |
| Media | 10 | Date | 8 |
| Constant | 7 | Entity | 6 |
| RGB color | 5 | Time | 5 |
| Area | 2 | Color temperature | 2 |
| Device | 1 | Language | 1 |

The [generated entity platform list](../../../core/homeassistant/generated/entity_platforms.py)
defines 45 platforms. The action descriptions explicitly target 36 of those platforms and
12 additional built-in domains, including automation, script, and input helpers. Nine
generated platforms have no explicit domain match in the target declarations: AI task,
air quality, conversation, event, geolocation, infrared, radio frequency, speech-to-text,
and wake word. This count measures explicit YAML targets. Some actions use a target-like
service data field, and others register descriptions or capabilities at runtime.

## Controls backed by real values

| Action or domain | Where choices and validation come from |
| --- | --- |
| Climate and fan | Climate modes, swing positions, and fan presets can come from the selected entity's advertised modes. MELCloud vane actions use the horizontal and vertical position lists that the integration publishes and validates. |
| Light | Effects come from the entity's effect list. Color and brightness use typed controls. Light profiles also include locally configured names, for which the action form has no published list. |
| Cover and switch | Open, close, stop, and simple on/off actions can have no value fields. Cover position uses a numeric selector where the action supports it. |
| Lock and alarm | Codes are manually entered. Entity metadata can describe a code requirement or format without providing the code itself. |
| Vacuum | Fan speed uses the entity's speed list. Raw commands are integration-specific, and the vacuum domain exposes no shared command catalogue. |
| Notify | Message and title are free-form. A notification entity can advertise whether it supports a title. |
| Input helpers | Select values come from the selected entity's options. Input text remains free-form. Compatible date and datetime values use native controls. |
| Number | The action uses a numeric input and the common range reported by selected entities. The range and unit are omitted when they cannot be determined from the targets. |
| Remote | Activity names come from the published activity list. Harmony activity IDs and Android TV app IDs or links can still be entered manually. Remote commands and device identifiers do not have a portable list across providers. |
| Siren | Tone choices come from the entity's published tones and preserve numeric or string values. Duration uses a numeric input in seconds. |
| Media player | Play media uses the media selector. Source and sound mode use the selected player's lists. Browse and search can accept optional container IDs with provider-specific semantics. |
| Text-to-speech | The speech engine supplies supported options and may supply voices for the action language. For multiple engines, shared choices depend on metadata from each engine. |
| Calendar | Choose a relative offset in days or weeks for an all-day event. Google Calendar offers pickers for compatible dates and local datetimes. Saved timezone-bearing or legacy formats remain editable as text. |
| To-do | For Update item and Remove item, choose existing items from a single selected list you can read. The saved value is the item ID. Names and templates are also accepted where the action supports them. |
| ONVIF | The PTZ action offers cached presets reported by the selected cameras. Several cameras must share a preset identifier for the picker to suggest it. You can enter a known identifier manually. |
| Sensibo | Climate React offers known keys for the high- and low-temperature states. Power and temperature have typed controls, and the operating-mode picker uses modes shared by the selected Sensibo entities. Mode-dependent fan and swing values are entered as documented by the provider. |
| WiLight | Choose weekdays, time, and whether the trigger is active. Watering time, pause time, and trigger index use bounded number controls. |
| Yamaha | Choose one of the six menu cursor commands accepted by the receiver action. |

The recent metadata changes are in the [remote](../../../core/homeassistant/components/remote/services.yaml),
[MELCloud](../../../core/homeassistant/components/melcloud/services.yaml),
[siren](../../../core/homeassistant/components/siren/services.yaml),
[ONVIF](../../../core/homeassistant/components/onvif/services.yaml),
[Yamaha](../../../core/homeassistant/components/yamaha/services.yaml), and
[WiLight](../../../core/homeassistant/components/wilight/services.yaml) action descriptions.
The frontend connects state-based selectors to their corresponding
[entity capability lists](../../../frontend/src/common/entity/get_states.ts). The source
inventory and the focused state-choice tests were checked locally. These checks do not
establish behavior on live devices or on every provider.

## Check a target and keep manual entry available

1. Choose the action and a compatible entity. For a capability-backed field, check that the
   choices match what that entity exposes.
2. Add a second entity with different capabilities, then replace or remove the first.
   Check that any suggested values still apply to the intended targets. A value advertised
   by one entity may be invalid for another.
3. Try an unavailable entity or an integration with no capability list. Keep manually
   supplied values and templates available where the action supports them, and verify that
   the editor preserves the saved value when reopened.
4. Use a non-production target when verifying execution. The selector helps construct the
   action, and the integration validates the resulting payload when it runs.

The source counts cannot show what an installed integration actually advertises, what a
particular account can read, or which values a custom integration accepts. An update entity
can advertise its latest version without publishing every installable version. The editor
needs an integration's declared choices, a supported value list, or a specific data source to
offer reliable suggestions for such fields.
