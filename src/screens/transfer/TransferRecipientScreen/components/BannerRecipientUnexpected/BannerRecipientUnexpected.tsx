import { useTranslation } from "react-i18next";

import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { useTrackScenarioShown } from "@/shared/observability/observability";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

interface Props {
  onRetry: () => void;
}
export default function BannerRecipientUnexpected({ onRetry }: Props) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferFlowScenario.RecipientUnexpected);
  return (
    <BannerAction
      tone="negative"
      message={t("common.recipient_unexpected.body")}
      action={{
        label: t("common.recipient_unexpected.retry"),
        onPress: onRetry,
      }}
    />
  );
}
