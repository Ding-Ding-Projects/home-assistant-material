# Tab model (`common/tabs`)

Pure logic and storage for tab strips. No component code. Every function that
reads stored data validates it (bounded lengths, known shapes, no prototype
keys, unknown fields dropped), because stored data can arrive from the instance
through the settings sync. Strips are told apart by a `surface` name; the
default surface is `"main"`.

Page ids are bare URL paths, exactly as stored by earlier versions. Settings
pages and tools use the ids `settings:<path>` and `tool:<path>`.

| Module                                 | What it does                                                                                                                                                | Example                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab-validate.ts`                      | Shared checks: `cleanIds`, `cleanName`, `cleanSurface`, `isSafeKey`, `moveId`.                                                                              | `cleanIds(["a", "a", 1])` gives `["a"]`                                                                                                                                                               |
| `tab-seen.ts`                          | Remembers every tab ever offered (key `pageTabsSeen`); open and close tabs; "Open every tab".                                                               | `reconcileSeen(available, seen).newlyOffered` lists tabs to open once; `openEveryTab(available, closed)` gives `{ closed, reopened }`                                                                 |
| `tab-pins.ts`                          | Pin, unpin, strip order with the pinned region first, moves that never cross the pinned edge (key `pageTabsPinned`).                                        | `orderTabs(available, order, pinned)`; `moveWithinRegion(ordered, pinned, "a", 2)` gives `{ ids, ok }`                                                                                                |
| `tab-groups.ts`                        | Groups (key `pageTabsGroups`, per surface): create, rename, recolour, collapse, remove, move tabs in, out and between; strip layout and segment reordering. | `createGroup(groups, { name: "Home", members: ["a"] }, pinned)`; `layoutStrip({ visible, order, pinned, groups })`; `reorderSegments(segments, "group:g1", "tab:a", false)` gives the new saved order |
| `tab-dock.ts`                          | Dock edge per surface, left by default (key `pageTabsDock`).                                                                                                | `readDock("main")`; `writeDock("main", "bottom")`; `dockOrientation("left")`                                                                                                                          |
| `tab-appearance-store.ts`              | Per-tab look by stable tab id, reset per property, per tab, all (key `pageTabsAppearance`).                                                                 | `setTabAppearance(store, "main", "light", "color", "#f00")`; `resetTab(store, "main", "light")`                                                                                                       |
| `tab-locks.ts`                         | Lock keys and lock state for tabs and groups, built on the existing lock store (`elementLocks`). No credential is handled here.                             | `tabLockKey("main", "light")`; `tabLockState(lockStore, "main", "light", groups)`                                                                                                                     |
| `tab-destinations.ts`                  | One tab per destination.                                                                                                                                    | `openDestination(openIds, closed, "page", "/map")` gives `{ action: "focus" \| "open" \| "none" }`                                                                                                    |
| `tab-close-plans.ts`                   | Close plans with a preview of closed and protected tabs: containing, not containing (visible label only), others, to start, to end.                         | `planTextClose(tabs, "light", "containing")`; `planEdgeClose(tabs, "light", "others")`; `reportClose(plan, openAfter)`                                                                                |
| `tab-search.ts`                        | Data for the four searches: strip, group, group names, master list.                                                                                         | `searchMaster(buildSearchRows(strips, lockStore), "kitchen")`                                                                                                                                         |
| `tab-migrate.ts`                       | Reads today's three lists and brings them into the model without loss.                                                                                      | `migrateTabState({ stored, available, seen, groups })`                                                                                                                                                |
| `bulk-close.ts`, `tab-group-search.ts` | Earlier plans, unchanged; still used by the catalog and the phone sheet.                                                                                    | `planBulkClose(tabs, "li", "matching")`                                                                                                                                                               |

Locks: a tab or group lock is an ordinary record in `elementLocks` under the
keys from `tab-locks.ts`. Create and remove it with `withLockRecord` and
`withLock`; remove the keys from `staleLockKeys` when tabs or groups are gone.

Group rules: a tab is in at most one group; a pinned tab is never in a group
(pinning takes it out with `ungroupTabs`); a group sits where its first member
sits in the saved order; a collapsed group still lists its members in
`layoutStrip` so a search can reveal one without changing the saved
`collapsed` flag.
