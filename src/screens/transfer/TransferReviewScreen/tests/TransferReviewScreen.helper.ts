import { getLookupRecipientOptions } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  type BankErrorBody,
  lookUpTestRecipient,
  mswServer,
  sendToBank,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { walkToTransferReview } from "@/test/render/drive-app";
import { askOpenAppToReadAgain } from "@/test/render/render-route";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http } from "msw";

export const RECIPIENT_MOBILE = "012-345 6789";

// Home holds Transfer back until its first reads land, so a press made sooner does nothing.
export async function waitForHomeToOfferTransfer() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });
}

export async function walkFromHomeToTransferReview() {
  await waitForHomeToOfferTransfer();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await walkToTransferReview();
}

export async function walkToTransferReviewUntilTransferShows() {
  await walkToTransferReview();
  await screen.findByRole("button", { name: "Transfer" });
}

export async function walkToTransferReviewAndPressTransfer() {
  await walkToTransferReviewUntilTransferShows();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
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

// A resolver that answers nothing hands the request on to the bank, once released.
export function holdTheNextPost(path: string) {
  let sent = false;
  let release = () => undefined as void;
  const held = new Promise<void>((releaseHeld) => {
    release = releaseHeld;
  });
  mswServer.use(
    http.post(
      path,
      async () => {
        sent = true;
        await held;
      },
      { once: true },
    ),
  );
  return {
    release,
    waitUntilSent: () =>
      waitFor(() => {
        expect(sent).toBe(true);
      }),
  };
}
