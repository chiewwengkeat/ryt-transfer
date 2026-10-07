import {
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  type ReactNode,
} from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import FieldText from "@/shared/ui/FieldText/FieldText";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import { BottomSheetHostContext } from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";

interface Props {
  title: string;
  onClose: () => void;
  closeLabel: string;
  dismissable?: boolean;
  searchField?: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
  };
  children: ReactNode;
}
export default function BottomSheetFrame({
  title,
  onClose,
  closeLabel,
  dismissable = true,
  searchField,
  children,
}: Props) {
  const sheetHost = use(BottomSheetHostContext);
  if (sheetHost === null)
    throw new Error(
      "BottomSheetFrame draws only inside a ViewBottomSheetHost.",
    );
  const sheetId = useId();
  const { top, bottom } = useSafeAreaInsets();

  const closeOnBack = useEffectEvent(() => {
    if (dismissable) onClose();
  });
  // Consumed even when it cannot close: Back must never move the screen hidden behind the sheet.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        closeOnBack();
        return true;
      },
    );
    return () => {
      subscription.remove();
    };
  }, []);

  // Every render, before paint: a controlled field drawn in the host must never lag its value.
  useLayoutEffect(() => {
    sheetHost.showSheet(
      sheetId,
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={styles.sheetLayer}
      >
        <Pressable
          accessible={false}
          disabled={!dismissable}
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior="padding"
          style={[styles.keyboardClear, { paddingTop: top + spacing.lg }]}
        >
          <Animated.View
            entering={SlideInDown}
            style={[styles.panel, { paddingBottom: bottom + spacing.md }]}
          >
            <View style={styles.header}>
              <View style={styles.title}>
                <TextHeading autoFocus>{title}</TextHeading>
              </View>
              {dismissable && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeMark}>✕</Text>
                </Pressable>
              )}
            </View>
            {searchField !== undefined && (
              <FieldText {...searchField} autoCorrect={false} />
            )}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>,
    );
  });
  useLayoutEffect(
    () => () => {
      sheetHost.hideSheet(sheetId);
    },
    [sheetHost, sheetId],
  );

  return null;
}

const styles = StyleSheet.create({
  sheetLayer: StyleSheet.absoluteFill,
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.textPrimary,
    opacity: 0.5,
  },
  keyboardClear: {
    flex: 1,
    justifyContent: "flex-end",
    pointerEvents: "box-none",
  },
  panel: {
    flexShrink: 1,
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1 },
  closeButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  closeMark: { ...typography.heading, color: colors.textPrimary },
  body: { flexShrink: 1 },
  bodyContent: { gap: spacing.sm },
});
