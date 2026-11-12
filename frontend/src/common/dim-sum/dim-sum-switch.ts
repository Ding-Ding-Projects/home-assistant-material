/**
 * The dim sum surprise cannot be turned off. The switch in the personal
 * settings only looks like a switch: whatever it is set to, it goes back on,
 * says so, and nothing is stored.
 */
export interface DimSumSwitchOutcome {
  /** What the switch shows afterwards: always on. */
  checked: true;
  /** True when the message that it cannot be turned off should show. */
  showNote: boolean;
  /** True when anything about the switch is saved. Never. */
  store: false;
}

export const dimSumSwitchOutcome = (
  requestedChecked: boolean
): DimSumSwitchOutcome => ({
  checked: true,
  showNote: !requestedChecked,
  store: false,
});
