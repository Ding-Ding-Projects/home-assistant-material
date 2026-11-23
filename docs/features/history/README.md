# History comparison

In History, choose sources and a date range, then use **Compare with an earlier period**. Choose **Do not compare**, **Previous equal window**, **One day earlier**, or **One week earlier**. The selector is keyboard accessible and wraps above its explanation on narrow screens. English, Cantonese, and bilingual preferences apply to its labels and status.

Earlier numeric records appear as lighter dashed lines aligned with the selected window. The preceding equal window has the same duration as the elapsed part of the selected range. Future dates do not create future samples. Requests are limited to elapsed windows of at most 31 days and to the selected entities. External statistics, timelines, and multi-value climate graphs are not compared. Recorded states may cover only part of the earlier window; missing history is never replaced with current values or interpolated into a complete comparison.

Changing the range, sources, or comparison option clears the previous comparison. Late responses and subscription callbacks cannot overwrite a newer selection. Leaving the page invalidates pending work. Loading, missing data, unsupported range, and request failure have visible status messages. Select the period again to retry. Current history remains available when comparison alone fails.

CSV downloads contain original current records, not the shifted display-only comparison samples. Adding the view as a dashboard card carries its comparison choice. Dashboard history cards also invalidate pending statistics, comparisons, subscriptions, and redraw timers when reconfigured or disconnected.

## Control the current entity

When you select one entity directly in Sources and it passes the active filters, History shows its current controls above the chart. Controls use the live entity even when viewing an earlier period. Read-only entities show their current value. Protected actions keep their usual confirmation. For a group or multiple sources, use Sources to replace the selection with one named entity. Filtering a group down to one match does not enable controls. Historical samples remain read-only.

## Verification

On the isolated build 548 installation, a numeric helper recorded 3, 11, 19 and 24 W in
one nine-second window, followed by 24, 62, 78 and 85 W in the next. **Previous equal window**
shifted the earlier trace forward by 9,000 ms and drew it dashed at 55% opacity. **One day
earlier** and **One week earlier** reported no comparable samples for this newly created helper.
Switching back to **Do not compare** removed the earlier trace. The current readings and their
timestamps stayed identical through all five states. The browser matched 126 served scripts
to frontend wheel `49ed6a6b8729`. Populated day-old and week-old examples remain unverified.

The lifecycle regression tests are in `frontend/test/panels/history/history-comparison-lifecycle.test.ts`. They cover late success and failure, reconfiguration during subscription setup, disconnect, bounded requests, external-only sources, and missing historical samples. Existing comparison-transform tests remain in `frontend/test/data/history-compare.test.ts`.

The current-controls regression renders the History panel template and checks direct selection, target replacement, multiple sources, an area with one match, filtered-out targets and deleted entities. The History, comparison, quick-control and language-mode suites passed 58 tests. In a separate check of the production demo build, Chromium opened History with a synthetic coffee-machine switch. The demo fixture registered the built History panel in memory because the stock demo omits it from its panel list. At 360 × 800 and 1440 × 900, pressing Space on the switch changed its live state from on to off while the earlier chart still showed on. English, Cantonese and bilingual wording passed at both widths. The narrow bilingual title wraps onto two lines. All six browser runs checked that the selected entity, switch and complete title remained reachable, the recorded chart samples were unchanged after the action, and the control section and page fit within the viewport. Real-device service calls were not exercised.
