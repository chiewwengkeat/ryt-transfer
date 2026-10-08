import { p256 } from "@noble/curves/nist.js";
import type {
  CreateKeysOptions,
  SignatureOptions,
  SignOptions,
} from "@sbaiahmed1/react-native-biometrics";

import { base64Of, P256_SPKI_PREFIX } from "./bank-client";

const phoneKeys = new Map<
  string,
  { secretKey: Uint8Array; options: CreateKeysOptions }
>();
const keysKilledByEnrolmentChange = new Set<string>();
const biometricPrompts: SignatureOptions[] = [];
let nextPromptRecognised = true;
let nextPromptFailure: string | null = null;
let sensorUnavailableCode: string | null = null;

function signForReal(data: string, secretKey: Uint8Array) {
  const signature = p256.sign(new TextEncoder().encode(data), secretKey, {
    format: "der",
  });
  return Promise.resolve({ success: true, signature: base64Of(signature) });
}

// Signs for real with a test key, so the bank's own verification runs against the app's signed text.
export const biometricsLibraryDouble = {
  BiometricStrength: { Strong: "strong", Weak: "weak" },
  InputEncoding: { UTF8: "utf8", Base64: "base64" },
  createKeysWithOptions: (options: CreateKeysOptions = {}) => {
    const keyAlias = options.keyAlias ?? "default";
    const secretKey = p256.utils.randomSecretKey();
    phoneKeys.set(keyAlias, { secretKey, options });
    keysKilledByEnrolmentChange.delete(keyAlias);
    return Promise.resolve({
      publicKey: base64Of([
        ...P256_SPKI_PREFIX,
        ...p256.getPublicKey(secretKey, false),
      ]),
    });
  },
  isSensorAvailable: () =>
    Promise.resolve(
      sensorUnavailableCode === null
        ? { available: true, biometryType: "FaceID", isDeviceSecure: true }
        : {
            available: false,
            biometryType: "None",
            errorCode: sensorUnavailableCode,
            isDeviceSecure: true,
          },
    ),
  signWithOptions: (options: SignatureOptions) => {
    const keyAlias = options.keyAlias ?? "default";
    if (keysKilledByEnrolmentChange.has(keyAlias))
      return Promise.resolve({
        success: false,
        errorCode: "BIOMETRY_CURRENT_SET_CHANGED",
      });
    biometricPrompts.push(options);
    const key = phoneKeys.get(keyAlias);
    if (!nextPromptRecognised || key === undefined)
      return Promise.resolve({ success: false, errorCode: "USER_CANCEL" });
    if (nextPromptFailure !== null) {
      const errorCode = nextPromptFailure;
      nextPromptFailure = null;
      return Promise.resolve({ success: false, errorCode });
    }
    return signForReal(options.data, key.secretKey);
  },
  // No prompt, so the library refuses it a key that demands one, as on a phone.
  sign: (options: SignOptions) => {
    const key = phoneKeys.get(options.keyAlias ?? "default");
    if (key === undefined)
      return Promise.resolve({ success: false, errorCode: "KEY_NOT_FOUND" });
    if (key.options.requireAuthentication !== false)
      return Promise.resolve({
        success: false,
        errorCode: "KEY_REQUIRES_AUTHENTICATION",
      });
    return signForReal(options.data, key.secretKey);
  },
  deleteKeys: (keyAlias = "default") => {
    phoneKeys.delete(keyAlias);
    keysKilledByEnrolmentChange.delete(keyAlias);
    return Promise.resolve({ success: true });
  },
};

export function cancelNextBiometricPrompt() {
  nextPromptRecognised = false;
}

// One prompt only: the one after it signs again.
export function failNextBiometricPrompt(errorCode: string) {
  nextPromptFailure = errorCode;
}

export function reportBiometricSensorUnavailable(errorCode: string) {
  sensorUnavailableCode = errorCode;
}

// As iOS reports a key bound to the enrolled set once a face or finger is added: refused before any prompt.
export function changeEnrolledBiometrics() {
  for (const [keyAlias, { options }] of phoneKeys)
    if (options.requireAuthentication !== false)
      keysKilledByEnrolmentChange.add(keyAlias);
}

export function phoneKeyOptions() {
  return [...phoneKeys.values()].map(({ options }) => options);
}

export function biometricPromptsShown() {
  return [...biometricPrompts];
}

export function resetBiometricsDouble() {
  phoneKeys.clear();
  keysKilledByEnrolmentChange.clear();
  biometricPrompts.splice(0);
  nextPromptRecognised = true;
  nextPromptFailure = null;
  sensorUnavailableCode = null;
}
