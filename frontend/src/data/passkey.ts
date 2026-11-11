import type { HomeAssistant } from "../types";

export interface Passkey {
  id: string;
  user_id: string;
  name: string;
  created: string;
  last_used: string | null;
}

export interface PasskeyCreationOptionsJSON {
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: {
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

export interface PasskeyRequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: {
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }[];
  userVerification?: UserVerificationRequirement;
}

export interface PasskeyRegistrationCredentialJSON {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment: string | null;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports: string[];
  };
}

export interface PasskeyAssertionCredentialJSON {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment: string | null;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
}

export type PasskeyErrorKind = "cancelled" | "failed" | "sign_in_required";

/** Websocket error code when the session is too old to add a passkey. */
export const PASSKEY_SIGN_IN_REQUIRED_CODE = "recent_sign_in_required";

export class PasskeyError extends Error {
  public kind: PasskeyErrorKind;

  constructor(kind: PasskeyErrorKind) {
    super(kind);
    this.name = "PasskeyError";
    this.kind = kind;
  }
}

export const base64urlToBuffer = (value: string): ArrayBuffer => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const bufferToBase64url = (buffer: ArrayBuffer): string => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const creationOptionsFromJSON = (
  options: PasskeyCreationOptionsJSON
): PublicKeyCredentialCreationOptions => ({
  rp: options.rp,
  user: {
    id: base64urlToBuffer(options.user.id),
    name: options.user.name,
    displayName: options.user.displayName,
  },
  challenge: base64urlToBuffer(options.challenge),
  pubKeyCredParams: options.pubKeyCredParams,
  timeout: options.timeout,
  excludeCredentials: options.excludeCredentials?.map((item) => ({
    ...item,
    id: base64urlToBuffer(item.id),
  })),
  authenticatorSelection: options.authenticatorSelection,
  attestation: options.attestation,
});

export const requestOptionsFromJSON = (
  options: PasskeyRequestOptionsJSON
): PublicKeyCredentialRequestOptions => ({
  challenge: base64urlToBuffer(options.challenge),
  timeout: options.timeout,
  rpId: options.rpId,
  allowCredentials: options.allowCredentials?.map((item) => ({
    ...item,
    id: base64urlToBuffer(item.id),
  })),
  userVerification: options.userVerification,
});

export const registrationCredentialToJSON = (
  credential: PublicKeyCredential
): PasskeyRegistrationCredentialJSON => {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
};

export const assertionCredentialToJSON = (
  credential: PublicKeyCredential
): PasskeyAssertionCredentialJSON => {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
  };
};

/** A passkey cannot be bound to an IP address, only to a domain name. */
export const isIpAddressHost = (hostname: string): boolean =>
  hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

/**
 * Passkeys need a secure context (https or localhost), browser support and
 * a domain name in the address.
 */
export const isPasskeySupported = (
  env: {
    isSecureContext?: boolean;
    PublicKeyCredential?: unknown;
    location?: { hostname: string };
  } = window
): boolean =>
  Boolean(env.isSecureContext) &&
  typeof env.PublicKeyCredential === "function" &&
  !isIpAddressHost(env.location?.hostname ?? "");

/** Ask the server whether a passkey sign-in can be started from this address. */
export const fetchPasskeyAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch("/auth/passkey/status", {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return false;
    }
    const body: { available?: boolean } = await response.json();
    return body.available === true;
  } catch (_err) {
    return false;
  }
};

/** A dismissed or timed-out browser prompt is a cancel, anything else a failure. */
export const toPasskeyError = (err: unknown): PasskeyError => {
  if (err instanceof PasskeyError) {
    return err;
  }
  if (
    (err as { code?: string } | undefined)?.code ===
    PASSKEY_SIGN_IN_REQUIRED_CODE
  ) {
    return new PasskeyError("sign_in_required");
  }
  const name = (err as { name?: string } | undefined)?.name;
  return new PasskeyError(
    name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed"
  );
};

const isPublicKeyCredential = (
  credential: Credential | null
): credential is PublicKeyCredential =>
  credential !== null && credential.type === "public-key";

export const fetchPasskeys = (hass: HomeAssistant, userId?: string) =>
  hass.callWS<Passkey[]>({ type: "passkey/list", user_id: userId });

export const renamePasskey = (
  hass: HomeAssistant,
  credentialId: string,
  name: string,
  userId?: string
) =>
  hass.callWS<Passkey>({
    type: "passkey/rename",
    credential_id: credentialId,
    name,
    user_id: userId,
  });

export const deletePasskey = (
  hass: HomeAssistant,
  credentialId: string,
  userId?: string
) =>
  hass.callWS<undefined>({
    type: "passkey/delete",
    credential_id: credentialId,
    user_id: userId,
  });

export const deleteAllPasskeys = (hass: HomeAssistant, userId?: string) =>
  hass.callWS<{ removed: number }>({
    type: "passkey/delete_all",
    user_id: userId,
  });

export const registerPasskey = async (
  hass: HomeAssistant,
  name: string
): Promise<Passkey> => {
  let begin: {
    challenge_id: string;
    options: PasskeyCreationOptionsJSON;
  };
  try {
    begin = await hass.callWS({ type: "passkey/register_begin" });
  } catch (err) {
    throw toPasskeyError(err);
  }

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: creationOptionsFromJSON(begin.options),
    });
  } catch (err) {
    throw toPasskeyError(err);
  }
  if (!isPublicKeyCredential(credential)) {
    throw new PasskeyError("failed");
  }

  try {
    return await hass.callWS<Passkey>({
      type: "passkey/register_finish",
      challenge_id: begin.challenge_id,
      credential: registrationCredentialToJSON(credential),
      name,
    });
  } catch (err) {
    throw toPasskeyError(err);
  }
};

export interface PasskeySignInParams {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

/** Runs the whole sign-in and returns the authorization code. */
export const signInWithPasskey = async (
  params: PasskeySignInParams
): Promise<string> => {
  const beginResponse = await fetch("/auth/passkey/begin", {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    }),
  });
  if (!beginResponse.ok) {
    throw new PasskeyError("failed");
  }
  const begin: {
    challenge_id: string;
    options: PasskeyRequestOptionsJSON;
  } = await beginResponse.json();

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: requestOptionsFromJSON(begin.options),
    });
  } catch (err) {
    throw toPasskeyError(err);
  }
  if (!isPublicKeyCredential(credential)) {
    throw new PasskeyError("failed");
  }

  const finishResponse = await fetch("/auth/passkey/finish", {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify({
      challenge_id: begin.challenge_id,
      credential: assertionCredentialToJSON(credential),
    }),
  });
  if (!finishResponse.ok) {
    throw new PasskeyError("failed");
  }
  const result: { result: string } = await finishResponse.json();
  return result.result;
};
