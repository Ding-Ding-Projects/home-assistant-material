# Backups

| File | Feature | State |
| --- | --- | --- |
| [`official-backups.md`](official-backups.md) | Restoring official Home Assistant backups, the version rule | Fixed in source, see the file for what was verified |
| [`host-workflow.md`](host-workflow.md) | Start a separate hosted copy from a selected or uploaded backup | Implemented source; final build and runtime verification pending |
| [`hosting-native.md`](hosting-native.md) | Desktop upload, provisioning jobs and protected restoration | Implemented source; target runtime verification pending |
| [`hosting-protocol.md`](hosting-protocol.md) | Approved computer pairing and Core job coordination | Implemented source; final integration tests pending |
| [`appliance-bootstrap.md`](appliance-bootstrap.md) | Fresh appliance media and destination identity | Helper built; synthetic checks passed; real media and first boot pending |
| [`backup-progress.md`](backup-progress.md) | Stages, per-place upload rows, live output and results for a running backup | Local backup stage list seen; real cloud places not seen |
| [`backup-self-check.md`](backup-self-check.md) | Light, full or off self-check, three kinds of copy, the full hosting fix | Fix proven on a throwaway full-hosting copy and seen passing 4 of 4 in a real run of build 523; the card refresh is on main only |
