# Setup form controls

One shared form draws the setup, options and sign-in-again steps of about 1,000 integrations.
Commit `c86deec24`; the sign-in form was brought onto the same field rules in `117f536c0`.

## How a control is chosen

A field's name and kind choose its control:

- Passwords, tokens, keys and PINs are hidden, with a show and hide toggle.
- Email, host and code fields get the right keyboard and saved-value hints.
- Ports, scan intervals, timeouts, latitude and longitude get sensible limits and units when the
  integration declares none.
- Whole numbers with a small range are a slider with a number box; others have minus and plus
  buttons.
- Yes or no is a switch with its explanation beside it.
- Up to five choices are tiles; more are a searchable list; several-of-many are chips.
- Help text is always visible under its field, and an error sits under the field that caused it.

## Keeping it complete

A typed table maps every selector kind to a control, so a new kind breaks the type check until
someone gives it one. Tests pin the value each kind sends back, which is unchanged.

## Automation editor entries from the same change

- Time pattern hours, minutes and seconds: "every", "every N", "at exactly" or a custom pattern,
  with a slider. Stored values are read into the right mode and an untouched trigger is saved
  unchanged.
- Time trigger offset is a signed duration control. Geolocation source is a list of the sources
  actually seen.
- A test lists all 46 built-in trigger, condition and action kinds by hand and fails if one loses
  its editor.

## Limits

Event type, notification id, sentences and stop reason stay plain text by nature. Nothing here was
seen in a browser when it was written; the later local build pass (`900ceccca`) used a real
sign-in and integration editors but did not walk every setup form.
