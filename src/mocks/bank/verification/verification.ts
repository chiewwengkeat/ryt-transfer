import { p256 } from "@noble/curves/nist.js";

export function isP256PublicKey(spkiBase64: string) {
  try {
    p256.Point.fromBytes(p256PointFromSpki(spkiBase64));
    return true;
  } catch {
    return false;
  }
}

export function verifyApprovalSignature(approval: {
  signedText: string;
  signatureBase64: string;
  publicKeySpkiBase64: string;
}) {
  // A malformed key or signature is a failed approval, never a server error.
  try {
    return p256.verify(
      bytesFromBase64(approval.signatureBase64),
      new TextEncoder().encode(approval.signedText),
      p256PointFromSpki(approval.publicKeySpkiBase64),
      // Phone key stores do not normalise s: a high-S signature is still the phone's.
      { format: "der", lowS: false },
    );
  } catch {
    return false;
  }
}

const P256_SPKI_PREFIX = [
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
];

function bytesFromBase64(text: string) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function p256PointFromSpki(spkiBase64: string) {
  const spki = bytesFromBase64(spkiBase64);
  const hasPrefix =
    spki.length === P256_SPKI_PREFIX.length + 65 &&
    P256_SPKI_PREFIX.every((byte, position) => spki[position] === byte);
  if (!hasPrefix) throw new Error("Not a P-256 SubjectPublicKeyInfo");
  return spki.slice(P256_SPKI_PREFIX.length);
}
