# Visibility conditions, presentation roles and default dashboards

Built in batches 46 and 47.

## Visibility conditions

- **Views.** The Visibility tab of a view has "Show only when", the same condition builder
  cards use: state, number, time, screen, user and location, with And, Or and Not groups, evaluated
  by the server-backed evaluator. A view whose conditions fail leaves the navigation, except
  while editing. It still opens by its address.
- **Dashboards.** The same builder is in the dashboard's settings dialog (administrators only).
  Conditions are kept in the shared frontend settings under `dashboard_visibility`, not in the
  core dashboard record. A dashboard whose conditions fail leaves the sidebar, the navigation
  pane, the tab strip, the phone Pages sheet and the New tab catalog. The default dashboard and
  the one in use are never removed, and the settings list always shows a hidden dashboard with
  a "Hidden right now" note.

## Presentation roles

A Roles page beside People defines roles. A `role` condition is evaluated in the browser and
never sent to the server. Each dashboard can Show or Hide per role, and a card in edit mode has
"Who can see this", including a view-only level.

**Roles are not access control.** They change what is drawn for a person. Anyone who can reach the
instance and knows an address can still reach the page; the interface says so where roles are
set. Use users and permissions to protect anything.

## Default dashboards per device

One default dashboard for everyone, with optional overrides for phone, tablet, desktop and wall
panel, kept as `default_panel_overrides` in the shared frontend settings. A person's own choice
still wins.

## Limits and failure modes

- Conditions that only the server can judge are not supported in the dashboard-level builder
  yet; they are evaluated in the browser only.
- Roles on tabs from a menu are not built.

## How it was verified

Unit tested, including the evaluator and the ordering rules; not seen in a browser. State:
built, unit tested, not yet seen in a running build.
