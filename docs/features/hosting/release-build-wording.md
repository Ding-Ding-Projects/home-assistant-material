# Release build wording and the commit and build rule

## The project's own English wording in the build

Commit `7889b9ba1`. The release build used to take every integration's English text from the
upstream image and nothing from this repository. So the integrations added here (automatic
updates, camera recording, wall tablet) shipped with no text at all, the backup self-check repair
added here was missing from the backup integration, and setup forms and repairs could show raw
keys.

A small script (`scripts/ci/build-own-translations.py`, with `test_build_own_translations.py`)
now runs right after the upstream files are unpacked. It builds the English file for every
integration from the strings in this repository, the same way the project's own generator does,
and lays it over the upstream file:

- text defined here wins,
- text only upstream has is kept,
- other languages are untouched,
- a reference it cannot resolve stops the build and names it.

Proof: run against the project's real generator on the same input, all 1,156 generated files came
out byte-identical. Against the files in a published image it creates 3 and updates 31. Seven
tests cover the merge rules.

On 22 November 2026, build 548's
[release workflow](https://github.com/Ding-Ding-Projects/home-assistant-material/actions/runs/44917772790)
showed successful translation collection and overlay on both x86-64 and arm64. The published
x86-64 Core image identified its source as `7650c522a5e2bae90ac9f817e7853360cd78b2dd`.
Regenerating the expected English from that revision and reading the installed files inside
the image found all 63,984 required strings across 1,161 integrations. Every value matched.
The shipped files retained one additional string. Other languages for the integrations added
here still fall back to English. The package contents check covered x86-64.

## Commit and build rule

Commits on main carry a skip marker (`[skip ci]`) so a push alone does not start a build; a commit that asks for a build leaves it off.
One build is dispatched per batch of commits, by hand, with `gh workflow run release.yml --ref
main`. Pushes alone never offer a build to installed instances. Reason: each build takes between
about 17 minutes and 2 hours, and a new push drops the build that is waiting. A commit that asks for
a build says so; commits that were not seen in a browser state that they ask for no build.
