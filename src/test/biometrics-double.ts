import { p256 } from "@noble/curves/nist.js";
import type {
  CreateKeysOptions,
  SignatureOptions,
} from "@sbaiahmed1/react-native-biometrics";

import { base64Of, P256_SPKI_PREFIX } from "./bank-client";

const phoneKeys = new Map<
  string,
  { secretKey: Uint8Array; options: CreateKeysOptions }
>();
const biometricPrompts: SignatureOptions[] = [];
let nextPromptRecognised = true;

// Signs for real with a test key, so the bank's own verification runs against the app's signed text.
export const biometricsLibraryDouble = {
  BiometricStrength: { Strong: "strong", Weak: "weak" },
  InputEncoding: { UTF8: "utf8", Base64: "base64" },
  createKeysWithOptions: (options: CreateKeysOptions = {}) => {
    const secretKey = p256.utils.randomSecretKey();
    phoneKeys.set(options.keyAlias ?? "default", { secretKey, options });
    return Promise.resolve({
      publicKey: base64Of([
        ...P256_SPKI_PREFIX,
        ...p256.getPublicKey(secretKey, false),
      ]),
    });
  },
  signWithOptions: (options: SignatureOptions) => {
    biometricPrompts.push(options);
    const key = phoneKeys.get(options.keyAlias ?? "default");
    if (!nextPromptRecognised || key === undefined)
      return Promise.resolve({ success: false, errorCode: "USER_CANCEL" });
    const signature = p256.sign(
      new TextEncoder().encode(options.data),
      key.secretKey,
      { format: "der" },
    );
    return Promise.resolve({ success: true, signature: base64Of(signature) });
  },
  deleteKeys: (keyAlias = "default") => {
    phoneKeys.delete(keyAlias);
    return Promise.resolve({ success: true });
  },
};

export function cancelNextBiometricPrompt() {
  nextPromptRecognised = false;
}

export function phoneKeyOptions() {
  return [...phoneKeys.values()].map(({ options }) => options);
}

export function biometricPromptsShown() {
  return [...biometricPrompts];
}

export function resetBiometricsDouble() {
  phoneKeys.clear();
  biometricPrompts.splice(0);
  nextPromptRecognised = true;
}
