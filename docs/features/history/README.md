# History comparison

In History, choose sources and a date range, then use **Compare with an earlier period**. Choose **Do not compare**, **Previous equal window**, **One day earlier**, or **One week earlier**. The selector is keyboard accessible and wraps above its explanation on narrow screens. English, Cantonese, and bilingual preferences apply to its labels and status.

Earlier numeric records appear as lighter dashed lines aligned with the selected window. The preceding equal window has the same duration as the elapsed part of the selected range. Future dates do not create future samples. Requests are limited to elapsed windows of at most 31 days and to the selected entities. External statistics, timelines, and multi-value climate graphs are not compared. Recorded states may cover only part of the earlier window; missing history is never replaced with current values or interpolated into a complete comparison.

Changing the range, sources, or comparison option clears the previous comparison. Late responses and subscription callbacks cannot overwrite a newer selection. Leaving the page invalidates pending work. Loading, missing data, unsupported range, and request failure have visible status messages. Select the period again to retry. Current history remains available when comparison alone fails.

CSV downloads contain original current records, not the shifted display-only comparison samples. Adding the view as a dashboard card carries its comparison choice. Dashboard history cards also invalidate pending statistics, comparisons, subscriptions, and redraw timers when reconfigured or disconnected.

## Verification

The lifecycle regression tests are in `frontend/test/panels/history/history-comparison-lifecycle.test.ts`. They cover late success and failure, reconfiguration during subscription setup, disconnect, bounded requests, external-only sources, and missing historical samples. Existing comparison-transform tests remain in `frontend/test/data/history-compare.test.ts`.

Implementation is prepared. Tests, production build, keyboard interaction, and 360 px runtime checks have not yet been run for this change.
