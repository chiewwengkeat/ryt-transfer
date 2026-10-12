import {
  scenarioWordsKey,
  type TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { useTranslation } from "react-i18next";

interface Props {
  scenario:
    | TransferScenarioId.NameCheckUnavailable
    | TransferScenarioId.TooManyNameChecks
    | TransferScenarioId.ReviewUnexpected;
  announce: boolean;
  canRetry: boolean;
  onRetry: () => unknown;
}
export default function BannerNameCheckFailed({
  scenario,
  announce,
  canRetry,
  onRetry,
}: Props) {
  const { t } = useTranslation("transfer");

  return (
    <BannerAction
      tone="negative"
      announce={announce}
      message={t(`common.${scenarioWordsKey(scenario)}.body`)}
      action={
        canRetry
          ? {
              label: t(`common.${scenarioWordsKey(scenario)}.retry`),
              onPress: onRetry,
            }
          : undefined
      }
    />
  );
}
