import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet } from "react-native";

import { colors, minTouchTarget } from "@/shared/theme/theme";
import Card from "@/shared/ui/Card/Card";

interface Props {
  children: ReactNode;
  onPress: () => void;
  disabledReason?: string;
  styles?: {
    main?: StyleProp<ViewStyle>;
  };
}
export default function CardPressable({
  children,
  onPress,
  disabledReason,
  styles: propStyles,
}: Props) {
  const { i18n } = useTranslation();
  const disabled = disabledReason !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={disabledReason}
      // On the card, not its texts: the screen reader reads the card as one element, in the card's language.
      accessibilityLanguage={i18n.language}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={propStyles?.main}
    >
      {({ pressed }) => (
        <Card styles={{ main: [styles.card, pressed && styles.cardPressed] }}>
          {children}
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: minTouchTarget, justifyContent: "center" },
  cardPressed: { backgroundColor: colors.surfacePressed, opacity: 0.8 },
});
