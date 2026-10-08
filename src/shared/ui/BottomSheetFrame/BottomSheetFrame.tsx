import {
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  Keyboard,
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
  ReduceMotion,
  SlideInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhoneReducesMotion } from "@/shared/platform/reduce-motion";
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
  const searchFieldFocusedRef = useRef(false);
  const sheetLayerRef = useRef<View>(null);
  const [sheetLayerTopInWindow, setSheetLayerTopInWindow] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  const { i18n } = useTranslation();
  const sheetReduceMotion = usePhoneReducesMotion()
    ? ReduceMotion.Always
    : ReduceMotion.Never;

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
        ref={sheetLayerRef}
        onLayout={() => {
          sheetLayerRef.current?.measureInWindow((_x, y) => {
            setSheetLayerTopInWindow(y);
          });
        }}
        entering={FadeIn.reduceMotion(sheetReduceMotion)}
        exiting={FadeOut.reduceMotion(sheetReduceMotion)}
        // Handled even when it cannot close, as Back is: iOS hands an unhandled escape on up to what holds the sheet.
        onAccessibilityEscape={() => {
          if (dismissable) onClose();
        }}
        style={styles.sheetLayer}
      >
        {/* Hidden too: TalkBack stops on any pressable view whatever `accessible` says. ✕ and Back still close. */}
        <Pressable
          accessible={false}
          aria-hidden
          disabled={!dismissable}
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior="padding"
          // The keyboard's top is a window position, and it covers the panel's inset padding: neither needs clearing.
          keyboardVerticalOffset={sheetLayerTopInWindow - bottom}
          style={[styles.keyboardClear, { paddingTop: top + spacing.lg }]}
        >
          <Animated.View
            entering={SlideInDown.reduceMotion(sheetReduceMotion)}
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
                  // On the button, not its ✕: the screen reader reads the button as one element, in its language.
                  accessibilityLanguage={i18n.language}
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <Text aria-hidden style={styles.closeMark}>
                    ✕
                  </Text>
                </Pressable>
              )}
            </View>
            {searchField !== undefined && (
              <FieldText
                {...searchField}
                autoCorrect={false}
                onFocus={() => {
                  searchFieldFocusedRef.current = true;
                }}
                onBlur={() => {
                  searchFieldFocusedRef.current = false;
                }}
              />
            )}
            <ScrollView
              // Android makes a scroll view a screen-reader stop while it can scroll, speaking all it holds at once.
              scrollEnabled={bodyContentHeight > bodyHeight}
              onLayout={(event) => {
                setBodyHeight(event.nativeEvent.layout.height);
              }}
              onContentSizeChange={(_, contentHeight) => {
                setBodyContentHeight(contentHeight);
              }}
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
      // Android hands a removed field's focus, and its keyboard, to the screen's first text field.
      if (searchFieldFocusedRef.current) Keyboard.dismiss();
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
