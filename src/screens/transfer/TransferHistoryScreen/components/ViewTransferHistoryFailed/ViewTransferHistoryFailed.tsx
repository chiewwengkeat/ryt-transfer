import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

interface Props {
  errorUpdatedAt: number;
  announce: boolean;
}
export default function ViewTransferHistoryFailed({
  errorUpdatedAt,
  announce,
}: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();

  const doesPhoneReportConnection = usePhoneReportsConnection();

  return (
    <ViewScreenFrame
      footer={
        doesPhoneReportConnection ? (
          <ButtonPrimary
            label={t("view_transfer_history_failed.retry")}
            onPress={() => resetTransferHistory(queryClient)}
          />
        ) : (
          <TextOffline />
        )
      }
    >
      <BannerNotice
        key={errorUpdatedAt}
        tone="negative"
        announce={announce}
        message={t("view_transfer_history_failed.message")}
      />
    </ViewScreenFrame>
  );
}
