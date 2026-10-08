import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

import {
  type TransferOutcomeScenario,
  type useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
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
}
export default function TextOutcome({ scenario, transfer, transferId }: Props) {
  const { t } = useTranslation("transfer");
  const scenarioName = scenario.replace(
    /^transfer\./,
    "",
  ) as `${TransferOutcomeScenario}` extends `transfer.${infer Name}`
    ? Name
    : never;
  // While the money is not confirmed yet, support needs something to look the transfer up by.
  const moneyNotConfirmedYet =
    MONEY_STATE_BY_OUTCOME[scenario] === MoneyState.NotConfirmedYet;
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object>>>();
  const [pageOpened, setPageOpened] = useState(false);
  // Asked while the page opens, the heading's focus loses to the reader's own, which lands on the header after.
  useEffect(
    () =>
      navigation.addListener("transitionEnd", ({ data }) => {
        if (!data.closing) setPageOpened(true);
      }),
    [navigation],
  );
  const outcomeHeading = t(`result.heading.${scenarioName}`);
  const outcomeBody = t(`common.${scenarioName}.body`, {
    amount: transfer && formatMoney(transfer.amount),
    name: transfer?.counterparty.registeredName,
  });
  // Never the outcome the page opens with: the heading's focus reads that, and announcing it too says it twice.
  const spokenScenarioRef = useRef(scenario);
  useEffect(() => {
    if (spokenScenarioRef.current === scenario) return;
    spokenScenarioRef.current = scenario;
    AccessibilityInfo.announceForAccessibility(
      t("result.outcome_announcement", {
        heading: outcomeHeading,
        body: outcomeBody,
      }),
    );
  }, [scenario, outcomeHeading, outcomeBody, t]);

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
