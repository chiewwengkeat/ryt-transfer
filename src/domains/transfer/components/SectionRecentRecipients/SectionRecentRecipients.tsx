import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
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
    <View style={styles.section}>
      <TextHeading>{t("recents.title")}</TextHeading>
      {recents.data.map((recent) => (
        <Pressable
          key={recent.recentId}
          accessibilityRole="button"
          accessibilityHint={disabledReason}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            onRecentChosen(recent.recentId);
          }}
          style={styles.recent}
        >
          <Text style={[styles.name, disabled && styles.nameDisabled]}>
            {recent.registeredName}
          </Text>
          <Text style={styles.account}>
            {`${recent.bankName} · ${recent.idValueMasked}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  recent: { minHeight: minTouchTarget, justifyContent: "center" },
  name: { ...typography.label, color: colors.textPrimary },
  nameDisabled: { color: colors.textSecondary },
  account: { ...typography.body, color: colors.textSecondary },
});
