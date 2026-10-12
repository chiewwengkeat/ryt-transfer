import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  BiometricSignOutcome,
  readBiometricSensorRefusal,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import { isApprovalPinLocked } from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import { showApprovalPinLocked } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { isApprovalRefusedOnThisPhone } from "@/domains/approval/lib/device-integrity-verdict/device-integrity-verdict";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferDraft } from "@/screens/transfer/flow-store/flow-store.type";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SectionTransferButtons from "./components/SectionTransferButtons/SectionTransferButtons";
import { useApprovalPinLocked } from "./hooks/use-approval-pin-locked/use-approval-pin-locked";
import { useReviewLeaveWatch } from "./hooks/use-review-leave-watch/use-review-leave-watch";
import { useSendTransferApproval } from "./hooks/use-send-transfer-approval/use-send-transfer-approval";
import { settleCreateFailure } from "./lib/settle-create-failure/settle-create-failure";
import { settleUnexpectedConfirmFailure } from "./lib/settle-unexpected-confirm-failure/settle-unexpected-confirm-failure";

interface Props {
  draft: TransferDraft;
}
export default function ButtonConfirmTransfer({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);

  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const sendTransferApproval = useSendTransferApproval();
  const isAmountRefusedAsShort = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Reviewing &&
      flow.notice === TransferScenarioId.BalanceOrLimitShortAtConfirmation,
  );
  const { pinLocked: isPinLocked, isPinLockedNow } = useApprovalPinLocked();
  const readLeaveCount = useReviewLeaveWatch();

  async function createAndApproveTransfer(path: ApprovalPath) {
    if (!lookup.isSuccess) return;
    const leaveCountAtPress = readLeaveCount();
    setIsCheckingPhone(true);
    const doesPhoneRefuseApproval =
      await isApprovalRefusedOnThisPhone().finally(() => {
        setIsCheckingPhone(false);
      });
    // A press left while the check runs is void, so not even its refusal shows.
    if (readLeaveCount() !== leaveCountAtPress) return;
    if (doesPhoneRefuseApproval) {
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferScenarioId.RootedPhone,
      });
      return;
    }
    // Read now, not from the render pressed in: the lock can land while the check runs.
    const isPinLockedAfterCheck =
      isPinLockedNow() ?? (await isApprovalPinLocked());
    const sensorRefusalOutcome = isPinLockedAfterCheck
      ? (await readBiometricSensorRefusal())?.outcome
      : undefined;
    // ⛔ Read after every wait: once review is left the press is void, so nothing is created or prompted behind them.
    if (readLeaveCount() !== leaveCountAtPress) return;
    // ⛔ The bank refuses every PIN while it holds the lock: never create a transfer only a PIN could approve.
    if (
      isPinLockedAfterCheck &&
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
        reviewing.createRecipientRefToReuse === lookup.data.recipientRef &&
        reviewing.createKeyToReuse) ||
      randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Confirmed,
        lookup: lookup.data,
        idempotencyKey,
      })
    )
      return;
    // The reducer matches the step, not the attempt: a late answer to an abandoned create would move the next one.
    function isThisCreateStillAwaited() {
      const flow = transferFlowStore.getState();
      return (
        flow.step === TransferFlowStep.Creating &&
        flow.idempotencyKey === idempotencyKey
      );
    }
    let created: CreateTransferResponse;
    try {
      created = await createTransfer.mutateAsync({
        request: {
          recipientRef: lookup.data.recipientRef,
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
          checkTheNameAgain: lookup.refetch,
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
    if (readLeaveCount() !== leaveCountAtPress) {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferScenarioId.ApprovalCancelled,
      });
      return;
    }
    await sendTransferApproval(path);
  }

  return (
    <SectionTransferButtons
      // Not the data: a name check that fails on a later run keeps the earlier answer's data.
      // On a short amount, the notice's Change amount is the way on: the bank has just refused this amount.
      shouldShowButtons={lookup.isSuccess && !isAmountRefusedAsShort}
      isBusy={lookup.isFetching || isCheckingPhone}
      isPinLocked={isPinLocked}
      onPress={(path) => {
        createAndApproveTransfer(path).catch(() =>
          settleUnexpectedConfirmFailure(queryClient),
        );
      }}
    />
  );
}
