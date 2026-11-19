# Storage

Places where recordings and backups can be kept besides this system. The server side lives in
`core/homeassistant/components/`.

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`container-registry.md`](container-registry.md) | A free public container image registry as a locked place for recordings and backups: the lock, the format, the guided setup, repositories per camera, what public means | The storage integration (lock, client, store, guided setup) is written and tested against an in-memory registry and a real local registry; the pages that use it (camera recording, playing an older recording, backups) are not built yet; never run against Docker Hub or GitHub |

Related, documented elsewhere:

- The design: `design/canvases/38-progress-drafts-entities/Registry.dc.html` and its README.
- Cloud drives as a recording place: `design/canvases/38-progress-drafts-entities/Cloud.dc.html`.
