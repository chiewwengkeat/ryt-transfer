import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import {
  ApprovalPath,
  isTransferSentOrBeingSent,
  TransferFlowStep,
  TransferHoldKind,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferHold } from "@/screens/transfer/flow-store/flow-store.type";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";
import ButtonUsePinInstead from "./components/ButtonUsePinInstead/ButtonUsePinInstead";

interface Props {
  shouldShowButtons: boolean;
  isBusy: boolean;
  isPinLocked: boolean | undefined;
  onPress: (path: ApprovalPath) => void;
}
export default function SectionTransferButtons({
  shouldShowButtons,
  isBusy,
  isPinLocked,
  onPress,
}: Props) {
  const { t } = useTranslation(["transfer", "shared"]);
  // The hold itself, not its time: the bank refusing again with the same time holds Transfer again.
  const [liftedHold, setLiftedHold] = useState<TransferHold>();

  const spokenHoldReasonRef = useRef<string>(undefined);
  const isSending = useTransferFlow(isTransferSentOrBeingSent);
  const hold = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Reviewing ? flow.hold : undefined,
  );
  const noticeOffline = useOfflineNotice();
  const isScreenOnTop = useIsScreenOnTop();

  const coolingOffUntil =
    hold?.kind === TransferHoldKind.CoolingOff ? hold.until : undefined;
  const reasonHold = (() => {
    if (hold === undefined || hold === liftedHold) return undefined;
    if (hold.kind === TransferHoldKind.AccountLocked)
      return t("common.account_locked.disabled_reason");
    if (hold.until === undefined)
      return t(
        hold.reason === CoolingOffReason.NewAccount
          ? "common.cooling_off_new_account.disabled_reason_without_time"
          : "common.cooling_off_new_phone.disabled_reason_without_time",
      );
    return t(
      hold.reason === CoolingOffReason.NewAccount
        ? "common.cooling_off_new_account.disabled_reason"
        : "common.cooling_off_new_phone.disabled_reason",
      { time: formatMalaysianDateTime(hold.until, t) },
    );
  })();
  const reasonTransferDisabled = reasonHold ?? noticeOffline;

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
  // A disabled button's reason is never read out unless focus lands on it, so a hold says so as it appears, or
  // once the screen is back on top.
  useEffect(() => {
    if (!isScreenOnTop || spokenHoldReasonRef.current === reasonHold) return;
    spokenHoldReasonRef.current = reasonHold;
    if (reasonHold !== undefined)
      AccessibilityInfo.announceForAccessibility(reasonHold);
  }, [reasonHold, isScreenOnTop]);

  if (!shouldShowButtons)
    return (
      noticeOffline !== undefined && (
        <TextBody tone="warning" alignCenter>
          {noticeOffline}
        </TextBody>
      )
    );

  return (
    <>
      <ButtonPrimary
        label={t("section_transfer_buttons.label")}
        loading={isSending || isBusy}
        disabledReason={reasonTransferDisabled}
        onPress={() => {
          onPress(ApprovalPath.Biometric);
        }}
      />
      <ButtonUsePinInstead
        pinTryAvailable={
          !isSending &&
          !isBusy &&
          reasonTransferDisabled === undefined &&
          isPinLocked === false
        }
        onPress={() => {
          onPress(ApprovalPath.Pin);
        }}
      />
    </>
  );
}
