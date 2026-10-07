import { useTranslation } from "react-i18next";

import {
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import TextBody from "@/shared/ui/TextBody/TextBody";

export default function TextSendingTransfer() {
  const { t } = useTranslation("transfer");
  const answerAwaited = useTransferFlow(
    (flow) => flow.step === TransferFlowStep.Submitting,
  );
  if (!answerAwaited) return null;
  return <TextBody>{t("common.biometrics_recognised.body")}</TextBody>;
}
