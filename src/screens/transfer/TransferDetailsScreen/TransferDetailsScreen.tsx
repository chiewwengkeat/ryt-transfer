import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { TransportError } from "@/shared/http/transport-error";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import { useGetTransferWithHistoryPlaceholder } from "./hooks/use-get-transfer-with-history-placeholder";

export default function TransferDetailsScreen() {
  const { t } = useTranslation("transfer");
  const { transferId } = useLocalSearchParams<{ transferId: string }>();
  const transfer = useGetTransferWithHistoryPlaceholder(transferId);

  return (
    <>
      <Stack.Screen options={{ title: t("details.title") }} />
      {transfer.data ? (
        <ViewScreenFrame>
          <SectionTransferDetails transfer={transfer.data} />
        </ViewScreenFrame>
      ) : transfer.error instanceof TransportError &&
        transfer.error.code === GetTransferErrorCode.TransferNotFound ? (
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
      ) : transfer.isError ? (
        <ViewScreenFrame
          footer={
            <ButtonPrimary
              label={t("details.try_again")}
              onPress={() => {
                void transfer.refetch();
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
