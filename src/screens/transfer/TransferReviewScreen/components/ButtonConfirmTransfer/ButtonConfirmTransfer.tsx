import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useTranslation } from "react-i18next";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  BiometricSignOutcome,
  readBiometricSensorRefusal,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import { isApprovalPinLocked } from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import { showApprovalPinLocked } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  ApprovalPath,
  dispatchTransferFlow,
  isTransferSentOrBeingSent,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferDraft } from "@/screens/transfer/flow-store/flow-store.type";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";

import ButtonUsePinInstead from "./components/ButtonUsePinInstead/ButtonUsePinInstead";
import { useApprovalPinLocked } from "./hooks/use-approval-pin-locked/use-approval-pin-locked";
import { usePhoneCheckBeforeApproval } from "./hooks/use-phone-check-before-approval/use-phone-check-before-approval";
import { useReviewLeaveWatch } from "./hooks/use-review-leave-watch/use-review-leave-watch";
import { useSendTransferApproval } from "./hooks/use-send-transfer-approval/use-send-transfer-approval";
import { useTransferHoldReason } from "./hooks/use-transfer-hold-reason/use-transfer-hold-reason";
import { settleCreateFailure } from "./lib/settle-create-failure/settle-create-failure";
import { settleUnexpectedConfirmFailure } from "./lib/settle-unexpected-confirm-failure/settle-unexpected-confirm-failure";

interface Props {
  draft: TransferDraft;
}
export default function ButtonConfirmTransfer({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const sendTransferApproval = useSendTransferApproval();
  const transferSentOrBeingSent = useTransferFlow(isTransferSentOrBeingSent);
  const amountRefusedAsShort = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Reviewing &&
      flow.notice === TransferScenarioId.BalanceOrLimitShortAtConfirmation,
  );
  const holdReason = useTransferHoldReason();
  const offlineNotice = useOfflineNotice();
  const { pinLocked: approvalPinLocked, isPinLockedNow } =
    useApprovalPinLocked();
  const { checkingPhone, checkPhoneAllowsThisApproval } =
    usePhoneCheckBeforeApproval();
  const startWatchingForReviewLeave = useReviewLeaveWatch();

  // Not the data: a name check that fails on a later run keeps the earlier answer's data.
  // On a short amount, the notice's Change amount is the way on: the bank has just refused this amount.
  if (!lookup.isSuccess || amountRefusedAsShort)
    return (
      offlineNotice !== undefined && (
        <TextBody tone="warning" alignCenter>
          {offlineNotice}
        </TextBody>
      )
    );
  const confirmedLookup = lookup.data;

  const createAndApproveTransfer = async (path: ApprovalPath) => {
    const hasLeftReviewSincePress = startWatchingForReviewLeave();
    if (!(await checkPhoneAllowsThisApproval(hasLeftReviewSincePress))) return;
    // Read now, not from the render pressed in: the lock can land while the check runs.
    const pinLockedAfterCheck =
      isPinLockedNow() ?? (await isApprovalPinLocked());
    const sensorRefusalOutcome = pinLockedAfterCheck
      ? (await readBiometricSensorRefusal())?.outcome
      : undefined;
    // ⛔ Read after every wait: once review is left the press is void, so nothing is created or prompted behind them.
    if (hasLeftReviewSincePress()) return;
    // ⛔ The bank refuses every PIN while it holds the lock: never create a transfer only a PIN could approve.
    if (
      pinLockedAfterCheck &&
      (path === ApprovalPath.Pin ||
        !approvalSettingsStore.getState().biometricApprovalOn ||
        sensorRefusalOutcome === BiometricSignOutcome.NotSetUp ||
        sensorRefusalOutcome === BiometricSignOutcome.NoSensor ||
        sensorRefusalOutcome === BiometricSignOutcome.LockedOut)
    ) {
      // ⛔ Dispatched first, since it reports the scenario: a locked PIN is reported as its sheet opens.
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferScenarioId.PinLocked,
      });
      await showApprovalPinLocked(t("common.pin_locked.body"));
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
    if (hasLeftReviewSincePress()) {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferScenarioId.ApprovalCancelled,
      });
      return;
    }
    await sendTransferApproval(path);
  };
  const transferDisabledReason = holdReason ?? offlineNotice;

  return (
    <>
      <ButtonPrimary
        label={t("button_confirm_transfer.label")}
        loading={transferSentOrBeingSent || lookup.isFetching || checkingPhone}
        disabledReason={transferDisabledReason}
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Biometric).catch(() =>
            settleUnexpectedConfirmFailure(queryClient),
          );
        }}
      />
      <ButtonUsePinInstead
        pinTryAvailable={
          !transferSentOrBeingSent &&
          !lookup.isFetching &&
          !checkingPhone &&
          transferDisabledReason === undefined &&
          approvalPinLocked === false
        }
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Pin).catch(() =>
            settleUnexpectedConfirmFailure(queryClient),
          );
        }}
      />
    </>
  );
}
