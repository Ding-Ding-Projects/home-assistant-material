# Marketplace

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`add-from-a-file.md`](add-from-a-file.md) | Add an item from a ZIP archive, detected without a history folder | Server endpoint run on a throwaway instance; dialog not yet seen |
| [`install-a-package.md`](install-a-package.md) | Install a packaged installer (.hapkg) by dragging it onto the panel, with checksums and automatic updates | Server and browser tests run; not yet seen in a running browser |
| [`changed-domain.md`](changed-domain.md) | Update an integration whose domain changed, through a bridge release when there is one | Unit tests only; not tried on a live instance |

The upload endpoint is `POST /api/marketplace/upload` (administrators only). It is not part of
the upstream API, so there is no Postman collection for it.
