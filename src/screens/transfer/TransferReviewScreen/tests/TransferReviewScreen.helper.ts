import { act, screen, waitFor } from "@testing-library/react-native";

import { getLookupRecipientOptions } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  type BankErrorBody,
  lookUpTestRecipient,
  sendToBank,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { askOpenAppToReadAgain } from "@/test/render/render-route";

export const RECIPIENT_MOBILE = "012-345 6789";

// Home holds Transfer back until its first reads land, so a press made sooner does nothing.
export async function waitForHomeToOfferTransfer() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });
}

export function countSent(method: string, pathEnd: string) {
  return sentRequests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname.endsWith(pathEnd),
  ).length;
}

export function approveRequests() {
  return sentRequests.filter((request) =>
    new URL(request.url).pathname.endsWith("/approve"),
  );
}

export function idempotencyKeysOfCreatesSent() {
  return sentRequests
    .filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname.endsWith("/transfers"),
    )
    .map((request) => request.headers.get("Idempotency-Key"));
}

export async function askBankToCreateRm100() {
  const { recipientRef } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  return sendToBank<BankErrorBody>("POST", "/transfers", {
    body: { recipientRef, amount: { minor: 10_000, currency: "MYR" } },
  });
}

// Sign-in spares an answered name check, so this stands in for any later path that asks it again.
export function askOpenReviewsNameCheckAgain() {
  return act(() => {
    askOpenAppToReadAgain(
      getLookupRecipientOptions({
        idType: RecipientIdType.Mobile,
        idValue: "+60123456789",
      }).queryKey,
    );
  });
}
