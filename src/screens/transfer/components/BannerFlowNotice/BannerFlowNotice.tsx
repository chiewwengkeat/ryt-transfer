import { useTranslation } from "react-i18next";

import {
  type TransferFlowScenario,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

interface Props {
  step: TransferFlowStep.Editing | TransferFlowStep.Reviewing;
}
export default function BannerFlowNotice({ step }: Props) {
  const { t } = useTranslation("transfer");
  const notice = useTransferFlow((flow) =>
    flow.step === step ? flow.notice : undefined,
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
