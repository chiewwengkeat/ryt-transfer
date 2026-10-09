import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { colors, spacing, typography } from "@/shared/theme/theme";
import CardPressable from "@/shared/ui/CardPressable/CardPressable";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";

interface Props {
  onRecentChosen: (recentId: string) => void;
  disabledReason?: string;
}
export default function SectionRecentRecipients({
  onRecentChosen,
  disabledReason,
}: Props) {
  const { t } = useTranslation("transfer");
  const recents = useListRecentRecipients();
  // A shortcut only: while it loads or when it fails, the screen works without it.
  if (recents.data === undefined || recents.data.length === 0) return null;
  const disabled = disabledReason !== undefined;

  return (
    <View style={styles.main}>
      <TextHeading>{t("section_recent_recipients.title")}</TextHeading>
      <View style={styles.sectionList}>
        {recents.data.map((recent) => (
          <CardPressable
            key={recent.recentId}
            disabledReason={disabledReason}
            onPress={() => {
              onRecentChosen(recent.recentId);
            }}
          >
            <Text style={[styles.name, disabled && styles.nameDisabled]}>
              {recent.registeredName}
            </Text>
            <Text style={styles.account}>
              {`${recent.bankName} · ${recent.idValueMasked}`}
            </Text>
          </CardPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.md },
  sectionList: {
    gap: spacing.sm,
  },
  name: { ...typography.label, color: colors.textPrimary },
  nameDisabled: { color: colors.textSecondary },
  account: { ...typography.body, color: colors.textSecondary },
});
