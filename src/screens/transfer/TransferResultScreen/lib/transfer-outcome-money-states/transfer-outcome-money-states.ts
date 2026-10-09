import { type TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";

export enum MoneyState {
  NoMoneyMoved = "no money moved",
  MoneyMoved = "money moved",
  NotConfirmedYet = "not confirmed yet",
  MoneyReturned = "money returned",
}

export const MONEY_STATE_BY_OUTCOME: Record<
  TransferOutcomeScenario,
  MoneyState
> = {
  [TransferScenarioId.Completed]: MoneyState.MoneyMoved,
  [TransferScenarioId.Processing]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.HeldForReview]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.FraudBlocked]: MoneyState.NoMoneyMoved,
  [TransferScenarioId.RecipientAccountInactive]: MoneyState.NoMoneyMoved,
  [TransferScenarioId.RefundedAfterProcessing]: MoneyState.MoneyReturned,
  [TransferScenarioId.BalanceOrLimitShortAtApproval]: MoneyState.NoMoneyMoved,
  [TransferScenarioId.ApprovalExpired]: MoneyState.NoMoneyMoved,
  [TransferScenarioId.OutcomeUnexpected]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.ApprovalUnanswered]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.ApprovalUnknownAnswer]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.AppClosedDuringApproval]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.StatusUnreachable]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.LastTransferNotFound]: MoneyState.NotConfirmedYet,
  [TransferScenarioId.RecoveryUnexpected]: MoneyState.NotConfirmedYet,
};
