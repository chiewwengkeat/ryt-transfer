import { useTranslation } from "react-i18next";

import { signWithBiometricKey } from "@/domains/approval/hooks/approval-keys";
import { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";

export function useSignTransferApproval() {
  const { t } = useTranslation("transfer");
  return (approval: Parameters<typeof buildSignedApprovalText>[0]) =>
    signWithBiometricKey(buildSignedApprovalText(approval), {
      title: t("review.prompt_title"),
      cancel: t("review.prompt_cancel"),
    });
}
