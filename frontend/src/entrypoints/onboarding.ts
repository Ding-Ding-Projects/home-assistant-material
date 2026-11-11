import { installHelpLinkDoor } from "../components/help/open-help-article";
import "../onboarding/ha-onboarding";

installHelpLinkDoor();

import("../resources/append-ha-style");

declare global {
  interface Window {
    stepsPromise: Promise<Response>;
  }
}
