import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { useBalanceScenarios } from "@/domains/transfer/hooks/use-balance-scenarios/use-balance-scenarios";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import BannerFlowNotice from "@/screens/transfer/components/BannerFlowNotice/BannerFlowNotice";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { formatMoney, parseTypedAmount } from "@/shared/lib/money/money";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import FieldText from "@/shared/ui/FieldText/FieldText";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function TransferAmountScreen() {
  const { t } = useTranslation("transfer");
  const [wasReviewPressed, setWasReviewPressed] = useState(false);

  // A ref, not state: two presses before a redraw read the same state, and each would push a review.
  const reviewPushedSinceFocusRef = useRef(false);
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const enteredAmount = useTransferFlow((flow) =>
    "draft" in flow ? flow.draft.amount : undefined,
  );
  const [typedAmount, setTypedAmount] = useState(
    enteredAmount === undefined ? "" : (enteredAmount.minor / 100).toFixed(2),
  );
  const enteredNote = useTransferFlow((flow) =>
    "draft" in flow ? flow.draft.note : undefined,
  );
  const [typedNote, setTypedNote] = useState(enteredNote ?? "");
  const bankRefusal = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Editing
      ? flow.noticeDetail?.code
      : undefined,
  );
  const noticeOffline = useOfflineNotice();
  const balanceScenarios = useBalanceScenarios(
    TransferScenarioId.AmountUnexpected,
  );

  const parsedAmount = parseTypedAmount(typedAmount);
  const ceilings = account.data &&
    limits.data && [
      {
        limit: account.data.balance,
        message: t("common.amount_too_high.over_balance", {
          amount: formatMoney(account.data.balance),
        }),
      },
      {
        limit: limits.data.remainingToday,
        message: t("common.amount_too_high.over_remaining_today", {
          amount: formatMoney(limits.data.remainingToday),
        }),
      },
      {
        limit: limits.data.perTransferMax,
        message: t("common.amount_too_high.over_per_transfer_max", {
          amount: formatMoney(limits.data.perTransferMax),
        }),
      },
    ];
  // The lowest is the one to name: lowering the amount under a higher one would leave it still too high.
  const lowestCeiling = ceilings?.reduce((lowest, ceiling) =>
    ceiling.limit.minor < lowest.limit.minor ? ceiling : lowest,
  );
  const isAmountBadlyFormed = typedAmount !== "" && parsedAmount === null;
  const isAmountRefusedByBank =
    bankRefusal === CreateTransferErrorCode.AmountInvalid &&
    parsedAmount?.minor === enteredAmount?.minor;
  const isAmountTooHigh =
    parsedAmount !== null &&
    lowestCeiling !== undefined &&
    parsedAmount.minor > lowestCeiling.limit.minor;
  const errorAmount = (() => {
    if (isAmountBadlyFormed) return t("common.badly_formed_input.amount");
    if (isAmountRefusedByBank)
      return t("common.badly_formed_input.amount_refused");
    if (isAmountTooHigh) return lowestCeiling.message;
    if (wasReviewPressed && (parsedAmount === null || parsedAmount.minor === 0))
      return t("amount.amount_missing");
    return undefined;
  })();
  // The bank's own rule: DuitNow carries the note onto the recipient's statement as it is typed.
  const isNoteBadlyFormed = !/^[A-Za-z0-9 ]*$/.test(typedNote);
  const errorNote = (() => {
    if (isNoteBadlyFormed) return t("common.badly_formed_input.note");
    if (
      bankRefusal === CreateTransferErrorCode.NoteInvalid &&
      typedNote.trim() === (enteredNote ?? "")
    )
      return t("common.badly_formed_input.note_refused");
    return undefined;
  })();

  useFocusEffect(
    useCallback(() => {
      reviewPushedSinceFocusRef.current = false;
    }, []),
  );
  // Not the bank's refusals: the flow already reported each as it came back to this step.
  useTrackScenarioShown(
    (() => {
      if (isAmountBadlyFormed || isNoteBadlyFormed)
        return TransferScenarioId.BadlyFormedInput;
      if (!isAmountRefusedByBank && isAmountTooHigh)
        return TransferScenarioId.AmountTooHigh;
      return undefined;
    })(),
  );

  function handleReview() {
    if (reviewPushedSinceFocusRef.current) return;
    setWasReviewPressed(true);
    if (
      parsedAmount === null ||
      parsedAmount.minor === 0 ||
      errorAmount ||
      errorNote
    )
      return;
    const note = typedNote.trim();
    if (
      dispatchTransferFlow({
        type: TransferFlowActionType.AmountEntered,
        amount: parsedAmount,
        ...(note !== "" && { note }),
      })
    ) {
      reviewPushedSinceFocusRef.current = true;
      router.push("/transfer/review");
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("amount.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("amount.review")}
            disabledReason={
              account.isSuccess &&
              (limits.isSuccess ||
                // Maintenance pauses sending, not the limit already loaded: review is where the bank says so.
                (limits.data !== undefined &&
                  getTransferLimitsMaintenance(limits.error) !== undefined))
                ? undefined
                : (noticeOffline ??
                  t("common.balance_unavailable.disabled_reason"))
            }
            notice={noticeOffline}
            onPress={handleReview}
          />
        }
      >
        <BannerFlowNotice step={TransferFlowStep.Editing} />
        <CardBalance {...balanceScenarios} />
        <FieldText
          label={t("amount.label")}
          placeholder={t("amount.placeholder")}
          value={typedAmount}
          onChangeText={(text) => {
            setTypedAmount(text);
            setWasReviewPressed(false);
          }}
          error={errorAmount}
          keyboardType="decimal-pad"
        />
        <FieldText
          label={t("amount.note_label")}
          value={typedNote}
          onChangeText={setTypedNote}
          error={errorNote}
          maxLength={30}
        />
      </ViewScreenFrame>
    </>
  );
}
