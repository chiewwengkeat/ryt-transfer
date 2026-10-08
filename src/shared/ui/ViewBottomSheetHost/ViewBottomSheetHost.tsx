import {
  createContext,
  Fragment,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

interface Props {
  children: ReactNode;
}
export default function ViewBottomSheetHost({ children }: Props) {
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

  return (
    <BottomSheetHostContext value={sheetHost}>
      <View aria-hidden={openSheets.length > 0} style={styles.layer}>
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
  hideSheet: (sheetId: string) => void;
} | null>(null);
