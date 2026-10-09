import { useTranslation } from "react-i18next";

import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { isSessionEndFailure } from "@/shared/http/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

interface Props {
  failure?: Error | null;
  onRetry: () => void;
}
export default function BannerRecipientUnexpected({ failure, onRetry }: Props) {
  const { t } = useTranslation("transfer");
  // Sign-in reads the list again, which clears this.
  useTrackScenarioShown(
    isSessionEndFailure(failure)
      ? undefined
      : TransferFlowScenario.RecipientUnexpected,
  );
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
