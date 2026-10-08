import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

import { showApprovalPinLocked } from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import {
  CoolingOffReason,
  type CreateTransferResponse,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
  TransferHoldKind,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type {
  TransferDraft,
  TransferHold,
} from "@/screens/transfer/state/transfer-flow.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useIsOffline } from "@/shared/platform/offline";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

import ButtonUsePinInstead from "./components/ButtonUsePinInstead/ButtonUsePinInstead";
import { settleApprovalAnswer } from "./hooks/settle-approval-answer";
import { settleCreateFailure } from "./hooks/settle-create-failure";
import { useApprovalPinLocked } from "./hooks/use-approval-pin-locked";
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
  const coolingOffEndsAtMs =
    hold?.kind === TransferHoldKind.CoolingOff ? Date.parse(hold.until) : NaN;
  // The hold itself, not its time: the bank refusing again with the same time holds Transfer again.
  const [liftedHold, setLiftedHold] = useState<TransferHold>();
  useEffect(() => {
    if (Number.isNaN(coolingOffEndsAtMs)) return;
    const timer = setTimeout(() => {
      setLiftedHold(hold);
    }, coolingOffEndsAtMs - Date.now());
    return () => {
      clearTimeout(timer);
    };
  }, [hold, coolingOffEndsAtMs]);
  const offline = useIsOffline();
  const approvalPinLocked = useApprovalPinLocked();

  const holdReason =
    hold === undefined || hold === liftedHold
      ? undefined
      : hold.kind === TransferHoldKind.AccountLocked
        ? t("common.account_locked.disabled_reason")
        : Number.isNaN(coolingOffEndsAtMs)
          ? t(
              hold.reason === CoolingOffReason.NewAccount
                ? "common.cooling_off_new_account.disabled_reason_without_time"
                : "common.cooling_off_new_phone.disabled_reason_without_time",
            )
          : t(
              hold.reason === CoolingOffReason.NewAccount
                ? "common.cooling_off_new_account.disabled_reason"
                : "common.cooling_off_new_phone.disabled_reason",
              { time: formatMalaysianDateTime(hold.until) },
            );
  // A disabled button's reason is never read out unless focus lands on it, so a hold that appears says so.
  useEffect(() => {
    if (holdReason !== undefined)
      AccessibilityInfo.announceForAccessibility(holdReason);
  }, [holdReason]);
  // Not the data: a name check that fails on a later run keeps the earlier answer's data.
  if (!lookup.isSuccess) return null;
  const confirmedLookup = lookup.data;

  const createAndApproveTransfer = async (path: ApprovalPath) => {
    // ⛔ The bank refuses every PIN while it holds the lock, so a transfer only a PIN could approve is never created.
    if (
      approvalPinLocked &&
      (path === ApprovalPath.Pin ||
        !approvalSettingsStore.getState().biometricApprovalOn)
    ) {
      await showApprovalPinLocked({
        ...(path === ApprovalPath.Pin
          ? { message: t("common.pin_chosen.body") }
          : {
              message: t("common.biometrics_unavailable.body"),
              detail: t("common.biometrics_unavailable.turned_off"),
            }),
        refusal: t("common.pin_locked.body"),
      });
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.PinLocked,
      });
      return;
    }
    const reviewing = transferFlowStore.getState();
    // A name check run again answers with a new ref, and the bank refuses a kept key sent with another body.
    const idempotencyKey =
      (reviewing.step === TransferFlowStep.Reviewing &&
        reviewing.createRecipientRefToReuse === confirmedLookup.recipientRef &&
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
          ...(draft.note !== undefined && { note: draft.note }),
        },
        idempotencyKey,
      });
    } catch (failure) {
      if (isThisCreateStillAwaited())
        settleCreateFailure({
          failure,
          queryClient,
          checkTheNameAgain: () => void lookup.refetch(),
        });
      return;
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
    await sendTransferApproval(path);
  };
  const transferDisabledReason =
    holdReason ?? (offline ? t("common.offline.disabled_reason") : undefined);
  const settleUnexpectedConfirmFailure = () => {
    // Before the approval leaves the phone nothing can have moved, so review offers it again.
    // After, nothing proves where it ended, so it settles as an answer that never came.
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
    void settleApprovalAnswer({
      answer: {},
      transferId: flow.transferId,
      // Only a refusal forgets the record, and an answer with nothing in it is none.
      forgetPendingTransfer: () => Promise.resolve(),
      queryClient,
    });
  };

  return (
    <>
      <ButtonPrimary
        label={t("review.transfer")}
        loading={sending || lookup.isFetching}
        disabledReason={transferDisabledReason}
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Biometric).catch(
            settleUnexpectedConfirmFailure,
          );
        }}
      />
      <ButtonUsePinInstead
        pinTryAvailable={
          !sending && transferDisabledReason === undefined && !approvalPinLocked
        }
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Pin).catch(
            settleUnexpectedConfirmFailure,
          );
        }}
      />
    </>
  );
}
