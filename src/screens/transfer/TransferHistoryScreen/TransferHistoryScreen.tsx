import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import {
  getListTransfersOptions,
  resetTransferHistory,
  useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { colors, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerOutOfDate from "../components/BannerOutOfDate/BannerOutOfDate";
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
      <Stack.Screen
        options={{
          title: t("history.title"),
          // First in its own stack, the root header that would go back hidden over it; a link can open it with nothing beneath.
          headerLeft: (props) => (
            <HeaderBackButton
              {...props}
              displayMode="minimal"
              accessibilityLabel={t("history.home")}
              onPress={() => {
                router.dismissTo("/");
              }}
            />
          ),
        }}
      />
      {transferHistory.isPending && !transferHistory.isPaused ? (
        <Loader />
      ) : transferHistory.data === undefined ? (
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
      ) : (
        <View style={styles.history}>
          {/* A failure from an earlier visit is not this one's: shown on reopening, it would be announced as current. */}
          {((transferHistory.isRefetchError &&
            transferHistory.isFetchedAfterMount) ||
            transferHistory.isPaused) && (
            <View style={styles.outOfDate}>
              <BannerOutOfDate
                message={t("history.out_of_date")}
                tryAgainLabel={t("history.try_again")}
                onTryAgain={() => {
                  void resetTransferHistory(queryClient);
                }}
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
