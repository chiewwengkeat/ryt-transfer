import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, minTouchTarget, typography } from "@/shared/theme/theme";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";

interface Props {
  contactMobiles: {
    id: string;
    label?: string;
    number?: string;
    mobileId: string;
  }[];
  onMobileChosen: (mobileId: string) => void;
  onClose: () => void;
}
export default function BottomSheetContactMobiles({
  contactMobiles,
  onMobileChosen,
  onClose,
}: Props) {
  const { t } = useTranslation("transfer");
  return (
    <BottomSheetFrame
      title={t("recipient.contact_mobiles_title")}
      closeLabel={t("recipient.close_sheet")}
      onClose={onClose}
    >
      {contactMobiles.map((contactMobile) => (
        <Pressable
          key={contactMobile.id}
          accessibilityRole="button"
          onPress={() => {
            onMobileChosen(contactMobile.mobileId);
          }}
          style={styles.mobile}
        >
          <Text style={styles.label}>{contactMobile.label}</Text>
          <Text style={styles.number}>{contactMobile.number}</Text>
        </Pressable>
      ))}
    </BottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  mobile: { minHeight: minTouchTarget, justifyContent: "center" },
  label: { ...typography.label, color: colors.textSecondary },
  number: { ...typography.body, color: colors.textPrimary },
});
