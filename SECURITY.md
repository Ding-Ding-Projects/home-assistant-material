# Security

Report a vulnerability privately through
[GitHub security advisories](https://github.com/Ding-Ding-Projects/home-assistant-material/security/advisories/new).
Please do not open a public issue for a vulnerability.

Scope: this project's own changes (listed in `docs/material-changes.md`), its release workflow,
update feed and build scripts. A vulnerability in unchanged upstream code should be reported to
the upstream project; it reaches this project when the vendored folder is updated.

Things to know:

- Container images are public on `ghcr.io/ding-ding-projects`.
- Operating system images built without the `RAUC_CERTIFICATE` and `RAUC_PRIVATE_KEY` secrets are
  signed with a one-time key and do not receive over-the-air operating system updates.
- The keyring of an operating system image also contains the upstream release certificate.
