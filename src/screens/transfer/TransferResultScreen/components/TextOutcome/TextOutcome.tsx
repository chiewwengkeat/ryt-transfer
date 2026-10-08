import { useTranslation } from "react-i18next";

import {
  TransferOutcomeScenario,
  type useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { formatMoney } from "@/shared/lib/money/money";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";

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
  // Every other outcome leaves the money not confirmed yet, so support needs something to look it up by.
  const moneyConfirmed = [
    TransferOutcomeScenario.Completed,
    TransferOutcomeScenario.FraudBlocked,
    TransferOutcomeScenario.RecipientAccountInactive,
    TransferOutcomeScenario.RefundedAfterProcessing,
    TransferOutcomeScenario.BalanceOrLimitShortAtApproval,
    TransferOutcomeScenario.ApprovalExpired,
  ].includes(scenario);

  return (
    <>
      <TextHeading autoFocus>{t(`result.heading.${scenarioName}`)}</TextHeading>
      <TextBody>
        {t(`common.${scenarioName}.body`, {
          amount: transfer && formatMoney(transfer.amount),
          name: transfer?.counterparty.registeredName,
        })}
      </TextBody>
      {!moneyConfirmed && (
        <TextBody tone="secondary">
          {t("result.reference_to_quote", {
            reference: transfer?.reference ?? transferId,
          })}
        </TextBody>
      )}
    </>
  );
}
