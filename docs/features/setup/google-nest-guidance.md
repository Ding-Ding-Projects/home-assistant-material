# Google Nest registration guidance

Code: `frontend/src/panels/config/google-setup/nest-guidance.ts` and the Nest block of
`ha-config-google-setup.ts`. Tests: `frontend/test/panels/config/google-setup/nest-guidance.test.ts`.

## What it does

When Nest is among the Google integrations available, the last step of the Google setup page
("Add integrations") shows a checklist for registering for Device Access:

1. Create a Google Cloud project.
2. Switch on the Smart Device Management API.
3. Register for Device Access.
4. Note the Device Access project ID and paste it.
5. Add this instance's redirect address to the OAuth client.
6. Create the OAuth client and paste its JSON file to check it.

Each step has a tick box and a plain-language text. Progress is shown as "N of 6 Nest steps done".
The ticks are remembered in this browser only.

## Addresses and the redirect

Outside addresses (Google Cloud console, Device Access console) are shown as plain text in a field
with a copy button. The page never opens them and never requests them.

The redirect address is built from the current page origin (`<origin>/auth/external/callback`), or
the My Home Assistant address when that integration is loaded, and has a copy button.

## Validation

- The project ID must be a UUID (8-4-4-4-12 hexadecimal characters). It is checked as you type.
- The pasted client file goes through the same parser as the credential step, so the same errors
  appear (not JSON, no client ID, no secret, and so on).

## Privacy

Nothing is sent anywhere by this step. The pasted client file is held in memory only, is never
stored, and is dropped when you leave the page. The project ID is kept in the existing setup draft.

## Failure modes

If browser storage is unavailable the ticks are not remembered; the checklist still works.
