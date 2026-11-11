import "../auth/ha-authorize";
import { installHelpLinkDoor } from "../components/help/open-help-article";

// The sign-in page has no dialog manager: the reader opens on the page itself.
installHelpLinkDoor({ standalone: true });

import("../resources/append-ha-style");
