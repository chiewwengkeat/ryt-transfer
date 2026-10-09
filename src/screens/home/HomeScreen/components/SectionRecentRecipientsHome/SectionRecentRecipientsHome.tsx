import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { isSessionEndFailure } from "@/shared/http/transport-error";
import { useIsOffline } from "@/shared/platform/offline";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

import { useStartTransferDisabledReason } from "../../hooks/use-start-transfer-disabled-reason";

export default function SectionRecentRecipientsHome() {
  const { t } = useTranslation("transfer");
  const recents = useListRecentRecipients();
  // The shell's offline notice already explains a list that cannot load.
  const offline = useIsOffline();
  const startTransferDisabledReason = useStartTransferDisabledReason();

  return (
    <>
      {recents.isError && !offline && (
        <BannerAction
          tone="negative"
          announce={!isSessionEndFailure(recents.error)}
          message={t("common.start_unexpected.body")}
          action={{
            label: t("common.start_unexpected.retry"),
            onPress: () => {
              void recents.refetch();
            },
          }}
        />
      )}
      <SectionRecentRecipients
        disabledReason={startTransferDisabledReason}
        onRecentChosen={(recentId) => {
          router.push({ pathname: "/transfer", params: { recentId } });
        }}
      />
    </>
  );
}
