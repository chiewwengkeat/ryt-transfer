import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useRetryKeepingFailure } from "@/shared/hooks/use-retry-keeping-failure/use-retry-keeping-failure";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import { useIsOffline } from "@/shared/platform/offline/offline";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

interface Props {
  startTransferDisabledReason: string | undefined;
}
export default function SectionRecentRecipientsHome({
  startTransferDisabledReason,
}: Props) {
  const { t } = useTranslation("transfer");
  const recents = useListRecentRecipients();
  const { failure: recentsFailure, retry: readRecentsAgain } =
    useRetryKeepingFailure(recents.error, () => recents.refetch());
  // Transfer's offline line already explains a list that cannot load.
  const offline = useIsOffline();

  return (
    <>
      {recentsFailure !== null && !offline && (
        <BannerAction
          key={recents.errorUpdatedAt}
          tone="negative"
          announce={!isSessionEndFailure(recentsFailure)}
          message={t("common.start_unexpected.body")}
          action={{
            label: t("common.start_unexpected.retry"),
            onPress: readRecentsAgain,
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
