import {
  resetTransferHistory,
  type useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import BannerOutOfDate from "@/screens/transfer/components/BannerOutOfDate/BannerOutOfDate";
import { colors, spacing } from "@/shared/theme/theme";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import SectionTransferAccordion from "./components/SectionTransferAccordion/SectionTransferAccordion";

interface Props {
  transferHistory: ReturnType<typeof useListTransfers>;
  didRefreshFail: boolean;
  announce: boolean;
}
export default function ViewTransferHistory({
  transferHistory,
  didRefreshFail,
  announce,
}: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();

  return (
    <View style={styles.main}>
      {(didRefreshFail || transferHistory.isPaused) && (
        <View style={styles.outOfDate}>
          <BannerOutOfDate
            announce={announce}
            message={t("view_transfer_history.out_of_date")}
            tryAgainLabel={t("view_transfer_history.retry")}
            onTryAgain={() => resetTransferHistory(queryClient)}
          />
        </View>
      )}
      {transferHistory.data?.transfers.length === 0 ? (
        <ViewMessage
          title={t("view_transfer_history.empty.title")}
          message={t("view_transfer_history.empty.body")}
          actions={undefined}
        />
      ) : (
        <SectionTransferAccordion transferHistory={transferHistory} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  outOfDate: { padding: spacing.md, backgroundColor: colors.background },
});
