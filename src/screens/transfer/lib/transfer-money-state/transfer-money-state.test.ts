import {
  isSettledTransferOutcome,
  outcomeOfTransfer,
  type TransferOutcomeScenario,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { scenarioSections } from "@/screens/transfer/scenarios/transfer.helper";
import { buildHistoryTransfer } from "@/test/fixtures/transfer-responses";

import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
  moneyStateByFundsAndStatus,
} from "./transfer-money-state";

it("gives each outcome its matrix section's money state", () => {
  expect(MONEY_STATE_BY_OUTCOME).toEqual(
    Object.fromEntries(
      Object.keys(MONEY_STATE_BY_OUTCOME).map((outcome) => [
        outcome,
        matrixSections.find((section) => section.id === outcome)?.money,
      ]),
    ),
  );
});

it("treats as settled exactly the outcomes whose money state is confirmed", () => {
  const outcomes = Object.keys(
    MONEY_STATE_BY_OUTCOME,
  ) as TransferOutcomeScenario[];

  expect(outcomes.filter(isSettledTransferOutcome)).toEqual(
    outcomes.filter(
      (outcome) =>
        MONEY_STATE_BY_OUTCOME[outcome] !== MoneyState.NotConfirmedYet,
    ),
  );
});

it("covers every section the matrix shows on the result page", () => {
  const resultPageIds = matrixSections
    .filter((section) => section.shownAs.includes("the result page"))
    .map((section) => section.id);

  expect(resultPageIds).toContain(TransferScenarioId.Completed);
  expect(Object.keys(MONEY_STATE_BY_OUTCOME)).toEqual(
    expect.arrayContaining(resultPageIds),
  );
});

it("reads a refund on its way and an undebited failure for a reason no scenario names unlike the outcome does", () => {
  const refundOnItsWay = buildHistoryTransfer({
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.RefundPending,
  });
  const undebitedForUnnamedReason = buildHistoryTransfer({
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.NotDebited,
    failureReason: TransferFailureReason.RecipientBankRejected,
  });

  expect(moneyStateByFundsAndStatus(refundOnItsWay)).toBeUndefined();
  expect(MONEY_STATE_BY_OUTCOME[outcomeOfTransfer(refundOnItsWay)!]).toBe(
    MoneyState.MoneyReturned,
  );
  expect(moneyStateByFundsAndStatus(undebitedForUnnamedReason)).toBe(
    MoneyState.NoMoneyMoved,
  );
  expect(
    MONEY_STATE_BY_OUTCOME[outcomeOfTransfer(undebitedForUnnamedReason)!],
  ).toBe(MoneyState.NotConfirmedYet);
});

const matrixSections = scenarioSections.map(({ id, labels }) => ({
  id,
  money: labels.find(({ name }) => name === "Money")?.value,
  shownAs: labels.find(({ name }) => name === "Shown as")?.value ?? "",
}));
