# Passkeys

Code: `core/homeassistant/components/passkey/`, `frontend/src/auth/ha-passkey-login.ts`,
`frontend/src/panels/profile/ha-passkeys-card.ts`, `frontend/src/data/passkey.ts`.

## What it does

A person can sign in with a fingerprint, face or security key on a secure address, beside the
password, which stays. Passkeys are added, renamed and removed on the profile page.

## Rules

- The origin and relying party are derived from the request, never from its body. WebAuthn
  needs a secure context and a domain name, so plain http is accepted only for localhost and
  IP addresses are refused. Hosts containing `@`, `/`, `?`, `#`, a backslash, whitespace or a
  trailing dot are refused.
- User verification is required, so a passkey sign-in does not ask for a second sign-in step.
- A person may hold up to 20 passkeys; names are at most 64 characters.
- Adding a passkey needs a connection from a normal interactive password sign-in made in the
  last 10 minutes (`recent_sign_in_required` otherwise). Removing one also needs a recent
  password sign-in.
- Pending registrations are limited to 3 per person and 500 overall; a full pool refuses the
  newcomer and never evicts another person's entry. Starting a sign-in stores nothing on the server: the challenge and what it is bound to travel
  in a token signed with a key kept only in memory, and the only state is the set of token ids
  already presented, kept until the token would have expired (`sign_in_token.py`).
- The signature counter is checked and updated before any waiting step, so two assertions with
  the same counter cannot both pass.
- A malformed stored item is skipped and logged, not fatal.

## WebSocket commands

`passkey/list`, `rename`, `delete`, `delete_all`, `register_begin` and `register_finish`;
sign-in uses `/auth/passkey/begin`, `/finish` and `/status`.

## Verification

143 server tests passed in a running copy on 10 November 2026. No real authenticator was used,
and the sign-in page and the profile card have not been seen in a running build. Review findings
still to confirm (hiding the button on an IP address, the card's wording about sessions, a
"remove all passkeys" button) are in `../../HANDOFF.md`.
