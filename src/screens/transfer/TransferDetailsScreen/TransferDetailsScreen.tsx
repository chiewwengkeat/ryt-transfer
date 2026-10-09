import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  isSessionEndFailure,
  TransportError,
} from "@/shared/http/transport-error/transport-error";
import { usePhoneReportsConnection } from "@/shared/platform/offline/offline";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerOutOfDate from "../components/BannerOutOfDate/BannerOutOfDate";
import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import { useGetTransferWithHistoryPlaceholder } from "./hooks/use-get-transfer-with-history-placeholder/use-get-transfer-with-history-placeholder";

export default function TransferDetailsScreen() {
  const { t } = useTranslation("transfer");
  const { transferId } = useLocalSearchParams<{ transferId: string }>();
  const { transferQuery, transfer } =
    useGetTransferWithHistoryPlaceholder(transferId);
  const phoneReportsConnection = usePhoneReportsConnection();
  const failureIsSessionEnd = isSessionEndFailure(transferQuery.error);

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
            <BannerOutOfDate
              announce={!failureIsSessionEnd}
              message={t("details.out_of_date")}
              tryAgainLabel={t("details.retry")}
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
            phoneReportsConnection ? (
              <ButtonPrimary
                label={t("details.retry")}
                onPress={() => {
                  void transferQuery.refetch();
                }}
              />
            ) : undefined
          }
        >
          <BannerNotice
            tone="negative"
            announce={!failureIsSessionEnd}
            message={t("details.failed")}
          />
        </ViewScreenFrame>
      ) : (
        <Loader />
      )}
    </>
  );
}
