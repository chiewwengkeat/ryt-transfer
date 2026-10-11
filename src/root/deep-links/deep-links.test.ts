import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/flow-store/flow-store";
import { asSen } from "@/shared/lib/money/money";
import type * as ExpoLinking from "expo-linking";
import { redirectSystemPath } from "./deep-links";

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

it.each([
  ["ryt-demo://transfer", "/transfer"],
  [
    "ryt-demo://transfer-history/trf_1a2b?utm_source=sms",
    "/transfer-history/trf_1a2b",
  ],
  ["ryt-demo:///transfer-history/", "/transfer-history"],
  ["RYT-DEMO://transfer", "/transfer"],
  ["ryt-demo://", "/"],
  ["ryt-demo:///", "/"],
  ["ryt-demo://transfer/review", "/"],
  ["ryt-demo://settings#pin", "/"],
  ["/", "/"],
  ["/transfer", "/transfer"],
  ["/transfer-history/trf_1a2b?amount=99999", "/transfer-history/trf_1a2b"],
  ["/transfer/review", "/"],
  ["/transfer/result/trf_1", "/"],
  ["/_sitemap", "/"],
])("opens the link %s at %s", (link, expectedPath) => {
  expect(redirectSystemPath({ path: link, initial: false })).toBe(expectedPath);
});

it.each([
  "io.github.chiewwengkeat.ryttransfer.demo://transfer/result/trf_1",
  "io.github.chiewwengkeat.ryttransfer://transfer",
  "ryt://transfer",
  "exp+ryt-transfer://transfer-history",
  "https://example.com/transfer",
  "transfer/review",
])(
  "drops %s, which is not in the app's own scheme, and opens Home for it at cold start",
  (link) => {
    expect(redirectSystemPath({ path: link, initial: false })).toBeNull();
    expect(redirectSystemPath({ path: link, initial: true })).toBe("/");
  },
);

it.each([
  "ryt-demo://transfer-history",
  "RYT-DEMO://transfer/review?amount=1",
  "io.github.chiewwengkeat.ryttransfer.demo://transfer/amount",
  "/",
  "/transfer/review",
])("drops %s while a transfer draft is open", (link) => {
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: TEST_RECIPIENT,
  });

  expect(redirectSystemPath({ path: link, initial: false })).toBeNull();
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
    expiresInSeconds: 60,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalSent,
    attemptKey: "approve-key",
  });

  dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });

  expect(
    redirectSystemPath({ path: "ryt-demo://transfer", initial: false }),
  ).toBeNull();
});

const TEST_RECIPIENT = {
  idType: RecipientIdType.Mobile,
  idValue: "+60123456789",
} as const;
