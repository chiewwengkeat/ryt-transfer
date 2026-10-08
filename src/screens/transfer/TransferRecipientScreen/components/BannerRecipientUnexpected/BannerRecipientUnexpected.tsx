import { useTranslation } from "react-i18next";

import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  onRetry: () => void;
}
export default function BannerRecipientUnexpected({ onRetry }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <>
      <BannerNotice
        tone="negative"
        message={t("common.recipient_unexpected.body")}
      />
      <ButtonSecondary
        label={t("common.recipient_unexpected.retry")}
        onPress={onRetry}
      />
    </>
  );
}
