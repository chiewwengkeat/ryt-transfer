import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";

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
  [TransferOutcomeScenario.Completed]: MoneyState.MoneyMoved,
  [TransferOutcomeScenario.Processing]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.HeldForReview]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.FraudBlocked]: MoneyState.NoMoneyMoved,
  [TransferOutcomeScenario.RecipientAccountInactive]: MoneyState.NoMoneyMoved,
  [TransferOutcomeScenario.RefundedAfterProcessing]: MoneyState.MoneyReturned,
  [TransferOutcomeScenario.BalanceOrLimitShortAtApproval]:
    MoneyState.NoMoneyMoved,
  [TransferOutcomeScenario.ApprovalExpired]: MoneyState.NoMoneyMoved,
  [TransferOutcomeScenario.OutcomeUnexpected]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.ApprovalUnanswered]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.ApprovalUnknownAnswer]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.AppClosedDuringApproval]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.StatusUnreachable]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.LastTransferNotFound]: MoneyState.NotConfirmedYet,
  [TransferOutcomeScenario.RecoveryUnexpected]: MoneyState.NotConfirmedYet,
};
