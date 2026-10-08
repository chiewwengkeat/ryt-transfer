import { useTranslation } from "react-i18next";

import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferFlowScenario,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

interface Props {
  step: TransferFlowStep.Editing | TransferFlowStep.Reviewing;
}
export default function BannerFlowNotice({ step }: Props) {
  const { t } = useTranslation("transfer");
  const notice = useTransferFlow((flow) =>
    flow.step === step ? flow.notice : undefined,
  );
  const noticeDetail = useTransferFlow((flow) =>
    flow.step === step && flow.step === TransferFlowStep.Reviewing
      ? flow.noticeDetail
      : undefined,
  );
  if (notice === undefined) return null;
  const noticeName = notice.replace(
    /^transfer\./,
    "",
  ) as `${TransferFlowScenario}` extends `transfer.${infer Name}`
    ? Name
    : never;
  return (
    <BannerNotice
      tone="negative"
      message={
        notice === TransferFlowScenario.UnderMaintenance &&
        noticeDetail?.until !== undefined
          ? t("common.under_maintenance.until", {
              time: formatMalaysianDateTime(noticeDetail.until),
            })
          : notice === TransferFlowScenario.BalanceOrLimitShortAtConfirmation &&
              noticeDetail?.code !== undefined
            ? t(
                noticeDetail.code === CreateTransferErrorCode.InsufficientFunds
                  ? "common.balance_or_limit_short_at_confirmation.over_balance"
                  : "common.balance_or_limit_short_at_confirmation.over_limit",
              )
            : t(`common.${noticeName}.body`)
      }
    />
  );
}
