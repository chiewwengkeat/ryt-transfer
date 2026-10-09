import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  const frameId = useId();
  const [measuredFooterHeight, setMeasuredFooterHeight] = useState(0);
  const footerHeight = footer === undefined ? 0 : measuredFooterHeight;
  const floatingNoticeSpace = useSyncExternalStore(
    (reader) => {
      floatingNoticeSpaceReaders.add(reader);
      return () => {
        floatingNoticeSpaceReaders.delete(reader);
      };
    },
    () => reservedFloatingNoticeSpace,
  );
  useEffect(() => {
    footerHeightByFrame.set(frameId, 0);
    return () => {
      footerHeightByFrame.delete(frameId);
      notifyFooterHeightReaders();
    };
  }, [frameId]);
  useEffect(() => {
    footerHeightByFrame.set(frameId, footerHeight);
    notifyFooterHeightReaders();
  }, [frameId, footerHeight]);

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
                (footer === undefined ? spacing.lg + bottom : spacing.md) +
                floatingNoticeSpace,
            },
          ]}
        >
          {children}
        </ScrollView>
        {footer !== undefined && (
          <View
            onLayout={(event) => {
              setMeasuredFooterHeight(event.nativeEvent.layout.height);
            }}
            style={[styles.footer, { paddingBottom: spacing.md + bottom }]}
          >
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
    backgroundColor: colors.background,
  },
});

// In mount order, so the last entry is the screen on top: a pushed screen mounts after the one it covers.
const footerHeightByFrame = new Map<string, number>();
const footerHeightReaders = new Set<() => void>();

function notifyFooterHeightReaders() {
  for (const reader of footerHeightReaders) reader();
}

export function useScreenFooterHeight() {
  return useSyncExternalStore(
    (reader) => {
      footerHeightReaders.add(reader);
      return () => {
        footerHeightReaders.delete(reader);
      };
    },
    () => [...footerHeightByFrame.values()].at(-1) ?? 0,
  );
}

let reservedFloatingNoticeSpace = 0;
const floatingNoticeSpaceReaders = new Set<() => void>();

export function reserveScreenSpaceForFloatingNotice(space: number) {
  reservedFloatingNoticeSpace = space;
  for (const reader of floatingNoticeSpaceReaders) reader();
}
