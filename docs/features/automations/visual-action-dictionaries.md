# Edit action dictionaries visually

Open an automation or script, add a **Perform action** step and choose an action. The form keeps
the fields the integration describes. When a field such as **Options** takes a dictionary, turn
it on. Choose a named option to add its control directly. For keys the integration does not
describe, choose **Add custom entry**, name it, and select a value type. Use the row buttons
to move or remove an entry. Expand nested rows to edit their contents.

Choose **YAML** when you need to edit the same dictionary as text. Fix duplicate keys, incomplete
numbers or invalid YAML before switching modes or saving. Leaving a dictionary switched off
omits it from the action. Switching it off again removes its saved data.

## Speech options and custom keys

For **Text-to-speech: Speak**, select a speech engine, a playback entity and the message. The
engine can supply supported option names and voice choices for the action's language. With
several selected engines, the form suggests shared options and voices. Audio format hints and
manual entries remain available when the engine cannot supply metadata. The available values
depend on the integration that runs the action.

For **Sensibo: Enable Climate React**, turn on the high- or low-temperature state. Choose
**Power**, **Target temperature**, or **Operating mode** to add its control. The operating mode
uses the modes reported by the selected Sensibo entities. Use the provider's supported values
for fan level and swing.

Use **Additional data** for keys an action does not give their own controls. The form keeps
these keys alongside the declared fields. Actions without field selectors use a visual editor
for the whole action data map. An action with no input fields, such as **Next track**, shows
its target picker without an empty action data editor.

**Fire manual event** also uses the visual dictionary for its payload. The event type stays
editable because integrations and automations can define their own names. **Play media** lets
you browse for a media item and fills its ID and type together.
**To-do list: Update item** and **Remove item** offer item names from one selected list you can
read. **ONVIF: PTZ** offers presets reported by the selected cameras. Manual values remain
available when the editor has no list for the target.

In a text field, **Build text** opens with the existing text. Place the caret and choose a
dynamic piece, or drag the piece into the text. The editor keeps the characters on both sides.

With **Continue on error for all actions** enabled, additional eligible actions inherit that
setting, including actions you insert into a nested sequence.

## Try with sample entities

- [Speech options](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_action_options):
  open the speech action, add a known option and save. Reload the example to check your edit.
- [Scene action](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_scene_dictionary):
  edit the sample light's state and run the automation. Check the sample light's resulting state
  on the demo dashboard.
- [Play media](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_play_media):
  browse the synthetic sample, save, and reopen it. The Next track action has a target and
  needs no input values.

The demo stores automation edits in the browser. Speech is simulated, and the scene changes
sample entities. The demo uses its own data and requires no Home Assistant account.

The [speech editor screenshot](../../screenshots/automation-speech-dictionary-demo.png) was
captured from the published browser demo for source `bb55f1bb6aac29b380bf6ddc1dcfad5cbcb63d8f`
(built 13 November 2026 at 18:51 UTC). It shows the speech example after saving and reopening
it at 1440 × 1000 in the light theme. It contains only the demo's synthetic data.
