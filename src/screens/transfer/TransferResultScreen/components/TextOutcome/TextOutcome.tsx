import {
  type TransferOutcomeScenario,
  type useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { scenarioWordsKey } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
} from "@/screens/transfer/lib/transfer-money-state/transfer-money-state";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { formatMoney } from "@/shared/lib/money/money";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, StyleSheet } from "react-native";

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

  const spokenScenarioRef = useRef(scenario);
  const isScreenOnTop = useIsScreenOnTop();

  const scenarioName = scenarioWordsKey(scenario);
  const headingOutcome = t(`text_outcome.heading.${scenarioName}`);
  const bodyOutcome = t(`common.${scenarioName}.body`, {
    amount: transfer && formatMoney(transfer.amount),
    name: transfer?.counterparty.registeredName,
  });

  // Never the outcome the page opens with: the heading's focus reads that, and announcing it too says it twice.
  // One that changes while the screen is covered waits until it is back on top.
  useEffect(() => {
    if (!isScreenOnTop || spokenScenarioRef.current === scenario) return;
    spokenScenarioRef.current = scenario;
    AccessibilityInfo.announceForAccessibility(
      t("text_outcome.announcement", {
        heading: headingOutcome,
        body: bodyOutcome,
      }),
    );
  }, [scenario, headingOutcome, bodyOutcome, t, isScreenOnTop]);

  return (
    <>
      <TextHeading style={styles.textHeading} autoFocus={pageOpened}>
        {headingOutcome}
      </TextHeading>
      <TextBody style={styles.textBody}>{bodyOutcome}</TextBody>
      {/* While the money is not confirmed yet, support needs something to look the transfer up by. */}
      {MONEY_STATE_BY_OUTCOME[scenario] === MoneyState.NotConfirmedYet && (
        <TextBody tone="secondary" style={styles.textBody}>
          {t("text_outcome.reference_to_quote", {
            reference: transfer?.reference ?? transferId,
          })}
        </TextBody>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  textHeading: {
    textAlign: "center",
  },
  textBody: {
    textAlign: "center",
  },
});
