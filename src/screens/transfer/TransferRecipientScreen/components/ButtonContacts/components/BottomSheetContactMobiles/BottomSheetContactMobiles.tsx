import { colors, minTouchTarget, typography } from "@/shared/theme/theme";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

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
  const { t, i18n } = useTranslation("transfer");
  return (
    <BottomSheetFrame
      title={t("bottom_sheet_contact_mobiles.title")}
      closeLabel={t("common.close_sheet")}
      onClose={onClose}
    >
      {contactMobiles.map((contactMobile) => (
        <Pressable
          key={contactMobile.id}
          accessibilityRole="button"
          accessibilityLanguage={i18n.language}
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
