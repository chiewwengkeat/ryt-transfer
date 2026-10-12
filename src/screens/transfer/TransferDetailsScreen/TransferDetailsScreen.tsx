import { useGetTransferWithHistoryPlaceholder } from "@/domains/transfer/api/get-transfer/get-transfer";
import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import BannerOutOfDate from "@/screens/transfer/components/BannerOutOfDate/BannerOutOfDate";
import SectionTransferDetails from "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails";
import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import {
  isSessionEndFailure,
  TransportError,
} from "@/shared/http/transport-error/transport-error";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

export default function TransferDetailsScreen() {
  const { t } = useTranslation("transfer");
  const { transferId } = useLocalSearchParams<{ transferId: string }>();

  const { transferQuery, transfer } =
    useGetTransferWithHistoryPlaceholder(transferId);
  const doesPhoneReportConnection = usePhoneReportsConnection();
  const failure = useQueryError(
    transferQuery.error,
    transferQuery.fetchStatus !== "idle",
  );

  const isFailureSessionEnd = isSessionEndFailure(failure);

  function readAgain() {
    return transferQuery.refetch({ cancelRefetch: false });
  }

  const content = (() => {
    if (
      failure instanceof TransportError &&
      failure.code === GetTransferErrorCode.TransferNotFound
    )
      return (
        <ViewScreenFrame
          footer={
            <ButtonPrimary label={t("details.back")} onPress={router.back} />
          }
        >
          <BannerNotice tone="negative" message={t("details.not_found")} />
        </ViewScreenFrame>
      );
    if (transfer)
      return (
        <ViewScreenFrame>
          {/* A failure from an earlier visit is not this one's: shown on reopening, it would be announced as current. */}
          {((failure !== null && transferQuery.isFetchedAfterMount) ||
            transferQuery.isPaused) && (
            <BannerOutOfDate
              // Remounted per failure, so a press that fails again says so again.
              key={transferQuery.errorUpdatedAt}
              announce={!isFailureSessionEnd}
              message={t("details.out_of_date")}
              tryAgainLabel={t("details.retry")}
              onTryAgain={readAgain}
            />
          )}
          <SectionTransferDetails transfer={transfer} />
        </ViewScreenFrame>
      );
    if (failure !== null || transferQuery.isPaused)
      return (
        <ViewScreenFrame
          footer={
            doesPhoneReportConnection ? (
              <ButtonPrimary label={t("details.retry")} onPress={readAgain} />
            ) : (
              <TextOffline />
            )
          }
        >
          <BannerNotice
            key={transferQuery.errorUpdatedAt}
            tone="negative"
            announce={!isFailureSessionEnd}
            message={t("details.failed")}
          />
        </ViewScreenFrame>
      );
    return <Loader />;
  })();
  return (
    <>
      <Stack.Screen options={{ title: t("details.title") }} />
      {content}
    </>
  );
}
