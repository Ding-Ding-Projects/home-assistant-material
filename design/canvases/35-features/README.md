# Canvas 35: new features

Thirteen boards, one page per feature category. Every board is a fluid page that wraps to one column on a phone. They follow the rules of canvas 34 (one loud thing per page, heavy widened headings, big numerals, tonal blocks).

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Editors | The automation editor redrawn: the automation as one sentence, then numbered When / Only if / Then blocks, one Save. Scripts and scenes use the same frame |
| `Visual.dc.html` | Editors | Interactive. A visual editor for every trigger, condition and action, made for the thing it controls (light, thermostat, cover, media player, lock, notification), with a built form for everything else so nothing is left as only a code box |
| `Helpers.dc.html` | Editors | Interactive. Helpers created, edited and removed inside the automation editor |
| `Dialogs.dc.html` | Dialogs and sheets | The modern dialog on a wide window and the same dialog as a bottom sheet on a phone |
| `Empty.dc.html` | Empty states | One shared block for "nothing yet", "nothing matches" and "this page does not exist" |
| `Lists.dc.html` | Lists, buttons, toasts | Interactive. Statistic tiles that filter the list, the create button docked in the header, and a toast that never covers a row |
| `Tools.dc.html` | Developer tools | Six main tools in a pill control, the rest under "More tools" |
| `Updates.dc.html` | Updates and recovery | Update history with going back to an earlier build, the backup self-check, the USB stick maker, the offline update pack |
| `Away.dc.html` | While you were away | The digest on the front door after an absence |
| `Health.dc.html` | Device health | Low batteries, silent devices and weak signal in one list |
| `DryRun.dc.html` | Automation dry run | What an automation would have done over a past period, without running anything |
| `Rooms.dc.html` | Room setup | The room wizard: name, devices, starter automations, done |
| `Cloud.dc.html` | Cloud host | Reaching the instance from outside through a tunnel, set up with one button |

## Rules the boards carry

- Going back to an earlier build, installing from USB, erasing a stick, pausing or removing the cloud host, and removing a helper that is in use all need the existing two-key confirmation. Nothing is typed to confirm.
- Home Assistant itself, the Supervisor and the operating system never update or go back by themselves.
- The digest, device health and the dry run use only what the instance already records. Nothing is sent anywhere. Estimates say they are estimates, and anything that cannot be known is shown as "cannot tell".
- The cloud host is off by default and never sets itself up. Signing in to the tunnel provider happens on the provider's own page. The tunnel's credential is kept by the tunnel service and is never shown, copied or exported by the app.
- Every action keeps its code view; the visual editors add to it and remove nothing.

## Status

These are design references. Nothing here is shipped behaviour until it is built from them and checked in a real build. The interactive boards were made without filming or rendering frames; they are reviewed by using them on the canvas.
