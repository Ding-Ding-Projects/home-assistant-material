# Marketplace

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`add-from-a-file.md`](add-from-a-file.md) | Add an item from a ZIP archive, detected without a history folder | Server endpoint run on a throwaway instance; dialog not yet seen |
| [`changed-domain.md`](changed-domain.md) | Update an integration whose domain changed, through a bridge release when there is one | Unit tests only; not tried on a live instance |

The upload endpoint is `POST /api/marketplace/upload` (administrators only). It is not part of
the upstream API, so there is no Postman collection for it.
