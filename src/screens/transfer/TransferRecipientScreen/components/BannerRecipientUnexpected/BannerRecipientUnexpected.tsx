import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { useTranslation } from "react-i18next";

interface Props {
  failure?: Error | null;
  onRetry: () => unknown;
}
export default function BannerRecipientUnexpected({ failure, onRetry }: Props) {
  const { t } = useTranslation("transfer");

  const didSessionEnd = isSessionEndFailure(failure);

  // Sign-in reads the list again, which clears this.
  useTrackScenarioShown(
    didSessionEnd ? undefined : TransferScenarioId.RecipientUnexpected,
  );

  return (
    <BannerAction
      tone="negative"
      announce={!didSessionEnd}
      message={t("common.recipient_unexpected.body")}
      action={{
        label: t("common.recipient_unexpected.retry"),
        onPress: onRetry,
      }}
    />
  );
}
