import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  getListTransfersOptions,
  resetTransferHistory,
  useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferAccordion from "./components/SectionTransferAccordion/SectionTransferAccordion";

export default function TransferHistoryScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const transferHistory = useListTransfers();
  // Each open fetches the newest page: people check here before paying again. Not on a cold cache, whose own
  // first fetch is that page: a reset would cancel it and ask twice.
  useEffect(() => {
    if (
      queryClient.getQueryData(getListTransfersOptions().queryKey) !== undefined
    )
      void resetTransferHistory(queryClient);
  }, [queryClient]);

  return (
    <>
      <Stack.Screen options={{ title: t("history.title") }} />
      {transferHistory.isPending ? (
        <Loader />
      ) : transferHistory.isLoadingError || transferHistory.isRefetchError ? (
        // A failed refresh too: its cached rows would be a list that may be stale, passing as current.
        <ViewScreenFrame
          footer={
            <ButtonPrimary
              label={t("history.try_again")}
              onPress={() => {
                void resetTransferHistory(queryClient);
              }}
            />
          }
        >
          <BannerNotice
            tone="negative"
            message={t("history.first_page_failed")}
          />
        </ViewScreenFrame>
      ) : transferHistory.data.transfers.length === 0 ? (
        <ViewMessage
          title={t("history.empty.title")}
          message={t("history.empty.body")}
          actions={undefined}
        />
      ) : (
        <SectionTransferAccordion transferHistory={transferHistory} />
      )}
    </>
  );
}
