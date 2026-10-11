import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { useIsOffline } from "@/shared/http/offline/offline";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

interface Props {
  startTransferDisabledReason: string | undefined;
}
export default function SectionRecentRecipientsHome({
  startTransferDisabledReason,
}: Props) {
  const { t } = useTranslation("transfer");
  const recents = useListRecentRecipients();
  const recentsFailure = useQueryError(
    recents.error,
    recents.fetchStatus !== "idle",
  );
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
            onPress: () => recents.refetch({ cancelRefetch: false }),
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
