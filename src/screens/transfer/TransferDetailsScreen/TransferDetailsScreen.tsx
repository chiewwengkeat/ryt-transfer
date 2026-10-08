import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { TransportError } from "@/shared/http/transport-error";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import BannerDetailsOutOfDate from "./components/BannerDetailsOutOfDate/BannerDetailsOutOfDate";
import { useGetTransferWithHistoryPlaceholder } from "./hooks/use-get-transfer-with-history-placeholder";

export default function TransferDetailsScreen() {
  const { t } = useTranslation("transfer");
  const { transferId } = useLocalSearchParams<{ transferId: string }>();
  const { transferQuery, transfer } =
    useGetTransferWithHistoryPlaceholder(transferId);

  return (
    <>
      <Stack.Screen options={{ title: t("details.title") }} />
      {transferQuery.error instanceof TransportError &&
      transferQuery.error.code === GetTransferErrorCode.TransferNotFound ? (
        <ViewScreenFrame
          footer={
            <ButtonPrimary
              label={t("details.back")}
              onPress={() => {
                router.back();
              }}
            />
          }
        >
          <BannerNotice tone="negative" message={t("details.not_found")} />
        </ViewScreenFrame>
      ) : transfer ? (
        <ViewScreenFrame>
          {/* A failure from an earlier visit is not this one's: shown on reopening, it would be announced as current. */}
          {((transferQuery.isError && transferQuery.isFetchedAfterMount) ||
            transferQuery.isPaused) && (
            <BannerDetailsOutOfDate
              onTryAgain={() => {
                void transferQuery.refetch();
              }}
            />
          )}
          <SectionTransferDetails transfer={transfer} />
        </ViewScreenFrame>
      ) : transferQuery.isError || transferQuery.isPaused ? (
        <ViewScreenFrame
          footer={
            <ButtonPrimary
              label={t("details.try_again")}
              onPress={() => {
                void transferQuery.refetch();
              }}
            />
          }
        >
          <BannerNotice tone="negative" message={t("details.failed")} />
        </ViewScreenFrame>
      ) : (
        <Loader />
      )}
    </>
  );
}
