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
- Adding a passkey needs a connection from a normal interactive sign-in made in the last 10
  minutes (`recent_sign_in_required` otherwise), and so does removing one. The sign-in may be
  with the password or with a passkey the person already holds: both prove the person, and a
  passkey sign-in is recorded against the same account credential. A long-lived access token and
  a sign-in that asks for no secret (such as trusted networks) never qualify.
- Run on 11 November 2026 in build 109 with a browser virtual authenticator (not a hardware key
  or a phone): adding, signing in without the password, adding a second and removing one, a
  clean failure once the authenticator no longer held the credential, and a clean refusal
  without user verification all worked. A browser reports a refusal by the authenticator in the
  same way as a dismissed prompt, so the interface cannot tell the two apart and says
  "cancelled" for both.
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
