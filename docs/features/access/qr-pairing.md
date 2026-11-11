# Pairing an authenticator (QR step)

## What the board is

The board `QrPairing` ("Pair an authenticator", step 3 of 3 of a lock's setup) is not a way to sign in on another device. It is the step of the lock wizard where a lock that uses a one-time code shows a QR picture and the key as text, and asks for one correct code before the lock starts asking for codes. It pairs an authenticator app with a lock, and it grants no session.

This step is already built in the lock wizard (`frontend/src/components/locks/ha-lock-wizard.ts`): the QR is drawn locally with `ha-qr-code`, the key is shown in groups of four, can be copied, and one correct code must be typed before the step passes. See [`locks.md`](locks.md).

## Related card on the profile page

The profile page's Security tab has an Authenticator app card (`frontend/src/panels/profile/ha-authenticator-card.ts`) that sets up the server's existing time-based one-time password module for sign-in, using the module's own setup flow, and removes it. It is separate from the lock wizard: lock secrets stay in this browser, sign-in secrets stay on the server.

- The QR picture and the key come from the server's setup step. They are held in memory only while the setup window is open and are never put in a label, a live region, a log, an address or browser storage.
- The key is masked until Show is pressed. Copy puts it on the clipboard and announces only "Key copied".
- The code field accepts digits only and counts the digits left. The server checks the code.
- Removing asks for confirmation and calls `auth/depose_mfa`.
- The card is hidden when the server has the module switched off in `auth_mfa_modules`. It is on by default (`id: totp`).

## Not designed here

Signing in on one device by scanning a code shown on another, signed-in device is not what either board shows, so no flow is designed for it in this document. If that feature is wanted later it needs its own board and a security review first.
