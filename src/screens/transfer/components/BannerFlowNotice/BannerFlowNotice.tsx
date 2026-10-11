import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  scenarioWordsKey,
  TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

interface Props {
  step: TransferFlowStep.Editing | TransferFlowStep.Reviewing;
}
export default function BannerFlowNotice({ step }: Props) {
  const { t } = useTranslation(["transfer", "shared"]);

  const notice = useTransferFlow((flow) =>
    flow.step === step ? flow.notice : undefined,
  );
  const noticeDetail = useTransferFlow((flow) =>
    flow.step === step ? flow.noticeDetail : undefined,
  );

  if (notice === undefined) return null;
  // The field the bank's refusal names says it there, so a banner would say it twice.
  if (
    notice === TransferScenarioId.BadlyFormedInput &&
    noticeDetail?.code !== undefined
  )
    return null;

  const message = (() => {
    if (
      notice === TransferScenarioId.UnderMaintenance &&
      noticeDetail?.until !== undefined
    )
      return t("common.under_maintenance.until", {
        time: formatMalaysianDateTime(noticeDetail.until, t),
      });
    if (
      notice === TransferScenarioId.BalanceOrLimitShortAtConfirmation &&
      noticeDetail?.code !== undefined
    )
      return t(
        noticeDetail.code === CreateTransferErrorCode.InsufficientFunds
          ? "common.balance_or_limit_short_at_confirmation.over_balance"
          : "common.balance_or_limit_short_at_confirmation.over_limit",
      );
    return t(`common.${scenarioWordsKey(notice)}.body`);
  })();
  if (notice === TransferScenarioId.BalanceOrLimitShortAtConfirmation)
    return (
      <BannerAction
        tone="negative"
        message={message}
        action={{
          label: t(
            "common.balance_or_limit_short_at_confirmation.change_amount",
          ),
          onPress: () => {
            router.dismissTo("/transfer/amount");
          },
        }}
      />
    );
  return <BannerNotice tone="negative" message={message} />;
}
