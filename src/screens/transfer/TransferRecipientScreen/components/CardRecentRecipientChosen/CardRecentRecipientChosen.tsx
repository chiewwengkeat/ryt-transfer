import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useTranslation } from "react-i18next";

interface Props {
  recent: ListRecentRecipientsResponse["items"][number];
  onChange: () => void;
}
export default function CardRecentRecipientChosen({ recent, onChange }: Props) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferScenarioId.RecentRecipientChosen);
  return (
    <Card>
      <TextBody strong>{recent.registeredName}</TextBody>
      <TextBody tone="secondary">
        {`${recent.bankName} · ${recent.idValueMasked}`}
      </TextBody>
      <TextBody>{t("common.recent_recipient_chosen.body")}</TextBody>
      <ButtonSecondary
        label={t("card_recent_recipient_chosen.change")}
        onPress={onChange}
      />
    </Card>
  );
}
