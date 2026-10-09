import { p256 } from "@noble/curves/nist.js";

import { base64Of, P256_SPKI_PREFIX } from "@/test/mock-bank/mock-bank";

import { isP256PublicKey, verifyApprovalSignature } from "./verification";

it("accepts a DER signature over the exact signed text", () => {
  expect(
    verifyApprovalSignature({
      signedText: SIGNED_TEXT,
      signatureBase64: base64Of(signature),
      publicKeySpkiBase64,
    }),
  ).toBe(true);
});

it("accepts the high-S twin of a valid signature", () => {
  const { r, s } = p256.Signature.fromBytes(signature, "der");
  const highS = new p256.Signature(r, p256.Point.Fn.ORDER - s).toBytes("der");

  expect(highS).not.toEqual(signature);
  expect(
    verifyApprovalSignature({
      signedText: SIGNED_TEXT,
      signatureBase64: base64Of(highS),
      publicKeySpkiBase64,
    }),
  ).toBe(true);
});

it("rejects a signature once one character of the signed text differs", () => {
  expect(
    verifyApprovalSignature({
      signedText: SIGNED_TEXT.replace("12550", "12551"),
      signatureBase64: base64Of(signature),
      publicKeySpkiBase64,
    }),
  ).toBe(false);
});

it("answers false, without throwing, for a malformed signature or key", () => {
  expect(
    verifyApprovalSignature({
      signedText: SIGNED_TEXT,
      signatureBase64: "not base64!",
      publicKeySpkiBase64,
    }),
  ).toBe(false);
  expect(
    verifyApprovalSignature({
      signedText: SIGNED_TEXT,
      signatureBase64: base64Of(signature),
      publicKeySpkiBase64: base64Of(p256.getPublicKey(SECRET_KEY, false)),
    }),
  ).toBe(false);
});

it("recognises a P-256 public key only in its SubjectPublicKeyInfo wrapping", () => {
  expect(isP256PublicKey(publicKeySpkiBase64)).toBe(true);
  expect(isP256PublicKey(base64Of(p256.getPublicKey(SECRET_KEY, false)))).toBe(
    false,
  );
  expect(
    isP256PublicKey(
      base64Of([...P256_SPKI_PREFIX, 0x04, ...new Uint8Array(64)]),
    ),
  ).toBe(false);
});

const SECRET_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SIGNED_TEXT = '{"format":"transfer-approval/1","amountMinor":12550}';

const utf8Bytes = (text: string) => new TextEncoder().encode(text);

const publicKeySpkiBase64 = base64Of([
  ...P256_SPKI_PREFIX,
  ...p256.getPublicKey(SECRET_KEY, false),
]);
const signature = p256.sign(utf8Bytes(SIGNED_TEXT), SECRET_KEY, {
  format: "der",
});
