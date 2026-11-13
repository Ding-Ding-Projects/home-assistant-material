/**
 * Listens for an NFC tag, two ways at once:
 *
 * - this browser's own reader (Web NFC), on a phone that has one and a page
 *   served over HTTPS, which gives the tag's serial number;
 * - a scan with the Home Assistant app on any phone, which Home Assistant
 *   reports as a `tag_scanned` event with the tag's id.
 *
 * Whichever comes first is passed on as the tag's identity. Nothing about the
 * tag is stored here; the lock keeps only a salted hash of the identity.
 */
import type { Connection } from "home-assistant-js-websocket";
import type { TagScannedEvent } from "../../data/tag";
import { EVENT_TAG_SCANNED } from "../../data/tag";
import { nfcTagIdentity } from "./lock-credentials";

interface NdefReadingEvent extends Event {
  serialNumber?: string;
}

interface NdefReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}

type NdefReaderConstructor = new () => NdefReader;

export type NfcStatus =
  /** Listening on this device's reader and for scans with the app. */
  | "both"
  /** Only scans with the Home Assistant app can be heard. */
  | "app"
  /** Nothing can be heard: no reader here and no connection. */
  | "none";

/** True when this browser has its own NFC reader to offer. */
export const webNfcAvailable = (): boolean =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "NDEFReader" in window;

const homeConnection = (): Connection | undefined =>
  (
    document.querySelector("home-assistant") as
      (HTMLElement & { hass?: { connection?: Connection } }) | null
  )?.hass?.connection;

export interface NfcListener {
  status: NfcStatus;
  stop: () => void;
}

/**
 * Starts listening. Calls `onTag` with the identity of every tag heard and
 * `onError` when the device reader is refused or fails (the app route keeps
 * listening). Call `stop` to stop both.
 */
export const listenForNfcTag = (
  onTag: (identity: string) => void,
  onError?: (reason: "denied" | "failed") => void
): NfcListener => {
  const abort = new AbortController();
  let unsubscribe: (() => void) | undefined;
  let stopped = false;
  let device = false;

  if (webNfcAvailable()) {
    device = true;
    try {
      const readerClass = (
        window as unknown as { NDEFReader: NdefReaderConstructor }
      ).NDEFReader;
      const reader = new readerClass();
      reader.addEventListener(
        "reading",
        (ev) => {
          const serial = (ev as NdefReadingEvent).serialNumber;
          if (serial && !stopped) {
            onTag(nfcTagIdentity("serial", serial));
          }
        },
        { signal: abort.signal }
      );
      reader.scan({ signal: abort.signal }).catch((err: unknown) => {
        if (stopped) {
          return;
        }
        onError?.(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "denied"
            : "failed"
        );
      });
    } catch (_err) {
      device = false;
      onError?.("failed");
    }
  }

  const connection = homeConnection();
  if (connection) {
    connection
      .subscribeEvents<TagScannedEvent>((event) => {
        const id = event.data?.tag_id;
        if (typeof id === "string" && id && !stopped) {
          onTag(nfcTagIdentity("tag", id));
        }
      }, EVENT_TAG_SCANNED)
      .then((unsub) => {
        if (stopped) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch(() => {
        // No permission to listen: only this device's reader is left.
      });
  }

  return {
    status: device ? "both" : connection ? "app" : "none",
    stop: () => {
      stopped = true;
      abort.abort();
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
};
