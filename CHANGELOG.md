# Changelog

Every release is also listed, with its build results, on the
[releases page](https://github.com/Ding-Ding-Projects/home-assistant-material/releases).

Each day lists what changed that day, newest first. A release is made for every push, so a
day can hold several releases. The interface shows this list under Settings, About, What changed.

## 2026-11-10

- Nothing is sent out any more. The analytics integration, its page and its first-run step are
  gone, the supervisor's crash reports and diagnostics are off, and the buttons that reported
  an issue or gave feedback are removed.
- Problems are kept on this system instead. Settings, System, Problem log lists every warning
  and error, one entry per problem with a count and when it was first and last seen. They are
  files in a Git repository in the configuration folder, with passwords, tokens, addresses and
  other private values removed. Nothing leaves the system unless you add a remote yourself.
- A wording file that loads gets a short celebration over the whole window and a sound; one
  that is refused gets a different sound and a clear message.
- Storage, General, Hardware and Network are drawn to their boards, and so are the States,
  Actions and Template pages of the developer tools. General has one Save and one Discard.
- Everyday pages start on their boards: Lights opens with how many are on and a card for
  each room; Security shows each alarm with arm and disarm; Climate draws the first
  thermostat large; the Map lists where everyone is; Activity, History, To-do, Calendar and
  Energy gain a large title and a line of facts; Home shows power use when energy is set up.
- The Network page lays its cards out in two columns on a wide screen.
- On a phone there is a bar at the bottom: Home, Search, Pages, Access and Menu. Pages opens
  a sheet of the open pages with a search, New tab, and closing by button or swipe, with Undo.
  A slim bar at the top switches between open pages.
- The pattern workbench on a phone has three tabs and More, one chip for the flags, and a
  footer that gets out of the way of the keyboard. On a wide screen the flags are named
  chips and the tabs wrap.
- Holding an element shows a ring and opens a sheet on a phone; on a wide screen the menu
  sits beside the element and each tool has a one-letter shortcut.
- The lock wizard has six steps with a progress line and a QR code for the one-time code. The
  unlock prompt counts down a wait, and the list of locks filters, selects several and shows
  the time left.
- Personal settings are grouped, show what each control reaches, and gain quiet hours for
  sounds. Guided setup lists what is set up first, and its last step offers one action:
  reload or restart. The guidance note in setup dialogs opens as a sheet.
- Fifteen of the browser's own blocking boxes are replaced by messages and dialogs of the
  interface. Deleting an energy source, removing a Matter fabric, resetting a Thread border
  router and turning off a second sign-in step ask twice.
- Turning on a preview feature with its backup switch on no longer fails when automatic
  backups are not set up. The backup is kept on this system.
- Guided setup draws real fields for 223 of the 240 integrations it lists, up from 10: text,
  numbers, switches, choices, templates, durations and entity pickers, and a first step that
  asks which kind of item to add where an integration has several.
- Guided setup: integrations that had to be written by hand in YAML can be created from
  Settings, Guided setup, or from Add integration. Each one gets a step-by-step form, a review
  of what will be written, and a note on whether a reload or a restart follows. Most still
  show one YAML box that is checked before saving, not drawn fields. The setup dialogs of
  other integrations gain a short guidance note with a link to the documentation.
- Locks on single elements choose their own way in: a PIN, a password, a one-time code, or a
  mix of them, each lock with its own. A wizard opens beside the element, a keypad or the
  keyboard enters the PIN, and the Lock tool lists every lock. A lock is a speed bump for
  fun, not security; clearing this site's storage removes them all.
- Personal settings: a page under Settings for sounds, low stimulation, the focus spotlight
  and reduced motion, with a search. Language mode and the two playfulness levels are saved
  and shown in a preview; the rest of the interface does not follow them yet.
- On a phone, the menu of an element scrolls inside the screen, the New tab list stays on
  the screen, every tab shows its close button, and side panels stop at the visible height.
- The event filter in Developer tools has the pattern workbench.
- Developer tools are back on the navigation rail, just above Settings, for administrators.
- The pattern workbench fits a phone: it takes the visible screen instead of the space under
  the field, follows the keyboard, and its switches start at the left.
- On a phone, resting a finger on an element opens its menu, where a right-click does on a
  computer. Text fields keep the phone's own menu, and cards that act on a hold keep theirs.
- The search of a media library has the pattern workbench. A pattern is tested against the
  titles in the open folder; plain text still goes to the media source.
- `host.bat` waits properly when it is started from a Git shell. It used to give up at once
  and report a failure although the container had started. `compose.yaml` runs build 46.
- The operating system image started on VMware Workstation; the README says how, and how to
  clone this repository on Windows.
- Locks on single elements: right-click anything and choose Lock this element. It stops taking
  clicks and keys and gets a dashed outline. The Lock tool lists the locked elements of the
  page and unlocks each one by a hold, or all of them with the PIN.
- The README shows captures from a running instance.
- Tools: a Colour tab that reads one colour in every notation, names the nearest named colour
  and says how well text reads on it.
- Notifications as a page, with a search and dismissing one, the selected ones or all. The
  notification drawer links to it.
- The rail has an Assist button at its top.
- Lists: the icon of each row sits on a small tile, and a device row names its maker and model
  under the device.
- What changed: this list inside the interface, under Settings, About, with a search, a range of
  days and the commit behind each entry. It ships with the build and opens without a connection.
- About: the version and build time of this project, where its updates come from, that it is
  free, and that it is independent of the Open Home Foundation. The links to merchandise and to
  the upstream issue tracker are gone; Report a problem opens this project's issues.
- Tabs: close the tabs that match a search, or the ones that do not, with counts and Undo.
- Automations: a visible test button on every condition and on every Choose option.
- The search at the top is a real search field with the pattern workbench; what is typed or built
  there opens the search of everything with that text.
- Interface: page tools in the header of every settings page. Search this page (with the pattern
  workbench), edit appearance, read aloud, history, export, lock and help; one button on a narrow
  screen. Section tabs moved to a row under the header, and wide screens have a footer line.
- Tools: a Base64 toolkit for text and files, with strict and lenient decoding and data URLs.
- Home: large cards for a room's lights, the thermostat, the locks and what is playing.
- Anything that destroys data is confirmed with two keys and a slide, not one button.
- System: a card about the running system and its sections as a grid. Pages reached from Settings
  show where they sit above their title.
- Dialogs: a row at the foot of every dialog with Search this dialog, Edit appearance and Lock.
- Fixed: read aloud, copy the text and export left out text that a component shows through a
  slot, which was most of a page.
- Home opens with a greeting for the time of day, a sentence about the home made from its real
  state, and buttons for the scenes used most.
- The page tools, the footer and the lock are on history, activity, media, to-do lists, calendar
  and the developer tools. Dashboards have the footer and the lock.
- Settings home: a large title, a search of the sections, banners for updates and repairs, and
  the sections as a grid of cards that say what each holds now.
- The rail is compact by default. The top bar has a language button and the user's picture.
- List pages under Settings: where the page sits and its title in the header, a large title with
  a summary line, rows as rounded cards, and an export button beside the table settings.
- The menu on any element has Export this page, History of changes and Lock this page.
- Export a page as CSV, JSON, Markdown, plain text or HTML, or print it.
- Lock a page with the lock button or Ctrl+Shift+L; unlock with a hold or a PIN.
- History of local changes to appearance, accessibility and open tabs, with undo.
- Help articles that ship with the interface.
- Automations: a History tab with every version of every automation; test one or many, run one
  or many, compare, make live, export, and commit everything to the master repository.
- Automations: a Git repository for each automation and a master repository (new integration
  `automation_repos`). Every save is a commit.
- Fixed: the test button on a Choose option failed when the option had conditions, because the
  server tests one condition at a time.
- Appearance editor for any element: right-click, Ctrl+Shift+E or the paint button, then change
  fill layers, text, shape, accent and size for that element or every one of its kind.
- A menu on every element, with a filter and working shortcuts.
- Private vocabulary: load your own JSON wording file from Profile, Localization, or drop it
  anywhere in the window. Checked in full, kept in the browser only, replace and clear.
- Hosting: `compose.yaml`, `host.sh` and `host.bat` start the published image in one step.
- The published image (build 26) was run from the registry and driven through first-run setup.
- Fixed: the production build failed on the pattern workbench (builds 23 to 25 have no images).

## 2026-11-09

- Root README, licence, notice, contributing, security and conduct files.
- Feature status page and roadmap.
- Interface: Material Design 3 colour scales and surfaces, Google Sans Flex, the navigation rail,
  the floating pane, borderless cards and pill tabs.
- Interface: version and build time at the foot of the rail.
- Interface: the bar of open pages. Every page starts open, a closed tab stays closed, and the
  New tab catalog lists every page, searches them and can reopen them all.
- The command search opens with Ctrl+Shift+F and from a Search button in the top bar.
- Interface: accessibility tools on a top bar button and Alt+A. Text size, contrast, reduced
  motion, a focus ring that follows the focused control, larger targets, reading the page aloud
  and keyboard help.
- Fixed: vendored font files were altered by line-ending conversion on commit.
- Interface: every search field has a pattern workbench button, and every list accepts a regular
  expression written as `/pattern/flags`. Plain text stays the default. The workbench shows which
  items of the list a pattern matches. Seen working on the New tab catalog in the demo build.
- Design: every page of the product is drawn. 153 boards on 11 canvases of at most 15 boards,
  including a Git repository per automation, a master repository, an automation history manager
  and test buttons on Choose options and conditions.
- Builds in progress are no longer cancelled by a newer push.
- The repository: upstream frontend, core, supervisor, operating system (with Buildroot), landing
  page and version feed, each vendored in its own folder at a pinned release.
- A release workflow that publishes one tagged release per push to `main` and builds the frontend
  wheel, core, machine, landing page and supervisor images, a multi-architecture container image,
  the update feed, and operating system images for Raspberry Pi 3, 4 and 5 and virtual machines.
- An update feed on the `channel` branch. The supervisor and the operating system read it instead
  of the upstream feed.
- `build.bat`, `build-installer.bat`, `build.sh` and dependency installers.
- The design canvas: 48 boards covering the everyday screens and every required feature.
- Build 1: frontend wheel, both supervisor images, both core images, all machine images and the
  multi-architecture container image built and are publicly pullable. The update feed is live.
- Not verified: operating system images (still building when this was written), a real boot on a
  Raspberry Pi or in VirtualBox, an update from one build to the next, the Windows scripts.
