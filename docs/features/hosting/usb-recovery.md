# USB recovery stick

Status: implemented in the operating system image source, tested with pretend hardware only. It has not yet been proven on a real Raspberry Pi or any other board.

## What it is for

When an update leaves a device broken, you can repair it or reset it completely by plugging in a USB stick, without opening the case to remove the card. The operating system looks for a USB stick whose label is exactly `HA-RECOVERY`. If one is present and carries a valid request file, the device performs the one action the file asks for and writes a plain text report onto the stick.

Without a stick labelled `HA-RECOVERY`, nothing at all happens. The recovery service is not even started, adds no boot delay, and no other part of the system depends on it.

## Which breakages it covers

The device must still start far enough to run the operating system, the update service and (for the app reset) mount its data partition.

| Situation | Action to use |
| --- | --- |
| An update installed but the system misbehaves, and the system copy is damaged or a clean reinstall of the same version is wanted | `reinstall-os` |
| Apps or their container storage are corrupt and the apps will not start | `reset-apps` |
| The device must be returned to a fresh state, or the data partition is unusable | `factory-reset` |

## What it cannot cover

- A destroyed boot partition, or both system copies failing to boot. The device never reaches the point where it can read the stick, so the card still has to be removed and re-flashed. Making a Raspberry Pi try USB before the card is a separate boot configuration and is not part of this feature.
- A device that does not start at all and does not reach the operating system.
- `factory-reset` on boards that do not use a `cmdline.txt` on the boot partition. Those boards report a clear failure in the result file and change nothing. Raspberry Pi 3, 4 and 5 use that file.

The automatic fallback that already exists keeps working: if a freshly installed system copy fails to start, the device returns to the previous copy on its own. This feature is for the cases that fallback does not handle.

## Preparing the stick

The Deploy Assistant can write the request file (and the update file for a reinstall) for you: see [Making a stick with the Deploy Assistant](offline-update-pack.md#making-a-stick-with-the-deploy-assistant). It needs a stick that is already labelled `HA-RECOVERY` and does not relabel or format anything. For updating a device without internet from a whole build, see the [offline update pack](offline-update-pack.md).

By hand:

You need a USB stick of any size and another computer.

1. Format the stick as FAT32 (best for most sticks), exFAT or ext4.
2. Set its volume label to exactly `HA-RECOVERY` (capital letters, with the hyphen).
3. For `reinstall-os` only: download the update file for your board from the release page and copy it to the root of the stick. The file name looks like `haos_rpi4-64-17.1.raucb`. Use the file for your own board; a file for another board is refused. The version must be the same as, or newer than, the version running on the device.
4. Create a text file named exactly `recovery-request.json` in the root of the stick (not in a folder), containing one of the requests below. Use a plain text editor and make sure the file extension is really `.json`, not `.json.txt`.
5. Eject the stick, plug it into the device and wait. The result file is on the stick afterwards.

How to format and label the stick:

- Windows: right click the drive in File Explorer, choose Format, pick FAT32 or exFAT, type `HA-RECOVERY` as the volume label.
- macOS: Disk Utility, Erase, format MS-DOS (FAT) or ExFAT, name `HA-RECOVERY`.
- Linux: for example `sudo mkfs.vfat -F 32 -n HA-RECOVERY /dev/sdX1`. Double-check the device name first, because this erases that device.

### Request files

Reinstall the operating system (same board, same or newer version):

```json
{
  "format": 1,
  "action": "reinstall-os",
  "confirm": "REINSTALL-OS",
  "bundle": "haos_rpi4-64-17.1.raucb"
}
```

An optional `"minimum_version": "17.1"` refuses any update file older than that version.

Reset the apps (container storage). Settings and the Home Assistant configuration are kept:

```json
{
  "format": 1,
  "action": "reset-apps",
  "confirm": "RESET-APPS"
}
```

Factory reset. This erases everything on the device: all settings, apps, history and the Home Assistant configuration:

```json
{
  "format": 1,
  "action": "factory-reset",
  "confirm": "ERASE-EVERYTHING-ON-THIS-DEVICE"
}
```

The `confirm` text must match the action exactly. Any other content, an unknown key, a file larger than 4 KiB, a link instead of a real file, or a second request file means nothing is done and the reason is written to the result file.

## What the lights and the result file say

If the board has an activity LED that can be controlled from user space (the green activity LED on Raspberry Pi boards), it shows:

- Fast blinking: the action is running.
- Slow, even blinking (one second on, one second off): finished successfully; the device restarts shortly.
- Rapid flickering: the action failed or the request was refused.

If the board has no usable LED, the status is only printed to the console (HDMI or serial) and written to the result file.

The file `recovery-result.txt` in the root of the stick is appended to on every run. Each line starts with the date and time in 24-hour UTC and the file records the board, the running version and slot, the action, each step and its result. Read it on another computer.

The request file is renamed as the work proceeds:

- `recovery-request.started-<UTC time>.json`: the action began.
- `recovery-request.done-<UTC time>.json`: it finished.
- `recovery-request.failed-<UTC time>.json`: it failed.

## Safety rules

- One shot. A stick that already carries a started, done or failed request is never acted on again. To run another action, make a fresh request on a clean stick or delete the old marker files.
- A stick with a valid-looking but refused request keeps its request file and can be corrected and tried again.
- Nothing is run, imported or read from the stick other than the request file and the update file. Settings import stays the job of the separate `CONFIG` stick.
- The stick is mounted from its label only, with no execute permission, no special device files and no set-user-ID files.
- `reinstall-os` installs through the normal update service, which verifies the signature of the update file. A bad or unsigned file fails and nothing else is changed.
- `reset-apps` and `factory-reset` use the existing reset mechanisms of the operating system; they do not delete anything themselves. `factory-reset` sets the existing erase flag, and the erase happens during the next start.
- If the stick is removed or the system is stopped part way, the request is marked failed (or stays marked started) and is not retried automatically.
- If anything about the stick is odd, the device simply continues to boot normally.

## Test status and honest limits

The recovery script was tested with pretend hardware only: ordinary temporary folders standing in for the stick, the boot partition and the data partition, a fake update tool and a fake restart command. The tests cover refused and malformed requests, wrong or older update files, the three actions, the one-shot rule and failure handling. The systemd unit was reviewed by hand and was not run under systemd.

It has not been proven on a real Raspberry Pi 3, 4 or 5 or on any other board. Still unproven: that the stick is recognised and the unit starts at the right time during a real boot, mounting FAT32, exFAT and ext4 sticks on the real kernel, a real signed update install from the stick, the erase on a real data partition, the LED patterns, and the behaviour of each board.
