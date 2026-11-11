# First-run integrations step

The last step of the first-run setup lists the integrations the instance discovered on the local network and on connected hardware. Each one can be set up now or left for later. Nothing here contacts a cloud service or opens an outside link: discovery and the set-up dialog are the instance's own.

## What you see

- Each discovered integration is a card with its name, where it was found, and a status: Ready to add, Setting up, Added, Needs input or Failed.
- A switch on the card chooses it for set-up. Newly discovered items start switched on. A choice to switch one off is kept.
- A **Set up** button on the card starts that one flow in the normal configuration dialog.
- **Set up chosen items** at the bottom runs every switched-on item one after another.
- A count shows how many items are chosen. After the first result, a live line shows how many were added, need input or failed.
- **Skip for now** (or **Finish** once something was added) is always available and moves on. Skipped items stay under Settings, Devices and services.

## Results

| Result | Meaning | What happens to the other choices |
| --- | --- | --- |
| Added | The dialog created an entry. | The item is no longer chosen. |
| Needs input | The dialog was closed before it finished. | The item stays chosen; try it again any time. |
| Failed | The flow ended without adding anything, could not be loaded, or did not answer within 15 minutes. | The item stays chosen, with a plain reason shown on the card. |

## Buttons never get stuck

The step is driven by a small state machine in `frontend/src/onboarding/onboarding-integration-state.ts`. Whatever happens to a flow (finished, cancelled, thrown error, or a dialog that never reports back), it always ends with no flow running. Only the set-up buttons wait while a flow runs; **Skip** and **Finish** are never disabled. Leaving the step also clears a flow that cannot answer.

| Step phase | When |
| --- | --- |
| idle | Nothing runs and nothing failed. |
| running | One flow's dialog is open. Set up buttons are off. |
| failed | At least one flow failed; set up buttons are on again. |
| done | Something was added and nothing chosen is left. |

## Failure modes

- The server cannot load the flow: the card shows the reason and the Set up button stays available.
- The dialog is closed halfway: the card says it needs input.
- A flow that never answers is failed after 15 minutes so the queue can move on.

## Privacy

Discovery and flows are instance calls only. Brand icons are loaded from the instance's own brands path. No data leaves the instance and no outside help links are shown.

## Verification

`frontend/test/onboarding/onboarding-integration-state.test.ts` covers every transition, the stuck-buttons case (failed, thrown, never-answering and cancelled flows) and the queue. The page itself was not seen in a browser when this was written.
