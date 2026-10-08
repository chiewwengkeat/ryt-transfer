import { redirectSystemPath } from "@/app/+native-intent";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/state/transfer-flow";
import { asSen } from "@/shared/lib/money/money";

const TEST_RECIPIENT = {
  idType: RecipientIdType.Mobile,
  idValue: "+60123456789",
} as const;

it.each([
  ["ryt://transfer", "/transfer"],
  [
    "ryt-demo://transfer-history/trf_1a2b?utm_source=sms",
    "/transfer-history/trf_1a2b",
  ],
  ["ryt-dev:///transfer-history/", "/transfer-history"],
  ["ryt://", "/"],
  ["ryt://transfer/review", "/"],
  ["ryt://settings#pin", "/"],
])("opens the link %s at %s", (link, expectedPath) => {
  expect(redirectSystemPath({ path: link })).toBe(expectedPath);
});

it("leaves the router's own paths alone", () => {
  expect(redirectSystemPath({ path: "/transfer/review" })).toBe(
    "/transfer/review",
  );
});

it("drops a link that arrives while a transfer draft is open", () => {
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: TEST_RECIPIENT,
  });

  expect(redirectSystemPath({ path: "ryt://transfer-history" })).toBeNull();
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

  expect(redirectSystemPath({ path: "ryt://transfer" })).toBeNull();
});
