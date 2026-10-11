import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { useIsOffline } from "@/shared/http/offline/offline";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { useTranslation } from "react-i18next";

export default function BannerRecentRecipientsFailed() {
  const { t } = useTranslation("transfer");

  const recents = useListRecentRecipients();
  const failure = useQueryError(recents.error, recents.fetchStatus !== "idle");
  // Transfer's offline line already explains a list that cannot load.
  const isOffline = useIsOffline();

  if (failure === null || isOffline) return null;

  return (
    <BannerAction
      key={recents.errorUpdatedAt}
      tone="negative"
      announce={!isSessionEndFailure(failure)}
      message={t("common.start_unexpected.body")}
      action={{
        label: t("common.start_unexpected.retry"),
        onPress: () => recents.refetch({ cancelRefetch: false }),
      }}
    />
  );
}
