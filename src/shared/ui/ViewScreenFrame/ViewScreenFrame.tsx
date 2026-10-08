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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
}
export default function ViewScreenFrame({ children, footer }: Props) {
  const { bottom } = useSafeAreaInsets();
  const frameRef = useRef<View>(null);
  const [frameTopInWindow, setFrameTopInWindow] = useState(0);
  const frameId = useId();
  const [measuredFooterHeight, setMeasuredFooterHeight] = useState(0);
  const footerHeight = footer === undefined ? 0 : measuredFooterHeight;
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            footer === undefined && { paddingBottom: spacing.lg + bottom },
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
