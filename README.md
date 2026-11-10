# Update feed

This branch holds the update feed for Home Assistant Material. The supervisor reads
`stable.json` (or `beta.json` / `dev.json`, which carry the same content) to learn which
versions are current and where their container images live. The release workflow on
`main` rewrites these files; do not edit them by hand.
