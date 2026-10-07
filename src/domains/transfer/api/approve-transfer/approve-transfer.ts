import type { WireMoney } from "@/shared/lib/money/money.type";

export function buildSignedApprovalText(details: {
  transferId: string;
  challenge: string;
  recipientRef: string;
  registeredName: string;
  idValueMasked: string;
  bankCode: string;
  amount: WireMoney;
  note?: string | null;
}) {
  // The key order is the signed format: change it only together with the format tag.
  return JSON.stringify({
    format: "transfer-approval/1",
    transferId: details.transferId,
    challenge: details.challenge,
    recipientRef: details.recipientRef,
    registeredName: details.registeredName,
    idValueMasked: details.idValueMasked,
    bankCode: details.bankCode,
    amountMinor: details.amount.minor,
    currency: details.amount.currency,
    note: details.note || null, // an empty note signs as no note
  });
}
