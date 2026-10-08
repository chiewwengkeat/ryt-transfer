import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { useGetTransferLimits } from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { formatMoney, parseTypedAmount } from "@/shared/lib/money/money";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import FieldText from "@/shared/ui/FieldText/FieldText";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
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
  const [reviewPressed, setReviewPressed] = useState(false);
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();

  const amount = parseTypedAmount(typedAmount);
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
    typedAmount !== "" && amount === null
      ? t("common.badly_formed_input.amount")
      : amount !== null &&
          lowestCeiling !== undefined &&
          amount.minor > lowestCeiling.limit.minor
        ? lowestCeiling.message
        : reviewPressed && (amount === null || amount.minor === 0)
          ? t("amount.amount_missing")
          : undefined;

  return (
    <>
      <Stack.Screen options={{ title: t("amount.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("amount.review")}
            disabledReason={
              account.isSuccess && limits.isSuccess
                ? undefined
                : t("common.balance_unavailable.disabled_reason")
            }
            onPress={() => {
              setReviewPressed(true);
              if (amount === null || amount.minor === 0 || amountError) return;
              if (
                dispatchTransferFlow({
                  type: TransferFlowActionType.AmountEntered,
                  amount,
                })
              )
                router.push("/transfer/review");
            }}
          />
        }
      >
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
      </ViewScreenFrame>
    </>
  );
}
