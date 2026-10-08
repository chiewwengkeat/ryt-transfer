import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { formatMoney, parseTypedAmount } from "@/shared/lib/money/money";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import FieldText from "@/shared/ui/FieldText/FieldText";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerFlowNotice from "../components/BannerFlowNotice/BannerFlowNotice";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "../state/transfer-flow";

export default function TransferAmountScreen() {
  const { t } = useTranslation("transfer");
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
  const [reviewPressed, setReviewPressed] = useState(false);
  // A ref, not state: two presses before a redraw read the same state, and each would push a review.
  const reviewPushedSinceFocusRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      reviewPushedSinceFocusRef.current = false;
    }, []),
  );
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();

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
  const amountError =
    typedAmount !== "" && parsedAmount === null
      ? t("common.badly_formed_input.amount")
      : bankRefusal === CreateTransferErrorCode.AmountInvalid &&
          parsedAmount?.minor === enteredAmount?.minor
        ? t("common.badly_formed_input.amount_refused")
        : parsedAmount !== null &&
            lowestCeiling !== undefined &&
            parsedAmount.minor > lowestCeiling.limit.minor
          ? lowestCeiling.message
          : reviewPressed && (parsedAmount === null || parsedAmount.minor === 0)
            ? t("amount.amount_missing")
            : undefined;
  // The bank's own rule: DuitNow carries the note onto the recipient's statement as it is typed.
  const noteError = !/^[A-Za-z0-9 ]*$/.test(typedNote)
    ? t("common.badly_formed_input.note")
    : bankRefusal === CreateTransferErrorCode.NoteInvalid &&
        typedNote.trim() === (enteredNote ?? "")
      ? t("common.badly_formed_input.note_refused")
      : undefined;

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
                : t("common.balance_unavailable.disabled_reason")
            }
            onPress={() => {
              if (reviewPushedSinceFocusRef.current) return;
              setReviewPressed(true);
              if (
                parsedAmount === null ||
                parsedAmount.minor === 0 ||
                amountError ||
                noteError
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
            }}
          />
        }
      >
        <BannerFlowNotice step={TransferFlowStep.Editing} />
        <CardBalance unexpectedScenario="amount_unexpected" />
        <FieldText
          label={t("amount.label")}
          placeholder={t("amount.placeholder")}
          value={typedAmount}
          onChangeText={(text) => {
            setTypedAmount(text);
            setReviewPressed(false);
          }}
          error={amountError}
          keyboardType="decimal-pad"
        />
        <FieldText
          label={t("amount.note_label")}
          value={typedNote}
          onChangeText={setTypedNote}
          error={noteError}
          maxLength={30}
        />
      </ViewScreenFrame>
    </>
  );
}
