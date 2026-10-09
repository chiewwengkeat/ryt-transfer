import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

import {
  type TransferOutcomeScenario,
  type useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { scenarioWordsKey } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top";
import { formatMoney } from "@/shared/lib/money/money";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";

import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
} from "../../transfer-outcome-money-states";

interface Props {
  scenario: TransferOutcomeScenario;
  transfer: ReturnType<typeof useGetTransfer>["data"];
  transferId: string;
  pageOpened: boolean;
}
export default function TextOutcome({
  scenario,
  transfer,
  transferId,
  pageOpened,
}: Props) {
  const { t } = useTranslation("transfer");
  const scenarioName = scenarioWordsKey(scenario);
  // While the money is not confirmed yet, support needs something to look the transfer up by.
  const moneyNotConfirmedYet =
    MONEY_STATE_BY_OUTCOME[scenario] === MoneyState.NotConfirmedYet;
  const outcomeHeading = t(`result.heading.${scenarioName}`);
  const outcomeBody = t(`common.${scenarioName}.body`, {
    amount: transfer && formatMoney(transfer.amount),
    name: transfer?.counterparty.registeredName,
  });
  const screenOnTop = useIsScreenOnTop();
  // Never the outcome the page opens with: the heading's focus reads that, and announcing it too says it twice.
  // One that changes while the screen is covered waits until it is back on top.
  const spokenScenarioRef = useRef(scenario);
  useEffect(() => {
    if (!screenOnTop || spokenScenarioRef.current === scenario) return;
    spokenScenarioRef.current = scenario;
    AccessibilityInfo.announceForAccessibility(
      t("result.outcome_announcement", {
        heading: outcomeHeading,
        body: outcomeBody,
      }),
    );
  }, [scenario, outcomeHeading, outcomeBody, t, screenOnTop]);

  return (
    <>
      <TextHeading autoFocus={pageOpened}>{outcomeHeading}</TextHeading>
      <TextBody>{outcomeBody}</TextBody>
      {moneyNotConfirmedYet && (
        <TextBody tone="secondary">
          {t("result.reference_to_quote", {
            reference: transfer?.reference ?? transferId,
          })}
        </TextBody>
      )}
    </>
  );
}
