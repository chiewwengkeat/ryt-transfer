import { useTranslation } from "react-i18next";

import { signWithBiometricKey } from "@/domains/approval/hooks/approval-keys";
import { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { formatMoney } from "@/shared/lib/money/money";
import type { Money } from "@/shared/lib/money/money.type";

export function useSignTransferApproval() {
  const { t } = useTranslation("transfer");
  return (
    approval: Parameters<typeof buildSignedApprovalText>[0] & { amount: Money },
  ) =>
    signWithBiometricKey(buildSignedApprovalText(approval), {
      title: t("review.prompt_title"),
      subtitle: t("review.prompt_subtitle", {
        amount: formatMoney(approval.amount),
        name: approval.registeredName,
      }),
      cancel: t("review.prompt_cancel"),
    });
}
