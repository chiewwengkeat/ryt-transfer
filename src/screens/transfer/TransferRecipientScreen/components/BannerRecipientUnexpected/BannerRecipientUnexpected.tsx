import { useTranslation } from "react-i18next";

import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

interface Props {
  failure?: Error | null;
  onRetry: () => void;
}
export default function BannerRecipientUnexpected({ failure, onRetry }: Props) {
  const { t } = useTranslation("transfer");
  // A 401 is the session-ended view's to report, and sign-in reads the list again, which clears this.
  useTrackScenarioShown(
    failure instanceof TransportError &&
      failure.kind === TransportErrorKind.Http &&
      failure.status === 401
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
