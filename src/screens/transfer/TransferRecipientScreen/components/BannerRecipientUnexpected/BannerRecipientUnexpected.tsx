import { useTranslation } from "react-i18next";

import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { useTrackScenarioShown } from "@/shared/observability/observability";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  onRetry: () => void;
}
export default function BannerRecipientUnexpected({ onRetry }: Props) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferFlowScenario.RecipientUnexpected);
  return (
    <>
      <BannerNotice
        tone="negative"
        message={t("common.recipient_unexpected.body")}
      />
      <ButtonSecondary
        label={t("common.recipient_unexpected.retry")}
        onPress={onRetry}
      />
    </>
  );
}
