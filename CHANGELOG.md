# Changelog

Every release is also listed, with its build results, on the
[releases page](https://github.com/Ding-Ding-Projects/home-assistant-material/releases).

## Unreleased

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
- Tabs: close the tabs that match a search, or the ones that do not, with counts and Undo.
- Automations: a visible test button on every condition and on every Choose option. Not yet seen
  in a build.
- Private vocabulary: load your own JSON wording file from Profile, Localization, or drop it
  anywhere in the window. Checked in full, kept in the browser only, replace and clear.
- Hosting: `compose.yaml`, `host.sh` and `host.bat` start the published image in one step.
- The published image (build 26) was run from the registry and driven through first-run setup.
- Fixed: the production build failed on the pattern workbench (builds 23 to 25 have no images).
- Design: every page of the product is drawn. 153 boards on 11 canvases of at most 15 boards,
  including a Git repository per automation, a master repository, an automation history manager
  and test buttons on Choose options and conditions.
- Builds in progress are no longer cancelled by a newer push.

## v2026.11.1.1 to v2026.11.1.8, 9 November 2026

### Added

- The repository: upstream frontend, core, supervisor, operating system (with Buildroot), landing
  page and version feed, each vendored in its own folder at a pinned release.
- A release workflow that publishes one tagged release per push to `main` and builds the frontend
  wheel, core, machine, landing page and supervisor images, a multi-architecture container image,
  the update feed, and operating system images for Raspberry Pi 3, 4 and 5 and virtual machines.
- An update feed on the `channel` branch. The supervisor and the operating system read it instead
  of the upstream feed.
- `build.bat`, `build-installer.bat`, `build.sh` and dependency installers.
- The design canvas: 48 boards covering the everyday screens and every required feature.

### Verified so far

- Build 1: frontend wheel, both supervisor images, both core images, all machine images and the
  multi-architecture container image built and are publicly pullable. The update feed is live.
- Not verified: operating system images (still building when this was written), a real boot on a
  Raspberry Pi or in VirtualBox, an update from one build to the next, the Windows scripts.
