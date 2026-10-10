import { hashKey, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import {
  getListTransfersOptions,
  isTransferHistoryCached,
  resetTransferHistory,
  trimTransferHistory,
  useListTransfers,
  wasNewestTransferHistoryPageReadWithin,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { useRetryKeepingFailure } from "@/shared/hooks/use-retry-keeping-failure/use-retry-keeping-failure";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import { colors, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerOutOfDate from "@/screens/transfer/components/BannerOutOfDate/BannerOutOfDate";
import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import SectionTransferAccordion from "./components/SectionTransferAccordion/SectionTransferAccordion";

export default function TransferHistoryScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const transferHistory = useListTransfers();
  const phoneReportsConnection = usePhoneReportsConnection();
  const { failure: historyFailure, retry: readFirstPageAgain } =
    useRetryKeepingFailure(transferHistory.error, () =>
      resetTransferHistory(queryClient),
    );
  const failureIsSessionEnd = isSessionEndFailure(historyFailure);
  // Clear on each open: a failure left from an earlier visit would be announced as this one's.
  const [refreshFailed, setRefreshFailed] = useState(false);
  // The query keeps one status, which a page fetch after a failed refresh overwrites: only a refresh's outcome counts.
  useEffect(() => {
    const historyQueryHash = hashKey(getListTransfersOptions().queryKey);
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.query.queryHash !== historyQueryHash ||
        event.query.state.fetchMeta?.fetchMore
      )
        return;
      if (event.action.type === "error") setRefreshFailed(true);
      // A cache write, a reset's own trim among them, is no refresh.
      else if (event.action.type === "success" && !event.action.manual)
        setRefreshFailed(false);
    });
  }, [queryClient]);
  // Decision 009: within 30 s of the newest page's read, a back-and-forth asks nothing; later, someone checking here
  // before paying again needs it read again. Never on a cold cache: a reset would cancel its first fetch and ask twice.
  useEffect(() => {
    if (
      isTransferHistoryCached(queryClient) &&
      !wasNewestTransferHistoryPageReadWithin(queryClient, 30_000)
    )
      void resetTransferHistory(queryClient);
    // An open draws every cached page at once, so 200 transfers bound it.
    return () => {
      trimTransferHistory(queryClient, 200);
    };
  }, [queryClient]);

  return (
    <>
      <Stack.Screen options={{ title: t("history.title") }} />
      {transferHistory.isPending &&
      !transferHistory.isPaused &&
      historyFailure === null ? (
        <Loader />
      ) : transferHistory.data === undefined ? (
        <ViewScreenFrame
          footer={
            phoneReportsConnection ? (
              <ButtonPrimary
                label={t("history.retry")}
                onPress={readFirstPageAgain}
              />
            ) : (
              <TextOffline />
            )
          }
        >
          <BannerNotice
            key={transferHistory.errorUpdatedAt}
            tone="negative"
            announce={!failureIsSessionEnd}
            message={t("history.first_page_failed")}
          />
        </ViewScreenFrame>
      ) : (
        <View style={styles.history}>
          {(refreshFailed || transferHistory.isPaused) && (
            <View style={styles.outOfDate}>
              <BannerOutOfDate
                announce={!failureIsSessionEnd}
                message={t("history.out_of_date")}
                tryAgainLabel={t("history.retry")}
                onTryAgain={() => resetTransferHistory(queryClient)}
              />
            </View>
          )}
          {transferHistory.data.transfers.length === 0 ? (
            <ViewMessage
              title={t("history.empty.title")}
              message={t("history.empty.body")}
              actions={undefined}
            />
          ) : (
            <SectionTransferAccordion transferHistory={transferHistory} />
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  history: { flex: 1 },
  outOfDate: { padding: spacing.md, backgroundColor: colors.background },
});
