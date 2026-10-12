import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
  onPullToRefresh?: () => Promise<unknown>;
}
export default function ViewScreenFrame({
  children,
  footer,
  onPullToRefresh,
}: Props) {
  const [frameTopInWindow, setFrameTopInWindow] = useState(0);
  const [doesFooterDrawNothing, setDoesFooterDrawNothing] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const frameRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const { bottom } = useSafeAreaInsets();

  function handleScrollViewLayout(event: LayoutChangeEvent) {
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
  }

  return (
    <View
      ref={frameRef}
      onLayout={() => {
        frameRef.current?.measureInWindow((_x, y) => {
          setFrameTopInWindow(y);
        });
      }}
      style={styles.main}
    >
      <KeyboardAvoidingView
        behavior="padding"
        // The keyboard's top is a window position, and it covers the footer's inset padding: neither needs clearing.
        keyboardVerticalOffset={frameTopInWindow - bottom}
        style={styles.keyboardClear}
      >
        <ScrollView
          ref={scrollViewRef}
          refreshControl={
            onPullToRefresh && (
              <RefreshControl
                refreshing={isPullRefreshing}
                colors={[colors.accent]}
                tintColor={colors.accent}
                onRefresh={() => {
                  setIsPullRefreshing(true);
                  onPullToRefresh().finally(() => {
                    setIsPullRefreshing(false);
                  });
                }}
              />
            )
          }
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          onLayout={handleScrollViewLayout}
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
          <View
            // Never flattened: its bar's background and border make it a native view only while the footer draws, and Android can lose a view that turns from flattened to real.
            collapsable={false}
            style={[
              styles.footer,
              doesFooterDrawNothing
                ? { paddingBottom: bottom }
                : [styles.footerBar, { paddingBottom: spacing.md + bottom }],
            ]}
          >
            <View
              // A footer element can render nothing, as review's does while the name check runs: no empty bar then.
              onLayout={(event) => {
                setDoesFooterDrawNothing(event.nativeEvent.layout.height === 0);
              }}
              style={styles.footerContent}
            >
              {footer}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: colors.background },
  keyboardClear: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md },
  footer: { paddingHorizontal: spacing.md },
  footerBar: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  footerContent: { gap: spacing.sm },
});
