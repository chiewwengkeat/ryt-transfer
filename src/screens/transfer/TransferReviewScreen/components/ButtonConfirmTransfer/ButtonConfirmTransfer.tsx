import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

import {
  BiometricSignOutcome,
  readBiometricSensorRefusal,
} from "@/domains/approval/hooks/approval-keys";
import { showApprovalPinLocked } from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { isApprovalRefusedOnThisPhone } from "@/domains/approval/hooks/device-integrity-verdict";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import {
  CoolingOffReason,
  type CreateTransferResponse,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import {
  ApprovalPath,
  dispatchTransferFlow,
  isTransferBeingSent,
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
import { settleCreateFailure } from "./hooks/settle-create-failure";
import { settleUnexpectedConfirmFailure } from "./hooks/settle-unexpected-confirm-failure";
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
  const transferBeingSent = useTransferFlow(isTransferBeingSent);
  const hold = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Reviewing ? flow.hold : undefined,
  );
  const coolingOffUntil =
    hold?.kind === TransferHoldKind.CoolingOff ? hold.until : undefined;
  // The hold itself, not its time: the bank refusing again with the same time holds Transfer again.
  const [liftedHold, setLiftedHold] = useState<TransferHold>();
  useEffect(() => {
    if (coolingOffUntil === undefined) return;
    const timer = setTimeout(
      () => {
        setLiftedHold(hold);
      },
      Date.parse(coolingOffUntil) - Date.now(),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [hold, coolingOffUntil]);
  const offline = useIsOffline();
  const approvalPinLocked = useApprovalPinLocked();
  const [checkingPhone, setCheckingPhone] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const reviewLeaveCountRef = useRef(0);
  useEffect(() => {
    const countLeave = () => {
      reviewLeaveCountRef.current += 1;
    };
    // iOS's own Back and swipe pop review only once their animation ends; this hears them begin.
    const stopHearingClose = navigation.addListener(
      "transitionStart",
      (event) => {
        if (event.data.closing) countLeave();
      },
    );
    return () => {
      stopHearingClose();
      countLeave();
    };
  }, [navigation]);

  const holdReason =
    hold === undefined || hold === liftedHold
      ? undefined
      : hold.kind === TransferHoldKind.AccountLocked
        ? t("common.account_locked.disabled_reason")
        : hold.until === undefined
          ? t(
              hold.reason === CoolingOffReason.NewAccount
                ? "common.cooling_off_new_account.disabled_reason_without_time"
                : "common.cooling_off_new_phone.disabled_reason_without_time",
            )
          : t(
              hold.reason === CoolingOffReason.NewAccount
                ? "common.cooling_off_new_account.disabled_reason"
                : "common.cooling_off_new_phone.disabled_reason",
              { time: formatMalaysianDateTime(hold.until, t) },
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
    const leaveCountAtPress = reviewLeaveCountRef.current;
    setCheckingPhone(true);
    const phoneRefusesApproval = await isApprovalRefusedOnThisPhone();
    setCheckingPhone(false);
    // Leaving review while the check runs voids the press, even if they come back: nothing is approved behind them.
    if (reviewLeaveCountRef.current !== leaveCountAtPress) return;
    if (phoneRefusesApproval) {
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.RootedPhone,
      });
      return;
    }
    if (approvalPinLocked) {
      const sensorRefusalOutcome = (await readBiometricSensorRefusal())
        ?.outcome;
      // ⛔ The bank refuses every PIN while it holds the lock, so a transfer only a PIN could approve is never created.
      if (
        path === ApprovalPath.Pin ||
        !approvalSettingsStore.getState().biometricApprovalOn ||
        sensorRefusalOutcome === BiometricSignOutcome.NotSetUp ||
        sensorRefusalOutcome === BiometricSignOutcome.NoSensor
      ) {
        await showApprovalPinLocked(t("common.pin_locked.body"));
        dispatchTransferFlow({
          type: TransferFlowActionType.CreateNotSent,
          notice: TransferFlowScenario.PinLocked,
        });
        return;
      }
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

  return (
    <>
      <ButtonPrimary
        label={t("review.transfer")}
        loading={transferBeingSent || lookup.isFetching || checkingPhone}
        disabledReason={transferDisabledReason}
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Biometric).catch(() => {
            settleUnexpectedConfirmFailure(queryClient);
          });
        }}
      />
      <ButtonUsePinInstead
        pinTryAvailable={
          !transferBeingSent &&
          !lookup.isFetching &&
          !checkingPhone &&
          transferDisabledReason === undefined &&
          !approvalPinLocked
        }
        onPress={() => {
          void createAndApproveTransfer(ApprovalPath.Pin).catch(() => {
            settleUnexpectedConfirmFailure(queryClient);
          });
        }}
      />
    </>
  );
}
