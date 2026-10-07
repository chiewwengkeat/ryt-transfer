import { redirectSystemPath } from "@/app/+native-intent";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/state/transfer-flow";

afterEach(() => {
  dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });
});

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
    recipient: { idType: RecipientIdType.Mobile, idValue: "+60123456789" },
  });

  expect(redirectSystemPath({ path: "ryt://transfer-history" })).toBeNull();
});
