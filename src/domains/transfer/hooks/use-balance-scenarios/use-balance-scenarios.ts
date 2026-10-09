import { useTranslation } from "react-i18next";

import { trackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import {
  scenarioWordsKey,
  TransferScenarioId,
} from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";

export function useBalanceScenarios(
  unexpectedScenarioId:
    TransferScenarioId.StartUnexpected | TransferScenarioId.AmountUnexpected,
) {
  const { t } = useTranslation("account");
  const unexpectedWordsKey = scenarioWordsKey(unexpectedScenarioId);
  return {
    failureWords: {
      unavailable: {
        body: t("common.balance_unavailable.body"),
        retry: t("common.balance_unavailable.retry"),
      },
      unexpected: {
        body: t(`common.${unexpectedWordsKey}.body`),
        retry: t(`common.${unexpectedWordsKey}.retry`),
      },
    },
    onLoaded: () => {
      trackScenarioShown(TransferScenarioId.BalanceAndLimitShown);
    },
    onFailed: (failure: "unavailable" | "unexpected") => {
      trackScenarioShown(
        failure === "unavailable"
          ? TransferScenarioId.BalanceUnavailable
          : unexpectedScenarioId,
      );
    },
    onUnderMaintenance: () => {
      trackScenarioShown(TransferScenarioId.UnderMaintenance);
    },
  };
}
