# Start an empty dashboard view

In a dashboard you can edit, open an empty **Sections** view in edit mode and choose a starting point.

| Choice | Result |
| --- | --- |
| Your home's defaults | Uses the sections generated for the Home overview with this account's current data. The existing view keeps its title, navigation and header. |
| One room | Choose a registered area. The editor uses the Home room layout for that area. |
| Wall tablet | Adds a section of large buttons for lights, switches and climate entities visible to this account. |
| Energy only | Adds a section of tiles for visible sensors that report the power or energy device class. |
| Empty | Leaves the view untouched and makes room to add individual sections. |

Review the choice and select **Apply**. **Cancel** closes the review without saving. The two existing shortcuts for adding a section or opening the card picker remain available. A missing room or a home without matching entities can leave a starting point without content. The editor reports that result and keeps the view editable.

The editor saves the selected sections together using the dashboard's normal save operation. Choosing a starting point does not change this device's global display preferences or run entity actions. Editing an existing view does not create or rename a dashboard.

The focused tests cover tablet controls, energy sensors, hidden entities, a removed room and an empty selection. These tests exercise configuration generation. They do not drive a browser or a physical device.
