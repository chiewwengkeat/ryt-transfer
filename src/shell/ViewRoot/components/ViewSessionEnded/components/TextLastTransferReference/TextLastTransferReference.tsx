import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferOptions,
  outcomeOfTransfer,
  TransferOutcomeScenario,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { listPendingTransfers } from "@/domains/transfer/hooks/pending-transfers";
import { reportError } from "@/shared/observability/observability";
import TextBody from "@/shared/ui/TextBody/TextBody";

export default function TextLastTransferReference() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const [reference, setReference] = useState<string>();

  useEffect(() => {
    // From the cache only: with the session ended, every request answers 401.
    const customerId = queryClient.getQueryData(
      getPrimaryAccountOptions().queryKey,
    )?.customerId;
    if (customerId === undefined) return;
    listPendingTransfers(customerId)
      .then((records) => {
        const [lastChecked] = records
          .map(({ transferId, createdAt }) => ({
            transferId,
            createdAt,
            transfer: queryClient.getQueryData(
              getTransferOptions(transferId).queryKey,
            ),
          }))
          .filter(({ transfer }) => {
            const outcome = transfer && outcomeOfTransfer(transfer);
            // A record can outlast its check: one whose money the bank has confirmed is not being checked.
            return !(
              outcome &&
              [
                TransferOutcomeScenario.Completed,
                TransferOutcomeScenario.FraudBlocked,
                TransferOutcomeScenario.RecipientAccountInactive,
                TransferOutcomeScenario.RefundedAfterProcessing,
                TransferOutcomeScenario.BalanceOrLimitShortAtApproval,
                TransferOutcomeScenario.ApprovalExpired,
              ].includes(outcome)
            );
          })
          .sort(
            (newer, older) =>
              Date.parse(older.createdAt) - Date.parse(newer.createdAt),
          );
        if (lastChecked)
          setReference(
            lastChecked.transfer?.reference ?? lastChecked.transferId,
          );
      })
      .catch((error: unknown) => {
        reportError(error, { boundary: "session_ended_reference" });
      });
  }, [queryClient]);

  return (
    reference !== undefined && (
      <TextBody tone="secondary">
        {t("common.session_ended.reference", { reference })}
      </TextBody>
    )
  );
}
