import type { HomeAssistant } from "../types";

export interface UploadProgressOptions {
  signal?: AbortSignal;
  /** Called with the fraction of the request body sent, 0 to 1. */
  onProgress?: (fraction: number) => void;
}

export interface UploadResponse {
  status: number;
  body: string;
}

/**
 * Posts a form with the signed-in token and reports how much was sent.
 * `fetch` cannot report upload progress, and a file of gigabytes needs it.
 * An abort rejects with an `AbortError`, like `fetch` does.
 */
export const postFormWithProgress = async (
  hass: Pick<HomeAssistant, "auth">,
  path: string,
  form: FormData,
  { signal, onProgress }: UploadProgressOptions = {}
): Promise<UploadResponse> => {
  const { auth } = hass;
  if (auth.expired) {
    await auth.refreshAccessToken();
  }
  return new Promise<UploadResponse>((resolve, reject) => {
    const abortError = () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      return error;
    };
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const request = new XMLHttpRequest();
    const onAbort = () => request.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => signal?.removeEventListener("abort", onAbort);

    request.open("POST", `${auth.data.hassUrl}${path}`);
    request.withCredentials = false;
    request.setRequestHeader("Authorization", `Bearer ${auth.accessToken}`);
    request.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onProgress?.(Math.min(1, ev.loaded / ev.total));
      }
    };
    request.onload = () => {
      done();
      resolve({ status: request.status, body: request.responseText });
    };
    request.onerror = () => {
      done();
      reject(new Error("Network error"));
    };
    request.onabort = () => {
      done();
      reject(abortError());
    };
    request.send(form);
  });
};
