import "@webcomponents/scoped-custom-element-registry/scoped-custom-element-registry.min";
import "../resources/scoped-registry-ready";
import { installHelpLinkDoor } from "../components/help/open-help-article";
import "../layouts/home-assistant";

installHelpLinkDoor();

import("../resources/append-ha-style");
