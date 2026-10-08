import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { accountKeys } from "@/domains/account/api/account.keys";
import {
  isCreateTransferUnanswered,
  useCreateTransfer,
} from "@/domains/transfer/api/create-transfer/create-transfer";
import {
  CoolingOffReason,
  CreateTransferErrorCode,
  type CreateTransferErrorResponse,
  type CreateTransferResponse,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { refreshAccountAndHistoryAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
  TransferHoldKind,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import { TransportError } from "@/shared/http/transport-error";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useIsOffline } from "@/shared/platform/offline";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

import { useSendTransferApproval } from "./hooks/use-send-transfer-approval";

interface Props {
  draft: TransferDraft;
}
export default function ButtonConfirmTransfer({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const sendTransferApproval = useSendTransferApproval();
  const sending = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Creating ||
      flow.step === TransferFlowStep.Approving ||
      flow.step === TransferFlowStep.Submitting,
  );
  const hold = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Reviewing ? flow.hold : undefined,
  );
  const offline = useIsOffline();
  const confirmedLookup = lookup.data;
  if (confirmedLookup === undefined) return null;

  const holdReason =
    hold?.kind === TransferHoldKind.AccountLocked
      ? t("common.account_locked.disabled_reason")
      : hold?.kind === TransferHoldKind.CoolingOff
        ? t(
            hold.reason === CoolingOffReason.NewAccount
              ? "common.cooling_off_new_account.disabled_reason"
              : "common.cooling_off_new_phone.disabled_reason",
            { time: formatMalaysianDateTime(hold.until) },
          )
        : undefined;

  const createAndApproveTransfer = async () => {
    const reviewing = transferFlowStore.getState();
    const idempotencyKey =
      (reviewing.step === TransferFlowStep.Reviewing &&
        reviewing.createKeyToReuse) ||
      randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Confirmed,
        lookup: confirmedLookup,
        idempotencyKey,
      })
    )
      return;
    // The reducer matches the step, not the attempt: a late answer to an abandoned create would move the next one.
    const isThisCreateStillAwaited = () => {
      const flow = transferFlowStore.getState();
      return (
        flow.step === TransferFlowStep.Creating &&
        flow.idempotencyKey === idempotencyKey
      );
    };

    let created: CreateTransferResponse;
    try {
      created = await createTransfer.mutateAsync({
        request: {
          recipientRef: confirmedLookup.recipientRef,
          amount: draft.amount,
        },
        idempotencyKey,
      });
    } catch (error) {
      if (!isThisCreateStillAwaited()) return;
      if (isCreateTransferUnanswered(error)) {
        dispatchTransferFlow({
          type: TransferFlowActionType.CreateUnanswered,
          notice: TransferFlowScenario.ConfirmationUnanswered,
        });
        return;
      }
      const refusal =
        error instanceof TransportError
          ? (error.body as CreateTransferErrorResponse | undefined)?.error
          : undefined;
      switch (refusal?.code) {
        case CreateTransferErrorCode.CoolingOff:
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateRefusedByHold,
            hold: {
              kind: TransferHoldKind.CoolingOff,
              until: refusal.until,
              reason: refusal.reason,
            },
          });
          return;
        case CreateTransferErrorCode.AccountLocked:
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateRefusedByHold,
            hold: { kind: TransferHoldKind.AccountLocked },
          });
          return;
        case CreateTransferErrorCode.InsufficientFunds:
        case CreateTransferErrorCode.DailyLimitExceeded:
        case CreateTransferErrorCode.AbovePerTransferMax:
          // The figures the amount step checked against are stale now, so it reads them again.
          void queryClient.invalidateQueries({ queryKey: accountKeys.all });
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateNotSent,
            notice: TransferFlowScenario.BalanceOrLimitShortAtConfirmation,
            noticeDetail: { code: refusal.code },
          });
          return;
        case CreateTransferErrorCode.AmountInvalid:
        case CreateTransferErrorCode.NoteInvalid:
          if (
            dispatchTransferFlow({
              type: TransferFlowActionType.CreateReturnedToAmount,
              notice: TransferFlowScenario.BadlyFormedInput,
            })
          )
            router.dismissTo("/transfer/amount");
          return;
        case CreateTransferErrorCode.RecipientRefExpired:
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateNotSent,
            notice: TransferFlowScenario.NameCheckExpired,
          });
          void lookup.refetch();
          return;
        case CreateTransferErrorCode.ServiceUnavailable:
          // Home reads maintenance off the limits, so they are read again before the person returns there.
          void queryClient.invalidateQueries({
            queryKey: accountKeys.transferLimits,
          });
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateNotSent,
            notice: TransferFlowScenario.UnderMaintenance,
            noticeDetail: { until: refusal.until },
          });
          return;
        // The bank is still on the first request under this key, so a repeat of it later gets that one's answer.
        case CreateTransferErrorCode.RequestInProgress:
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateUnanswered,
            notice: TransferFlowScenario.ConfirmationUnanswered,
          });
          return;
        case CreateTransferErrorCode.IdempotencyKeyReused:
        case CreateTransferErrorCode.InvalidRequest:
        case undefined:
        default:
          dispatchTransferFlow({
            type: TransferFlowActionType.CreateNotSent,
            notice: TransferFlowScenario.ReviewUnexpected,
          });
          return;
      }
    }
    if (!isThisCreateStillAwaited()) return;
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Created,
        transferId: created.transfer.transferId,
        challenge: created.approval.challenge,
        expiresInSeconds: created.approval.expiresInSeconds,
      })
    )
      return;
    await sendTransferApproval();
  };

  return (
    <ButtonPrimary
      label={t("review.transfer")}
      loading={sending || lookup.isFetching}
      disabledReason={
        holdReason ??
        (offline ? t("common.offline.disabled_reason") : undefined)
      }
      onPress={() => {
        void createAndApproveTransfer().catch(() => {
          // Before the approval leaves the phone nothing can have moved, so review offers it again.
          // After, nothing proves where it ended: only the result page may say, with Home beneath it.
          const flow = transferFlowStore.getState();
          if (flow.step !== TransferFlowStep.Submitting) {
            dispatchTransferFlow(
              flow.step === TransferFlowStep.Approving
                ? {
                    type: TransferFlowActionType.ApprovalNotSent,
                    notice: TransferFlowScenario.ApprovalUnexpected,
                  }
                : {
                    type: TransferFlowActionType.CreateNotSent,
                    notice: TransferFlowScenario.ReviewUnexpected,
                  },
            );
            return;
          }
          void refreshAccountAndHistoryAfterApproval(queryClient);
          router.dismissTo("/");
          router.push(`/transfer/result/${flow.transferId}`);
          dispatchTransferFlow({ type: TransferFlowActionType.AnswerLost });
        });
      }}
    />
  );
}
