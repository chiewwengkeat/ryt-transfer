import type * as ExpoLinking from "expo-linking";

import { redirectSystemPath } from "@/app/+native-intent";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/state/transfer-flow";
import { asSen } from "@/shared/lib/money/money";

// The demo build's scheme, which Jest has no app config to supply. Spied, not mocked: expo-router's test
// setup mocks this module first, and the first mock wins.
beforeEach(() => {
  jest
    .spyOn(
      jest.requireMock<typeof ExpoLinking>("expo-linking"),
      "collectManifestSchemes",
    )
    .mockReturnValue(["ryt-demo"]);
});

const TEST_RECIPIENT = {
  idType: RecipientIdType.Mobile,
  idValue: "+60123456789",
} as const;

it.each([
  ["ryt-demo://transfer", "/transfer"],
  [
    "ryt-demo://transfer-history/trf_1a2b?utm_source=sms",
    "/transfer-history/trf_1a2b",
  ],
  ["ryt-demo:///transfer-history/", "/transfer-history"],
  ["RYT-DEMO://transfer", "/transfer"],
  ["ryt-demo://", "/"],
  ["ryt-demo://transfer/review", "/"],
  ["ryt-demo://settings#pin", "/"],
])("opens the link %s at %s", (link, expectedPath) => {
  expect(redirectSystemPath({ path: link })).toBe(expectedPath);
});

it.each([
  "io.github.chiewwengkeat.ryttransfer.demo://transfer/result/trf_1",
  "io.github.chiewwengkeat.ryttransfer://transfer",
  "ryt://transfer",
  "exp+ryt-transfer://transfer-history",
  "https://example.com/transfer",
  "transfer/review",
])("drops %s, which is not in the app's own scheme", (link) => {
  expect(redirectSystemPath({ path: link })).toBeNull();
});

it("leaves the router's own paths alone", () => {
  expect(redirectSystemPath({ path: "/transfer/review" })).toBe(
    "/transfer/review",
  );
});

it.each([
  "ryt-demo://transfer-history",
  "RYT-DEMO://transfer/review?amount=1",
  "io.github.chiewwengkeat.ryttransfer.demo://transfer/amount",
])("drops %s while a transfer draft is open", (link) => {
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: TEST_RECIPIENT,
  });

  expect(redirectSystemPath({ path: link })).toBeNull();
});

it("still drops links after the transfer's screens close on an approval whose answer never came", () => {
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: TEST_RECIPIENT,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.AmountEntered,
    amount: { minor: asSen(10_000), currency: "MYR" },
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.Confirmed,
    lookup: {
      recipient: {
        registeredName: "NG CHEE KEONG",
        idType: RecipientIdType.Mobile,
        idValueMasked: "•••• 6789",
        bankName: "Maybank",
        bankCode: "MBBEMYKL",
      },
      recipientRef: "rref_test",
      refExpiresInSeconds: 600,
      firstTransfer: false,
    },
    idempotencyKey: "create-key",
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.Created,
    transferId: "trf_test",
    challenge: "challenge",
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalSent,
    attemptKey: "approve-key",
  });

  dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });

  expect(redirectSystemPath({ path: "ryt-demo://transfer" })).toBeNull();
});
