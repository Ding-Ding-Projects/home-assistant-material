import { css } from "lit";
import { extractVar } from "../../../common/style/derived-css-vars";
import { coreColorVariables } from "./core.globals";

export const colorStyles = css`
  html {
    /* text */
    --primary-text-color: var(--ha-color-text-primary);
    --secondary-text-color: var(--ha-color-text-secondary);
    --text-primary-color: #ffffff;
    --text-light-primary-color: #212121;
    --disabled-text-color: #bdbdbd;

    /* main interface colors */
    --primary-color: var(--ha-color-primary-40);
    --dark-primary-color: #1a47bd;
    --darker-primary-color: #123a9e;
    --light-primary-color: #dce4ff;
    --accent-color: #ff9800;
    --divider-color: #e3e9f2;
    --outline-color: #d6dbe5;
    --outline-hover-color: #b9c0ce;
    --shadow-color: rgba(20, 30, 60, 0.16);

    /* rgb */
    --rgb-primary-color: 33, 85, 214;
    --rgb-accent-color: 255, 152, 0;
    --rgb-primary-text-color: 20, 23, 28;
    --rgb-secondary-text-color: 74, 80, 92;
    --rgb-text-primary-color: 255, 255, 255;
    --rgb-card-background-color: 255, 255, 255;

    --rgb-warning-color: 255, 166, 0;
    --rgb-error-color: 180, 42, 24;
    --rgb-success-color: 26, 110, 62;
    --rgb-info-color: 3, 155, 229;

    --scrollbar-thumb-color: rgb(194, 200, 212);

    --error-color: #b42a18;
    --warning-color: #ffa600;
    --success-color: #1a6e3e;
    --info-color: #039be5;

    /* backgrounds */
    /* The window is the tinted ground behind the navigation rail. The pane is
       the soft surface pages sit on. Cards are white, raised with a soft
       shadow, so they read on it. */
    --ha-color-window: #eef2f8;
    --card-background-color: #ffffff;
    --primary-background-color: #f5f7fb;
    --secondary-background-color: #edf1f7;
    --clear-background-color: #f5f7fb;

    /* surface tones (low to high) and outline */
    --ha-color-surface-tone-1: #f5f7fb;
    --ha-color-surface-tone-2: #edf1f7;
    --ha-color-surface-tone-3: #e3e9f2;
    --ha-color-outline: #d6dbe5;

    /* container tones: a tinted fill and the text that sits on it */
    --ha-color-primary-container: #dce4ff;
    --ha-color-on-primary-container: #0b2a78;
    --ha-color-tertiary: #6d44b8;
    --ha-color-on-tertiary: #ffffff;
    --ha-color-tertiary-container: #efe3ff;
    --ha-color-on-tertiary-container: #3a1a73;
    --ha-color-warning-container: #ffe9c7;
    --ha-color-on-warning-container: #4d2c00;
    --ha-color-error-container: #ffe1dc;
    --ha-color-on-error-container: #b42a18;
    --ha-color-success-container: #d4f4df;
    --ha-color-on-success-container: #0f3d22;

    /* soft, layered shadows */
    --ha-shadow-card: 0 1px 2px rgba(20, 30, 60, 0.06), 0 8px 24px rgba(20, 30, 60, 0.07);
    --ha-shadow-overlay: 0 2px 6px rgba(20, 30, 60, 0.08), 0 24px 48px rgba(20, 30, 60, 0.16);

    /* for label-badge */
    --label-badge-grey: #9e9e9e;

    /* states icon */
    --state-icon-color: #44739e;
    /* an error state is anything that would be considered an error */
    /* --state-icon-error-color: #db4437; derived from error-color */

    /* energy */
    --energy-grid-consumption-color: #488fc2;
    --energy-grid-return-color: #8353d1;
    --energy-solar-color: #ff9800;
    --energy-non-fossil-color: #0f9d58;
    --energy-battery-out-color: #4db6ac;
    --energy-battery-in-color: #f06292;
    --energy-gas-color: #8e021b;
    --energy-water-color: #00bcd4;

    /* color */
    --disabled-color: #bdbdbd;
    --red-color: #f44336;
    --pink-color: #e91e63;
    --purple-color: #926bc7;
    --deep-purple-color: #6e41ab;
    --indigo-color: #3f51b5;
    --blue-color: #2196f3;
    --light-blue-color: #03a9f4;
    --cyan-color: #00bcd4;
    --teal-color: #009688;
    --green-color: #4caf50;
    --light-green-color: #8bc34a;
    --lime-color: #cddc39;
    --yellow-color: #ffeb3b;
    --amber-color: #ffc107;
    --orange-color: #ff9800;
    --deep-orange-color: #ff6f22;
    --brown-color: #795548;
    --light-grey-color: #bdbdbd;
    --grey-color: #9e9e9e;
    --dark-grey-color: #606060;
    --blue-grey-color: #607d8b;
    --black-color: #000000;
    --white-color: #ffffff;

    /* colors - used for graphs, calendars, maps, etc */
    --color-1: #4269d0;
    --color-2: #f4bd4a;
    --color-3: #ff725c;
    --color-4: #6cc5b0;
    --color-5: #a463f2;
    --color-6: #ff8ab7;
    --color-7: #9c6b4e;
    --color-8: #97bbf5;
    --color-9: #01ab63;
    --color-10: #094bad;
    --color-11: #c99000;
    --color-12: #d84f3e;
    --color-13: #49a28f;
    --color-14: #048732;
    --color-15: #d96895;
    --color-16: #8043ce;
    --color-17: #7599d1;
    --color-18: #7a4c31;
    --color-19: #6989f4;
    --color-20: #ffd444;
    --color-21: #ff957c;
    --color-22: #8fe9d3;
    --color-23: #62cc71;
    --color-24: #ffadda;
    --color-25: #c884ff;
    --color-26: #badeff;
    --color-27: #bf8b6d;
    --color-28: #927acc;
    --color-29: #97ee3f;
    --color-30: #bf3947;
    --color-31: #9f5b00;
    --color-32: #f48758;
    --color-33: #8caed6;
    --color-34: #f2b94f;
    --color-35: #eff26e;
    --color-36: #e43872;
    --color-37: #d9b100;
    --color-38: #9d7a00;
    --color-39: #698cff;
    --color-40: #00d27e;
    --color-41: #d06800;
    --color-42: #009f82;
    --color-43: #c49200;
    --color-44: #cbe8ff;
    --color-45: #fecddf;
    --color-46: #c27eb6;
    --color-47: #8cd2ce;
    --color-48: #c4b8d9;
    --color-49: #f883b0;
    --color-50: #a49100;
    --color-51: #f48800;
    --color-52: #27d0df;
    --color-53: #a04a9b;
    --color-54: #4269d0;

    /* history colors */
    --history-unavailable-color: transparent;

    /* input components */
    --input-idle-line-color: rgba(0, 0, 0, 0.42);
    --input-hover-line-color: rgba(0, 0, 0, 0.87);
    --input-disabled-line-color: rgba(0, 0, 0, 0.06);
    --input-outlined-idle-border-color: #b9c0ce;
    --input-outlined-hover-border-color: #646a78;
    --input-outlined-disabled-border-color: #e3e9f2;
    --input-fill-color: #edf1f7;
    --input-disabled-fill-color: #f5f7fb;
    --input-ink-color: rgba(0, 0, 0, 0.87);
    --input-label-ink-color: rgba(0, 0, 0, 0.6);
    --input-disabled-ink-color: rgba(0, 0, 0, 0.37);
    --input-dropdown-icon-color: rgba(0, 0, 0, 0.54);

    /* for label-badge */
    --label-badge-red: var(--error-color);
    --label-badge-blue: var(--info-color);
    --label-badge-green: var(--success-color);
    --label-badge-yellow: var(--warning-color);

    /* state color */
    --state-active-color: var(--amber-color);
    --state-inactive-color: var(--grey-color);
    --state-unavailable-color: var(--state-icon-unavailable-color, var(--disabled-text-color));

    /* state domain colors */
    --state-alarm_control_panel-armed_away-color: var(--green-color);
    --state-alarm_control_panel-armed_custom_bypass-color: var(--green-color);
    --state-alarm_control_panel-armed_home-color: var(--green-color);
    --state-alarm_control_panel-armed_night-color: var(--green-color);
    --state-alarm_control_panel-armed_vacation-color: var(--green-color);
    --state-alarm_control_panel-arming-color: var(--orange-color);
    --state-alarm_control_panel-disarming-color: var(--orange-color);
    --state-alarm_control_panel-pending-color: var(--orange-color);
    --state-alarm_control_panel-triggered-color: var(--red-color);
    --state-alert-off-color: var(--orange-color);
    --state-alert-on-color: var(--red-color);
    --state-binary_sensor-active-color: var(--amber-color);
    --state-binary_sensor-battery-on-color: var(--red-color);
    --state-binary_sensor-carbon_monoxide-on-color: var(--red-color);
    --state-binary_sensor-gas-on-color: var(--red-color);
    --state-binary_sensor-glass_break-on-color: var(--red-color);
    --state-binary_sensor-heat-on-color: var(--red-color);
    --state-binary_sensor-lock-on-color: var(--red-color);
    --state-binary_sensor-moisture-on-color: var(--red-color);
    --state-binary_sensor-problem-on-color: var(--red-color);
    --state-binary_sensor-safety-on-color: var(--red-color);
    --state-binary_sensor-smoke-on-color: var(--red-color);
    --state-binary_sensor-sound-on-color: var(--red-color);
    --state-binary_sensor-tamper-on-color: var(--red-color);
    --state-climate-auto-color: var(--green-color);
    --state-climate-cool-color: var(--blue-color);
    --state-climate-dry-color: var(--orange-color);
    --state-climate-fan_only-color: var(--cyan-color);
    --state-climate-heat-color: var(--deep-orange-color);
    --state-climate-heat-cool-color: var(--amber-color);
    --state-cover-active-color: var(--purple-color);
    --state-device_tracker-active-color: var(--blue-color);
    --state-device_tracker-home-color: var(--green-color);
    --state-fan-active-color: var(--cyan-color);
    --state-humidifier-on-color: var(--blue-color);
    --state-lawn_mower-active-color: var(--teal-color);
    --state-lawn_mower-error-color: var(--red-color);
    --state-light-active-color: var(--amber-color);
    --state-lock-jammed-color: var(--red-color);
    --state-lock-locked-color: var(--green-color);
    --state-lock-locking-color: var(--orange-color);
    --state-lock-unlocked-color: var(--red-color);
    --state-lock-unlocking-color: var(--orange-color);
    --state-lock-open-color: var(--red-color);
    --state-lock-opening-color: var(--orange-color);
    --state-media_player-active-color: var(--light-blue-color);
    --state-person-active-color: var(--blue-color);
    --state-person-home-color: var(--green-color);
    --state-plant-active-color: var(--red-color);
    --state-siren-active-color: var(--red-color);
    --state-sun-above_horizon-color: var(--amber-color);
    --state-sun-below_horizon-color: var(--indigo-color);
    --state-switch-active-color: var(--amber-color);
    --state-update-active-color: var(--orange-color);
    --state-vacuum-active-color: var(--teal-color);
    --state-vacuum-error-color: var(--red-color);
    --state-valve-active-color: var(--blue-color);
    --state-sensor-battery-high-color: var(--green-color);
    --state-sensor-battery-low-color: var(--red-color);
    --state-sensor-battery-medium-color: var(--orange-color);
    --state-water_heater-eco-color: var(--green-color);
    --state-water_heater-electric-color: var(--orange-color);
    --state-water_heater-gas-color: var(--orange-color);
    --state-water_heater-heat_pump-color: var(--orange-color);
    --state-water_heater-high_demand-color: var(--deep-orange-color);
    --state-water_heater-performance-color: var(--deep-orange-color);
    --state-weather-clear_night-color: var(--deep-purple-color);
    --state-weather-cloudy-color: var(--light-grey-color);
    --state-weather-exceptional-color: var(--red-color);
    --state-weather-fog-color: var(--grey-color);
    --state-weather-hail-color: var(--cyan-color);
    --state-weather-lightning_rainy-color: var(--lime-color);
    --state-weather-lightning-color: var(--yellow-color);
    --state-weather-partlycloudy-color: var(--blue-grey-color);
    --state-weather-pouring-color: var(--indigo-color);
    --state-weather-rainy-color: var(--blue-color);
    --state-weather-snowy_rainy-color: var(--light-blue-color);
    --state-weather-snowy-color: #c0e0ff;
    --state-weather-sunny-color: var(--amber-color);
    --state-weather-windy_variant-color: var(--green-color);
    --state-weather-windy-color: var(--green-color);

    /* history colors */
    --history-unknown-color: var(--dark-grey-color);

    --state-icon-error-color: var(--error-state-color, var(--error-color));
    --sidebar-text-color: var(--primary-text-color);
    --sidebar-background-color: var(--ha-color-window);
    --sidebar-selected-text-color: var(--primary-color);
    --sidebar-selected-icon-color: var(--primary-color);
    --sidebar-icon-color: rgba(var(--rgb-primary-text-color), 0.6);
    --slider-color: var(--primary-color);
    --slider-secondary-color: var(--light-primary-color);
    --slider-track-color: var(--scrollbar-thumb-color);
    --label-badge-background-color: var(--card-background-color);
    --label-badge-text-color: rgba(var(--rgb-primary-text-color), 0.8);
    --table-header-background-color: var(--input-fill-color);
    --table-row-background-color: var(--primary-background-color);
    --table-row-alternative-background-color: var(--secondary-background-color);
    --data-table-background-color: var(--card-background-color);
    --markdown-code-background-color: var(--primary-background-color);
    --bar-box-shadow: 0 2px 12px var(--shadow-color);

    /* https://github.com/material-components/material-web/blob/master/docs/theming.md */
    --mdc-theme-primary: var(--primary-color);
    --mdc-theme-secondary: var(--accent-color);
    --mdc-theme-background: var(--primary-background-color);
    --mdc-theme-surface: var(--card-background-color);
    --mdc-theme-on-primary: var(--text-primary-color);
    --mdc-theme-on-secondary: var(--text-primary-color);
    --mdc-theme-on-surface: var(--primary-text-color);
    --mdc-theme-text-disabled-on-light: var(--disabled-text-color);
    --mdc-theme-text-primary-on-background: var(--primary-text-color);
    --mdc-theme-text-secondary-on-background: var(--secondary-text-color);
    --mdc-theme-text-hint-on-background: var(--secondary-text-color);
    --mdc-theme-text-icon-on-background: var(--secondary-text-color);
    --mdc-theme-error: var(--error-color);
    --app-header-text-color: var(--sidebar-text-color);
    --app-header-background-color: var(--primary-background-color);
    --app-header-border-bottom: none;
    --app-theme-color: var(--app-header-background-color);
    --mdc-checkbox-unchecked-color: rgba(var(--rgb-primary-text-color), 0.54);
    --mdc-checkbox-disabled-color: var(--disabled-text-color);
    --mdc-radio-unchecked-color: rgba(var(--rgb-primary-text-color), 0.54);
    --mdc-radio-disabled-color: var(--disabled-text-color);
    --mdc-tab-text-label-color-default: var(--primary-text-color);
    --mdc-button-disabled-ink-color: var(--disabled-text-color);
    --mdc-button-outline-color: var(--outline-color);
    --mdc-dialog-scroll-divider-color: var(--divider-color);
    --mdc-dialog-heading-ink-color: var(--primary-text-color);
    --mdc-dialog-content-ink-color: var(--primary-text-color);
    --mdc-text-field-idle-line-color: var(--input-idle-line-color);
    --mdc-text-field-hover-line-color: var(--input-hover-line-color);
    --mdc-text-field-disabled-line-color: var(--input-disabled-line-color);
    --mdc-text-field-outlined-idle-border-color: var(--input-outlined-idle-border-color);
    --mdc-text-field-outlined-hover-border-color: var(--input-outlined-hover-border-color);
    --mdc-text-field-outlined-disabled-border-color: var(--input-outlined-disabled-border-color);
    --mdc-text-field-fill-color: var(--input-fill-color);
    --mdc-text-field-disabled-fill-color: var(--input-disabled-fill-color);
    --mdc-text-field-ink-color: var(--input-ink-color);
    --mdc-text-field-label-ink-color: var(--input-label-ink-color);
    --mdc-text-field-disabled-ink-color: var(--input-disabled-ink-color);

    --mdc-select-idle-line-color: var(--input-idle-line-color);
    --mdc-select-hover-line-color: var(--input-hover-line-color);
    --mdc-select-outlined-idle-border-color: var(--input-outlined-idle-border-color);
    --mdc-select-outlined-hover-border-color: var(--input-outlined-hover-border-color);
    --mdc-select-outlined-disabled-border-color: var(--input-outlined-disabled-border-color);
    --mdc-select-fill-color: var(--input-fill-color);
    --mdc-select-disabled-fill-color: var(--input-disabled-fill-color);
    --mdc-select-ink-color: var(--input-ink-color);
    --mdc-select-label-ink-color: var(--input-label-ink-color);
    --mdc-select-disabled-ink-color: var(--input-disabled-ink-color);
    --mdc-select-dropdown-icon-color: var(--input-dropdown-icon-color);
    --mdc-select-disabled-dropdown-icon-color: var(--input-disabled-ink-color);
    --ha-assist-chip-filled-container-color: rgba(var(--rgb-primary-text-color), 0.15);
    --ha-assist-chip-active-container-color: rgba(var(--rgb-primary-color), 0.15);
    --chip-background-color: rgba(var(--rgb-primary-text-color), 0.15);
  }
`;

export const darkColorStyles = css`
  html {
    --ha-color-window: #0b0d11;
    --primary-background-color: #1a1e25;
    --card-background-color: #14171d;
    --secondary-background-color: #20252d;
    --clear-background-color: #1a1e25;
    --primary-text-color: #e8eaf0;
    --secondary-text-color: #bcc2cf;
    --disabled-text-color: #7b8190;
    --divider-color: #29303a;
    --outline-color: #323844;
    --outline-hover-color: #4a505c;
    --shadow-color: rgba(0, 0, 0, 0.48);

    --primary-color: #a9c1ff;
    --text-primary-color: #06235f;
    --dark-primary-color: #8aa8f7;
    --darker-primary-color: #628af0;
    --light-primary-color: #1d3d8f;
    --rgb-primary-color: 169, 193, 255;
    --rgb-primary-text-color: 232, 234, 240;
    --rgb-secondary-text-color: 188, 194, 207;
    --rgb-text-primary-color: 6, 35, 95;
    --rgb-card-background-color: 20, 23, 29;
    --error-color: #e8604f;
    --rgb-error-color: 232, 96, 79;
    --success-color: #3fa768;
    --rgb-success-color: 63, 167, 104;

    --ha-color-surface-tone-1: #1a1e25;
    --ha-color-surface-tone-2: #20252d;
    --ha-color-surface-tone-3: #29303a;
    --ha-color-outline: #323844;

    --ha-color-primary-container: #1d3d8f;
    --ha-color-on-primary-container: #dce4ff;
    --ha-color-tertiary: #d2b6ff;
    --ha-color-on-tertiary: #3a1a73;
    --ha-color-tertiary-container: #432a78;
    --ha-color-on-tertiary-container: #efe3ff;
    --ha-color-warning-container: #4a3200;
    --ha-color-on-warning-container: #ffe9c7;
    --ha-color-error-container: #5c160c;
    --ha-color-on-error-container: #ffb4a8;
    --ha-color-success-container: #0f3d22;
    --ha-color-on-success-container: #d4f4df;

    --ha-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35);
    --ha-shadow-overlay: 0 24px 48px rgba(0, 0, 0, 0.55);

    /* Dark on dark needs an edge: cards get a subtle outline. */
    --ha-card-border-width: 1px;
    --ha-card-border-color: #3d4554;

    /* Off switches: a visible track outline and thumb (3:1 or more against
       the surface). */
    --ha-switch-border-color: #8a91a1;
    --ha-switch-thumb-background-color: #bcc2cf;
    --ha-switch-thumb-border-color: #bcc2cf;

    --scrollbar-thumb-color: rgb(80, 86, 98);

    --mdc-ripple-color: #aaaaaa;
    --mdc-linear-progress-buffer-color: rgba(255, 255, 255, 0.1);

    --input-idle-line-color: rgba(255, 255, 255, 0.42);
    --input-hover-line-color: rgba(255, 255, 255, 0.87);
    --input-disabled-line-color: rgba(255, 255, 255, 0.06);
    --input-outlined-idle-border-color: rgba(255, 255, 255, 0.38);
    --input-outlined-hover-border-color: rgba(255, 255, 255, 0.87);
    --input-outlined-disabled-border-color: rgba(255, 255, 255, 0.06);
    --input-fill-color: #20252d;
    --input-disabled-fill-color: #1a1e25;
    --input-ink-color: rgba(255, 255, 255, 0.87);
    --input-label-ink-color: rgba(255, 255, 255, 0.6);
    --input-disabled-ink-color: rgba(255, 255, 255, 0.37);
    --input-dropdown-icon-color: rgba(255, 255, 255, 0.54);

    --codemirror-keyword: #c792ea;
    --codemirror-operator: #89ddff;
    --codemirror-variable: #f07178;
    --codemirror-variable-2: #eeffff;
    --codemirror-variable-3: #decb6b;
    --codemirror-builtin: #ffcb6b;
    --codemirror-atom: #f78c6c;
    --codemirror-number: #ff5370;
    --codemirror-def: #82aaff;
    --codemirror-string: #c3e88d;
    --codemirror-string-2: #f07178;
    --codemirror-comment: #545454;
    --codemirror-tag: #ff5370;
    --codemirror-meta: #ffcb6b;
    --codemirror-attribute: #c792ea;
    --codemirror-property: #c792ea;
    --codemirror-qualifier: #decb6b;
    --codemirror-type: #decb6b;
    --energy-grid-return-color: #a280db;
    --map-filter: invert(0.9) hue-rotate(170deg) brightness(1.5) contrast(1.2) saturate(0.3);
    --disabled-color: #464646;

    --ha-button-primary-light-color: #4082a040;
    --ha-button-warning-light-color: #917b54c1;
    --ha-button-neutral-color: #d9dae0;
    --ha-button-neutral-light-color: #6a7081;

    --bar-box-shadow: 0 2px 12px var(--shadow-color);
  }
`;

export const DefaultPrimaryColor = extractVar(colorStyles, "primary-color", coreColorVariables);
export const DefaultAccentColor = extractVar(colorStyles, "accent-color");
