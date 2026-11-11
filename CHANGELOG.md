# Changelog

Every release is also listed, with its build results, on the
[releases page](https://github.com/Ding-Ding-Projects/home-assistant-material/releases).

Each day lists what changed that day, newest first. A release is made for every push, so a
day can hold several releases. The interface shows this list under Settings, About, What changed.

## 2026-11-10

- New, not yet seen in a running build: an authenticator app card on the profile page, an
  activity tray and a recovery card, time rules and shared defaults for personal settings,
  information buttons beside settings, panes and a filter pane that can be resized, and starting
  points for empty editors.
- Your appearance choices and personal wording file are now saved on the instance for your
  account, so another computer picks them up, and they are included in backups.
- Fixed: the Minecraft manager no longer reads the SSH config file, bounds what a host sends back,
  and only touches containers and volumes it created. A missing or truncated automations file can
  no longer set aside every automation history, and histories set aside can be listed and brought
  back. An Ollama download that stops early is reported as incomplete. The dashboard import
  summary shows the real host of an address and lists locks and covers that would be switched.
- Fixed: a plain `git clone` of the project now works on Windows, and the local frontend build
  no longer crashes on a computer with many processors.
- Releases: a push that changes only documentation or design files no longer publishes a release,
  a release with no files is withdrawn, and every release carries the newest Deploy Assistant
  installers. The 37 releases that had no files were removed.
- Minecraft servers can be started on another computer that runs Docker, reached over SSH:
  add the host with its own key, confirm its fingerprint, then start, stop, read the log and
  see the address to join. Versions are looked up only when you press Refresh.
- Ollama: pull a model with real progress and Cancel, and delete a model.
- Help articles: outside links inside articles are plain text, words that had gone missing
  are back, and every page has a proper title.
- A dropped dashboard file can no longer hide a risky button or disguise where a link goes.
- Automation history is held to the same rules as dashboard history: a strict address for
  pushing, a plain warning that anything typed into an automation is kept, and a way to forget
  an automation's history. History of deleted dashboards can be listed and removed.
- The app's name and logo can be applied for everyone. The release notes page replaces the
  older changes page. School mode can hide the Developer tools entry.
- Drawing board: pencil and brush, and very large pictures are refused before they are opened.
  Converter: YAML merge keys are merged.
- Seen in a running build: the Overview header on a phone, and the editable copy opening
  straight in the editor.
- Fixed: on a phone the welcome banner covered the Overview header, so its menu and edit
  button could not be reached. "Edit cards and layout" now opens the copy in the editor.
- A dropped dashboard file shows what it contains before anything is made: outside addresses,
  custom cards and buttons that would call a service. Imports start hidden from the rail and
  visible to administrators only.
- Dashboard history: set an address and push a dashboard with all its tabs, forget a
  dashboard's history, and a deleted dashboard's history is set aside, not reused.
- Help: every remaining help link opens inside the interface, including on the sign-in page.
  All 1,392 integration pages and their pictures are included. Community links are removed.
- Passkeys: a flood of empty attempts can no longer stop passkey sign-in, and removing a
  passkey needs a recent password sign-in.
- New tools: a file converter and a drawing board. New pages: Ollama servers and models,
  renaming the app and its logo, and release notes.
- Personal settings: language cards, playfulness sliders that change real messages, a switch
  for emojis in dialogs, one thing at a time, and School mode.
- Fixed: a section could stay stuck half open, first-run setup could leave both buttons off,
  and a list's header checkbox could leave hidden rows selected.
- Builds: a documentation push on top of code no longer leaves that code unbuilt.
- Dashboards: built-in pages such as Overview have "Edit cards and layout", which makes an
  editable copy and opens it in the editor. On a phone the edit button sits beside the menu.
- Dashboards can be exported and imported, and a dashboard file dropped anywhere on the
  window is imported at once as a new dashboard, with Undo.
- Every dashboard has its own history, and so has every tab: see what changed, compare two
  versions and go back. The dashboard's repository carries its tabs with it.
- Help links open a copy of the article inside the interface. Nothing opens a new tab or
  another browser for help. The first 44 articles are included, with their source and licence.
- Passkeys: sign in with a fingerprint, face or security key on a secure address, beside the
  password, which stays. Add and remove passkeys on the profile page.
- The automation editor moves: cards open and close smoothly, new steps slide in, results fade
  in. All of it respects the reduce-motion setting.
- A page for Minecraft servers under Settings: define servers with a guided form. Starting
  them comes next.
- First-run setup no longer offers a cloud restore or links to outside sites, and nothing
  contacts an outside map service until you press a button that says so.
- Backups: a storage location that needs encryption is off while encryption is off, and a
  stored key is never replaced or removed without asking.
- The selection bar is on the Automations and Scripts lists and no longer covers the last
  rows. Unknown pages under Settings show a not-found screen.
- Fixed: a debug log could have contained the key file used by Google setup. Secrets are
  masked more widely in the setup wizards.
- The launch screen no longer says the project is from the Open Home Foundation.
- Google setup: a wizard under Settings sets Google up once for every Google integration.
  A service account key file can switch on the needed services (used once, never stored),
  the page shows the return address to copy, and the client file is read by dropping it.
- Read aloud only ever uses a voice that runs on the device, like the narrator.
- First-run setup shows password strength and a preview of dates and units, and asks you to
  review before saving. The lock wizard can try the new lock before it is saved.
- Run now, for automations and scripts, says that the saved version runs, asks first, and
  reports the result. It is off while there are unsaved changes.
- The entity dialog no longer repeats the lock and appearance tools, and an unavailable date
  no longer leaves it empty. Maintenance counts one row per device.
- Fixed: a crafted link name could leave the link page blank.
- A link that opens a page of this interface from outside now asks first, shows where it
  goes and what it passes on, and does nothing until you choose.
- Date, time and calendar dialogs follow the time zone chosen in the profile. The time dialog
  has real spin controls and the date grid can be walked with the arrow keys.
- The colour picker applies a typed colour when you finish typing, not at every letter, and
  stores a drag a few times instead of at every move. Fonts and accessibility: fixes for
  narrow screens, focus, and a font that is not on the device.
- The selection bar sits at the bottom, counts only the rows shown, and says when ticked rows
  are hidden by the filter. Exports keep duplicate column names apart and say when rows were
  cut. Outside links in notifications show their host.
- Group dialogs ask before switching covers, locks or valves. The image dialog no longer has a
  share button, because the shared address carried an access code.
- Tabs and the search of everything follow the language mode, with Cantonese written. Open a
  tab lists the tools. Starting, connection lost and no-access screens are redrawn.
- Fixed: builds 64 and 65 were published without images, because a push that changed many
  files was mistaken for a documentation-only push. Build 66 is the first with images again.
- The narrator only ever uses a voice that runs on the device. If there is none it stays
  silent, so spoken text is never sent anywhere.
- Choose step: a disabled condition is left out of a test, old results are cleared when the
  step is edited, an option that can never run is marked, and Run asks first. The automation
  editor has an on and off switch, a Check button, and a strip that shows its history.
- The entity dialog has a tab row and a tools block (lock, appearance, read aloud, export),
  and no longer shows the state twice.
- The script editor is redrawn with a mode selector, Run now and See past runs. Maintenance
  opens with what needs you. The error and loading screens are redrawn.
- Tabs: fixes for screen readers and the keyboard, and the search shrinks to a button on a
  narrow screen. The search of everything works for people who are not administrators.
- Text that carries links keeps the personal wording on its plain parts.
- Fixed: with a wording file loaded, the tip under Settings showed an error instead of its
  text. Text that carries links is now left as it is.
- The choose step in the automation editor can test and run one option, the default actions,
  or the whole step. Automations link to their history.
- The phone bar, the locks and the wording card follow the language mode. The phone sheet
  keeps the tab order and pins. Tab order and pins are kept in the page history.
- Notifications no longer guess a severity from their words. A failed dismissal is reported
  and not hidden. Exported cells that start a formula are made safe without turning numbers
  into text. Labels use the selection bar for deleting.
- Entity dialogs for date, time, date and time, sun, image, calendar, setup step, siren, lawn
  mower, remote, group, automation, script and conversation are redrawn, and the shared
  controls for alarm, climate, lock, fan, vacuum and water heater follow the boards.
- Accessibility has line spacing and letter spacing. A fonts dialog lists only typefaces that
  ship with the app or are on the device. The appearance editor has its own colour picker.
- The person dialog no longer links to an outside map service. About names the install type
  through the wording file.
- Language mode changes real text: Personal settings can be read in English, Cantonese or
  both. The phone bar, the locks and the wording card have their Cantonese written and will
  follow next.
- A spoken narrator, off by default, reads the name of the control in focus with the
  browser's own voice. Two attention modes are added: a small clock, and an offer to go back
  to the page you were on.
- Tabs can be dragged into a new order and pinned. The search of everything lists settings
  and entities with a live switch in the result.
- Dismissed notifications are kept for thirty days and every dismissal can be undone. The
  page export has a tab-separated format and can take only the ticked rows. A selection bar
  shows what will change before it changes anything.
- Entity dialogs for climate, cover, counter, lock, alarm, camera, media player, vacuum, fan,
  light, weather, sensor, update, person, timer, humidifier, water heater and valve are
  started on their boards.
- The automation editor shows triggers, conditions and actions as three named cards.
- Thirteen more defects found by review are fixed, in backups, voice assistants, energy
  setup, apps, automations, their history and past runs.
- Devices and Entities have their filters as chips beside the search, a tick box on every row
  and a line under the list; Labels has its Create button beside the title.
- Started on their boards: Backups and backup settings, voice assistants and one assistant's
  page, what is exposed to assistants, the cloud account, energy setup, apps and the app store,
  the list of automations, their history and repositories, past runs, MQTT, Thread and Bluetooth.
- Six more defects found by review are fixed: Profile tabs no longer reload the page, the
  people on the sign-in page are real buttons, the Zigbee list has its way to the map, a
  device list is no longer cut between a device and its children, the Logs filters come back
  on, and Statistics sorts and groups by area again.
- Statistics and Scenes can be sorted and grouped again, and Statistics keeps its search,
  sorting and grouping in the page address.
- Sign-in, first-run setup, About, Profile, Helpers, the settings of one entity, and the
  Zigbee, Z-Wave and Matter pages are started on their boards.
- Nine defects found by review are fixed: People, Zones, Blueprints, Repairs, Logs, Updates
  and the scene editor.
- More pages on their boards: Integrations (status on each card, filter chips), an integration's
  own page, Devices (what needs attention, offline and low battery marked), one device,
  Entities (a live state column), Areas and one area, Labels, Scenes as cards and the scene
  editor, Scripts with Run and Stop, Zones, Blueprints, Dashboards, People, Users, Tags,
  Updates, Repairs and Logs.
- Developer tools: Events shows a live feed, YAML shows whether the configuration is valid
  and reloads each kind, Statistics lists problems first, Assist shows what a sentence was
  understood as. Labs is a grid of switches, and Restart is one list of choices with one button.
- The form that runs an action draws each field as a row with its own switch.
- An installation set up by an earlier build no longer logs an error about analytics at start.
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
