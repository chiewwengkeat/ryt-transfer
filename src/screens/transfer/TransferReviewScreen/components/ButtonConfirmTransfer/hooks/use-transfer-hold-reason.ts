import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferFlowStep,
  TransferHoldKind,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferHold } from "@/screens/transfer/flow-store/flow-store.type";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";

export function useTransferHoldReason() {
  const { t } = useTranslation("transfer");
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
  const screenOnTop = useIsScreenOnTop();
  const spokenHoldReasonRef = useRef<string>(undefined);
  // A disabled button's reason is never read out unless focus lands on it, so a hold says so as it appears, or
  // once the screen is back on top.
  useEffect(() => {
    if (!screenOnTop || spokenHoldReasonRef.current === holdReason) return;
    spokenHoldReasonRef.current = holdReason;
    if (holdReason !== undefined)
      AccessibilityInfo.announceForAccessibility(holdReason);
  }, [holdReason, screenOnTop]);

  return holdReason;
}
