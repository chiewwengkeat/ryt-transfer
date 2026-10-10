import { useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
}
export default function ViewScreenFrame({ children, footer }: Props) {
  const { bottom } = useSafeAreaInsets();
  const frameRef = useRef<View>(null);
  const [frameTopInWindow, setFrameTopInWindow] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  return (
    <View
      ref={frameRef}
      onLayout={() => {
        frameRef.current?.measureInWindow((_x, y) => {
          setFrameTopInWindow(y);
        });
      }}
      style={styles.frame}
    >
      <KeyboardAvoidingView
        behavior="padding"
        // The keyboard's top is a window position, and it covers the footer's inset padding: neither needs clearing.
        keyboardVerticalOffset={frameTopInWindow - bottom}
        style={styles.keyboardClear}
      >
        <ScrollView
          ref={scrollViewRef}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          onLayout={(event) => {
            const shownHeight = event.nativeEvent.layout.height;
            if (frameRef.current === null) return;
            // As the keyboard shrinks this, the field being typed in keeps room below it for one labelled control, the
            // next one, short of scrolling its own top out of sight.
            TextInput.State.currentlyFocusedInput()?.measureLayout(
              frameRef.current,
              // React Native leaves the scroll offset out of this y: it is the field's place in the content, which starts at the frame's top.
              (_x, fieldTopInContent, _width, fieldHeight) => {
                const scrollOffsetNeeded = Math.min(
                  fieldTopInContent,
                  fieldTopInContent +
                    fieldHeight +
                    spacing.md +
                    typography.label.lineHeight +
                    spacing.xs +
                    minTouchTarget -
                    shownHeight,
                );
                if (scrollOffsetNeeded > scrollOffsetRef.current)
                  scrollViewRef.current?.scrollTo({ y: scrollOffsetNeeded });
              },
            );
          }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom:
                footer === undefined ? spacing.lg + bottom : spacing.md,
            },
          ]}
        >
          {children}
        </ScrollView>
        {footer !== undefined && (
          <View style={[styles.footer, { paddingBottom: spacing.md + bottom }]}>
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background },
  keyboardClear: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
