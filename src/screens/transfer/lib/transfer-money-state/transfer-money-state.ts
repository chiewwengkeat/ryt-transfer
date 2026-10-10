import { type TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
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

// Differs from MONEY_STATE_BY_OUTCOME where marked, and may on combinations the bank is not known to send. No
// phrase where the matrix has none.
export function readSectionTransferDetailsMoneyState({
  direction,
  funds,
  status,
}: Pick<Transfer, "direction" | "funds" | "status">) {
  if (direction === TransferDirection.In) return undefined;
  return (
    {
      // Differs: whatever the reason, where an outcome for a reason no scenario names reads "not confirmed yet".
      [TransferFunds.NotDebited]:
        status === TransferStatus.AwaitingApproval
          ? undefined
          : MoneyState.NoMoneyMoved,
      [TransferFunds.Debited]:
        status === TransferStatus.Completed
          ? MoneyState.MoneyMoved
          : MoneyState.NotConfirmedYet,
      // Differs: none until the refund lands, where its outcome already reads "money returned".
      [TransferFunds.RefundPending]: undefined,
      [TransferFunds.Refunded]: MoneyState.MoneyReturned,
      [TransferFunds.Credited]: undefined,
    } satisfies Record<TransferFunds, MoneyState | undefined>
  )[funds];
}
