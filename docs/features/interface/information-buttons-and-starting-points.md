# Information buttons and starting points

Status: both built, neither seen in a running build. Boards `GuidedForm` and `BlankEditor`.

## Information buttons

`ha-setting-info` (`frontend/src/components/setting-info/`) is a button beside a setting that opens
a small panel with: what the setting does, its default, where it takes effect, what holds it right
now (School mode, a schedule or a shared default), and a link to a bundled help article when there
is one.

- Enter and Space open it; Escape and the close button close it and return focus to the button.
  The panel never traps focus and stays inside the screen on a phone.
- All text arrives already localized from the page; only the panel's own headings are the
  component's, and a page can replace them.
- The article link opens inside the interface, like every other help link.

Not built: the board's worked example and the practise control.

## Starting points

`ha-starting-points` (`frontend/src/components/starting-points/`) lists cards that offer ways to
begin when an editor is empty. The owner of the editor decides what choosing a card does, through
that editor's own normal path; the component only lists the choices and reports the one picked.

Offered today in an empty template editor (`template-starting-points.ts`) and in an empty
dashboard sections view. Not built: other empty editors such as an empty automation or script.

## How it was checked

A unit test covers the template starting points
(`frontend/test/components/starting-points/template-starting-points.test.ts`). Neither component was
opened in a browser.
