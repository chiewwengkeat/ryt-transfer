import {
  createContext,
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaFrame } from "react-native-safe-area-context";

interface Props {
  children: ReactNode;
  onSheetOpenChange?: (sheetOpen: boolean) => void;
}
export default function ViewBottomSheetHost({
  children,
  onSheetOpenChange,
}: Props) {
  const [openSheets, setOpenSheets] = useState<
    { sheetId: string; sheet: ReactNode }[]
  >([]);
  // Updated in place, never re-appended: a re-render must not lift an older sheet over a newer one.
  const sheetHost = useMemo(
    () => ({
      showSheet: (sheetId: string, sheet: ReactNode) => {
        if (!sheetTopById.has(sheetId)) {
          sheetTopById.set(sheetId, null);
          notifySheetTopReaders();
        }
        setOpenSheets((shown) =>
          shown.some((entry) => entry.sheetId === sheetId)
            ? shown.map((entry) =>
                entry.sheetId === sheetId ? { sheetId, sheet } : entry,
              )
            : [...shown, { sheetId, sheet }],
        );
      },
      reportSheetTop: (sheetId: string, top: number) => {
        // A layout landing after hideSheet must not bring a closed sheet back.
        if (!sheetTopById.has(sheetId)) return;
        sheetTopById.set(sheetId, top);
        notifySheetTopReaders();
      },
      hideSheet: (sheetId: string) => {
        sheetTopById.delete(sheetId);
        notifySheetTopReaders();
        setOpenSheets((shown) =>
          shown.filter((entry) => entry.sheetId !== sheetId),
        );
      },
    }),
    [],
  );

  const sheetOpen = openSheets.length > 0;
  const reportSheetOpen = useEffectEvent(() => {
    onSheetOpenChange?.(sheetOpen);
  });
  useEffect(() => {
    reportSheetOpen();
  }, [sheetOpen]);

  return (
    <BottomSheetHostContext value={sheetHost}>
      <View aria-hidden={sheetOpen} style={styles.layer}>
        {children}
      </View>
      {openSheets.map(({ sheetId, sheet }) => (
        <Fragment key={sheetId}>{sheet}</Fragment>
      ))}
    </BottomSheetHostContext>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, pointerEvents: "box-none" },
});

export const BottomSheetHostContext = createContext<{
  showSheet: (sheetId: string, sheet: ReactNode) => void;
  reportSheetTop: (sheetId: string, top: number) => void;
  hideSheet: (sheetId: string) => void;
} | null>(null);

// Across every host, in the order sheets opened, so the last is the one on top; null until laid out.
const sheetTopById = new Map<string, number | null>();
const sheetTopReaders = new Set<() => void>();

function notifySheetTopReaders() {
  for (const reader of sheetTopReaders) reader();
}

export function useOpenBottomSheetHeight() {
  const { height: screenHeight } = useSafeAreaFrame();
  const sheetTop = useSyncExternalStore(
    (reader) => {
      sheetTopReaders.add(reader);
      return () => {
        sheetTopReaders.delete(reader);
      };
    },
    () => [...sheetTopById.values()].at(-1) ?? null,
  );
  // From the panel's top edge in its screen-filling layer, not the panel's height: a keyboard raises the panel.
  return sheetTop === null ? 0 : screenHeight - sheetTop;
}
