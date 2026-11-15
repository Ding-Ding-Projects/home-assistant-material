# Host a backup on another instance

The backup list and backup details provide **Host as a container web app** and
**Host as an appliance** actions for administrators. These create a separate
instance on the computer paired through Deploy Assistant. They do not restore
over the source instance or change its automations.

## Pair the computer once

1. Open Deploy Assistant on the computer that will host the restored instance.
2. Choose **Pair this computer with a Home Assistant backup page**, select its
   private LAN address, and enable backup hosting.
3. On the source backup page, enter the displayed HTTPS address and certificate
   fingerprint. Request pairing, verify the exact client in the native
   confirmation, then check approval.
4. Select this paired computer and an available target. A protocol capability
   alone is not sufficient: the runtime must report that it is available.

The browser remembers only the paired computer identifier and selected target.
Subsequent row actions start the selected backup directly when it is unprotected
and the saved target remains available. Protected backups ask for their key.
Keys remain transient and are cleared after submission and when the dialog closes.

## Upload an archive in Deploy Assistant

Choose **Host a backup** and use the native picker for a ZIP or native backup
archive. The renderer receives an expiring opaque handle, file name, and size;
it does not receive archive bytes or an arbitrary local path.

Use the existing target settings for Docker, an SSH host, VirtualBox, VMware, or
Raspberry Pi. The hosting action submits those settings to the backup coordinator,
which provisions and restores the selected archive. Raspberry Pi media is chosen
from the native removable-drive inventory and requires a separate native
destructive-write confirmation. Waiting for physical hardware remains a waiting
state, never a fabricated ready result.

## Automation state and progress

The restored instance preserves the original active automation state. Active
automations may therefore run in both instances. The interface states this
explicitly; it does not silently pause or rewrite automations.

Progress comes from the coordinator. Restore acceptance, restart waiting,
authentication, hardware waiting, and verified readiness remain distinct. The
Open link appears only when the backend reports `ready` with a verified LAN URL.
When the job needs authentication, a separate **Open sign-in to verify** action
appears only after the backend reports an independently verified LAN address and
a timezone-qualified verification timestamp. This is an incomplete verification
step, not the ready link or a successful restore verdict.

An interrupted connection reconnects to the existing job instead of creating a
second instance. An explicit incorrect-key result can retry the same request and
instance with a new transient key. Cancellation is a separate action.

## Verification status

Focused frontend tests cover stale-link suppression, unsafe URL rejection,
fail-closed runtime availability, and the exact incorrect-key retry condition.
They are authored but have not been run in this implementation lane. Builds,
native execution, 360 px and 1440 px interaction, language/theme checks, pairing,
all five provisioning targets, and real restored LAN reachability remain pending
integration verification. Source implementation is not runtime proof.
