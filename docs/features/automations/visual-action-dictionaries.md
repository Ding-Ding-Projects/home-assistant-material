# Edit action dictionaries visually

Open an automation or script, add a **Perform action** step and choose an action. The form keeps
the fields the integration describes. When a field such as **Options** takes a dictionary, turn
it on and add entries in **Visual** mode. Each entry has a key and a value. Choose Text, Number,
Yes/No, Empty, List, Dictionary or Template as needed. Use the row buttons to move or remove an
entry. Expand nested rows to edit their contents.

Choose **YAML** when you need to edit the same dictionary as text. Fix duplicate keys, incomplete
numbers or invalid YAML before switching modes or saving. Leaving a dictionary switched off
omits it from the action. Switching it off again removes its saved data.

## Speech options and custom keys

For **Text-to-speech: Speak**, select a speech engine, a playback entity and the message. The
engine can supply supported option names and voice choices for the action's language. With
several selected engines, the form suggests shared options and voices. Audio format hints and
manual entries remain available when the engine cannot supply metadata. The available values
depend on the integration that runs the action.

Use **Additional data** for keys an action does not give their own controls. The form keeps
these keys alongside the declared fields. Actions without field selectors use a visual editor
for the whole action data map.

## Try with sample entities

- [Speech options](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_action_options):
  open the speech action, add a known option and save. Reload the example to check your edit.
- [Scene action](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_scene_dictionary):
  edit the sample light's state and run the automation. Check the sample light's resulting state
  on the demo dashboard.

The demo stores automation edits in the browser. Speech is simulated, and the scene changes
sample entities. The demo uses its own data and requires no Home Assistant account.
