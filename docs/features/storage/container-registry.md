# Container registry storage

Integration `registry_storage` ("Container registry storage") keeps files in a container image
registry such as Docker Hub or GitHub's, locked at home first. It exists so camera recordings and
backups can use a free public registry as a place. Public is expected, which is why the lock is not
optional: there is no password-free mode and no switch to turn the lock off.

Source: `core/homeassistant/components/registry_storage/`. Tests:
`core/tests/components/registry_storage/`.

## What the owner sees

A guided setup in four steps, matching the design board:

1. **Which registry.** Docker Hub, GitHub, or Other with its address. Plain http is accepted only
   for a registry on the local network, since the token would travel unprotected.
2. **Sign in.** Numbered plain steps for making an access token, then the account name and the
   token (password-type field). The token is checked against the registry, and a token that can only
   read is refused with a plain message. The account password is never asked for.
3. **Password.** Typed twice. At least 14 characters, not an obvious choice, not repetitive, and a
   conservative strength estimate. A required box says that a forgotten password cannot be
   recovered. The password is never stored or sent.
4. **Repository.** One repository holds everything by default; a missing repository is created. The
   page reads whether the repository is public (an anonymous pull works) and shows the real state.
   Public is accepted. A repository that already holds a lock made by another instance with the same
   password is opened and its key adopted; with another password it is refused.

Options let the owner give a camera, or the backups, a repository of their own, and change the
password (the old one is required). Reconfigure changes the token. A refused saved token starts the
re-sign-in flow.

## What public means

Anyone can copy the locked files and keep them for ever, and can try passwords against them offline
for as long as they like. A forgotten password cannot be recovered by anyone. A long password is the
only lock, which is why the minimum is 14 characters and why weak passwords are refused in code and
not only in the form.

Changing the password wraps the same key again and replaces the public lock header. Nothing stored
is re-sent. It changes who can open things from now on; a copy of the old header, and the old
password, still open everything that was already copied.

## The format, in plain words

- **Key.** One random 256-bit vault key encrypts everything. It is wrapped by a key made from the
  password with Argon2id (256 MiB, 8 passes, 4 lanes, random 16-byte salt; about 0.6 s on a current
  desktop CPU, more on a small board; it runs only at setup, at password change and when another
  instance opens the lock). The wrapped key and the cost settings are the public lock header. The
  wrapped key's authentication tag is the check value for a typed password. Costs read from a header
  are bounded (32 to 512 MiB, 2 to 16 passes, 1 to 8 lanes), since a header from a registry is not
  trusted.
- **What stays on this system.** Only the vault key, in `.storage` (`registry_storage.<id>`, private
  file), and the public header copy. The password is held only inside the setup flow until it ends.
  The access token sits in the config entry like any other integration credential and is redacted
  from diagnostics.
- **Objects.** One backup or recording bundle is one object. Each object has its own random key,
  sealed inside a fixed-size (2048 byte) object header together with the true length and a small
  record of name, kind, camera and date. Content is padded, cut into 1 MiB parts and each part is
  sealed with AES-256-GCM. The part number and a last-part flag are bound into every part, so parts
  cannot be reordered, dropped, cut short or moved into another object unnoticed, and any single part
  can be fetched and opened alone. This is what lets an older recording start playing from the first
  part, or from the middle, before the whole file has arrived.
- **Padding.** The padded length follows the Padme scheme (at least 4096 bytes, at most 12.5 percent
  larger), so objects of nearby sizes look alike. It is cheap and hides the exact size, not the rough
  size.
- **In the registry.** An object is a standard OCI image manifest: layer 0 is the sealed header, the
  other layers are the sealed parts, the config is a minimal valid image config. A registry accepts
  it; a container runtime cannot run it. Tags are random 32-character names, not readable.
- **Index.** What belongs to what is listed in an encrypted index object, one per repository, under a
  tag that looks like any other. Every object's own header repeats its name, kind and date, so an
  index that lost an entry (two writers at the same moment) is repaired from the tag list. Writers
  read the index again before writing, check by reading it back, and retry; a deletion that loses
  such a race can come back, which is the safe direction.
- **Lock tag.** The one readable tag, `lock`, carries the public header as a manifest annotation.

### What a stranger who copies the public repository learns

Everything the registry shows anyone: the account and repository names; how many objects there are
(tags), each object's number of 1 MiB parts and so its size to within the padding bucket; the total
stored size; and, from the registry's own records, when each part and manifest was uploaded. They can
see the integration's annotation on the lock tag and so know what the files are for. They learn
nothing about names, kinds, cameras, dates, contents, or which object is a backup and which is a
recording, and the index is not distinguishable by its tag. Upload times can still show that a camera
uploads after events. A client-side lock cannot hide that.

## Failure modes

Every failure is a reason code (`auth_failed`, `denied`, `not_found`, `rate_limited`, `unavailable`,
`timeout`, `invalid_response`, `rejected`, `insecure_address`, `invalid_address`,
`invalid_repository`, `wrong_password`, `not_locked`, `unsupported_format`, `tampered`, `truncated`,
`object_not_found`, `self_test_failed`, `invalid_request`, `password_too_weak`,
`password_mismatch`). Registry error text, tokens and addresses with credentials never reach logs or
exception messages.

- The registry may remove content that is not a container image, or slow down heavy use. The client
  retries rate limits and transient errors a few times with the registry's own delay, then reports
  `rate_limited` or `unavailable`. This must never be the only copy unless the owner chooses that.
- Delete asks the registry to delete the manifest. Docker Hub and others may refuse; the object then
  leaves the index and stays in the registry unreachable by name. Blobs are cleaned by the registry's
  own collection, if ever.
- A local file is never removed by the store. A caller removes its local copy only after
  `async_put_file` returns, which means the registry accepted the manifest (which it only does when
  every blob is present) and answered a read-back of the tag with the same digest. A self test uploads
  a small two-part object, opens it again and compares it, before a place is trusted.

## Security notes

- Content is authenticated: a flipped bit, a swapped part, a missing or cut part is refused.
- Blob downloads follow a redirect to a download host without the Authorization header. Upload
  locations on another host are refused.
- The access token should be limited to the one account's packages and to read and write.
- Per-object keys are random; part nonces are the part number, which is safe because every object has
  its own key.

## How it was verified

Tests run against a small in-memory registry (bearer, basic and open modes, uploads, ranges, tags with
pagination, delete, rate limits) and against a real `registry:2` container on a private container
network. Nothing was run against Docker Hub or GitHub. The setup flow, reconfigure, re-sign-in and
options were exercised in tests only, not seen in a browser. See `ROADMAP.md` for the current state.
