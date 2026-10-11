import {
  createContext,
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

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
        setOpenSheets((shown) =>
          shown.some((entry) => entry.sheetId === sheetId)
            ? shown.map((entry) =>
                entry.sheetId === sheetId ? { sheetId, sheet } : entry,
              )
            : [...shown, { sheetId, sheet }],
        );
      },
      hideSheet: (sheetId: string) => {
        setOpenSheets((shown) =>
          shown.filter((entry) => entry.sheetId !== sheetId),
        );
      },
    }),
    [],
  );

  const isSheetOpen = openSheets.length > 0;

  const reportSheetOpen = useEffectEvent(() => {
    onSheetOpenChange?.(isSheetOpen);
  });
  useEffect(() => {
    reportSheetOpen();
  }, [isSheetOpen]);

  return (
    <BottomSheetHostContext value={sheetHost}>
      <View
        aria-hidden={isSheetOpen}
        // Never flattened: aria-hidden alone would add and remove this view with each sheet, re-parenting the screens beneath.
        collapsable={false}
        style={styles.main}
      >
        {children}
      </View>
      {openSheets.map(({ sheetId, sheet }) => (
        <Fragment key={sheetId}>{sheet}</Fragment>
      ))}
    </BottomSheetHostContext>
  );
}

const styles = StyleSheet.create({
  main: { ...StyleSheet.absoluteFill, pointerEvents: "box-none" },
});

export const BottomSheetHostContext = createContext<{
  showSheet: (sheetId: string, sheet: ReactNode) => void;
  hideSheet: (sheetId: string) => void;
} | null>(null);
