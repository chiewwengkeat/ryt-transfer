import { useTranslation } from "react-i18next";

import {
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import TextBody from "@/shared/ui/TextBody/TextBody";

export default function TextSendingTransfer() {
  const { t } = useTranslation("transfer");
  // Through Done as well: review stays drawn until the result page covers it.
  const approvalSent = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Submitting ||
      flow.step === TransferFlowStep.Done,
  );
  if (!approvalSent) return null;
  return <TextBody>{t("common.biometrics_recognised.body")}</TextBody>;
}
