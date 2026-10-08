import { useTranslation } from "react-i18next";

import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { useTrackScenarioShown } from "@/shared/observability/observability";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  recent: ListRecentRecipientsResponse["items"][number];
  onChange: () => void;
}
export default function CardRecentRecipientChosen({ recent, onChange }: Props) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferFlowScenario.RecentRecipientChosen);
  return (
    <Card>
      <TextBody strong>{recent.registeredName}</TextBody>
      <TextBody tone="secondary">
        {`${recent.bankName} · ${recent.idValueMasked}`}
      </TextBody>
      <TextBody>{t("common.recent_recipient_chosen.body")}</TextBody>
      <ButtonSecondary
        label={t("recipient.change_recent")}
        onPress={onChange}
      />
    </Card>
  );
}
