# Canvas 50: SSH access with your own public key

A new settings page, Settings > System > SSH access, for owners and administrators. It lets the owner paste a public key so that a trusted machine can sign in over SSH. Sign-in is by key only; there is no password login. The page shows whether SSH is on, how to connect, the keys that can sign in, a field for adding a public key that checks the line before anything is saved, and a way to remove one key or all of them. One canvas page per screen size, a title note per page and a note beside every board.

3 boards: 2 phone boards at 390 x 844 and 1 fluid wide board at 1280 px.

Every board is interactive and has the same tweaks: accent, motion, theme (dark or light) and stage.

## SSH access on a phone

SSH access on a phone: the whole page with its status, keys and add form, and a closer look at pasting, checking and adding a public key.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `Main.dc.html` | Phone, 390 x 844 | `after` | after, off, remove-confirm, docker, unsupported |
| `AddKeyPhone.dc.html` | Phone, 390 x 844 | `after` | after, added, private-key, invalid, duplicate, two-keys |

**SSH access page, phone** (`Main.dc.html`). Shows the new Settings > System > SSH access page on a phone. A status card says whether SSH is on, gives the connect command with a Copy button and the keys-only, keep-port-22222-at-home warning. Below it are the keys that can sign in (type, name, fingerprint, Remove), a public key field that checks the line as you type and previews type, name and fingerprint before adding, and Remove all keys. A pasted private key is refused and the field cleared. With no keys, SSH is off and the add card comes right after the status, outlined. Docker full mode adds a port note; unsupported installs get an explanation and nothing to press. Try: press Paste then Add key; remove both keys and use Undo; type "BEGIN OPENSSH PRIVATE KEY" in the field. Unbuilt: all of it. Tweaks: accent, motion, theme (dark or light), stage.

**Adding a public key, phone** (`AddKeyPhone.dc.html`). Shows adding a public key on the SSH access page, on a phone. The field checks the pasted line as you type and shows the key type, name and fingerprint before anything is saved, so Add key is only enabled for one valid public key. The field grows so every pasted line stays in view. A private key is refused at once: the field is cleared and a red message says to paste the .pub file instead. Plain errors cover text that is not a key, two lines pasted together and a key already on the list. Adding puts the key on the list, marked New, with the toast "Key added. SSH is on." Try: tap the sample paste chips, type your own key line, press Add key, then remove a key and confirm. Unbuilt: all of it; this is a new design. Tweaks: accent, motion, theme (dark or light), stage.

## SSH access on a wide window

SSH access on a wide window: the same page in two columns, status and how to connect on the left, keys and the add form on the right.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `SshWide.dc.html` | Wide, 1280 px, fluid | `after` | after, off, private-key, docker |

**SSH access on a wide window** (`SshWide.dc.html`). Shows the new Settings > System > SSH access page on a wide window. Two columns: status ("SSH is on" or "SSH is off"), the connect command with a 48 px Copy button, the keys-only warning and a short how-to on the left; the keys that can sign in, the add form and "Remove all keys" on the right. The columns stack at phone width. The add form previews type, comment and fingerprint. A private key is refused at once and the field cleared; the "not a public key" message waits until you leave the field, press Add key, or the line can no longer be a key. Removing asks first, inline in the row, and keyboard focus follows; removing the last key turns SSH off. Try: tap the sample chips and press Add key; remove both keys; on the docker stage press Check again. Unbuilt: all of it; fingerprints on the board are stand-ins. Tweaks: accent, motion, theme (dark or light), stage.

## State

Design only; nothing on these boards is built yet. Each board's script was checked under Node for every stage in both themes with motion on and off. Fingerprints and key names on the boards are made-up sample data.
