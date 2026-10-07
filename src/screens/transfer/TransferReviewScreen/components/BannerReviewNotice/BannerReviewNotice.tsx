import { useTranslation } from "react-i18next";

import {
  type TransferFlowScenario,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

export default function BannerReviewNotice() {
  const { t } = useTranslation("transfer");
  const notice = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Reviewing ? flow.notice : undefined,
  );
  if (notice === undefined) return null;
  const noticeName = notice.replace(
    /^transfer\./,
    "",
  ) as `${TransferFlowScenario}` extends `transfer.${infer Name}`
    ? Name
    : never;
  return (
    <BannerNotice tone="negative" message={t(`common.${noticeName}.body`)} />
  );
}
