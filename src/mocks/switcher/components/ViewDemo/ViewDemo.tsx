import { useState, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import type { DemoLayer } from "@/shared/demo-layer/demo-layer.type";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";

import BottomSheetDemo from "./components/BottomSheetDemo/BottomSheetDemo";
import HeaderDemo from "./components/HeaderDemo/HeaderDemo";

type Props = ComponentProps<DemoLayer["ViewDemo"]>;
export default function ViewDemo({
  children,
  onResetDemo,
  onSheetOpenChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <ViewBottomSheetHost onSheetOpenChange={onSheetOpenChange}>
      <HeaderDemo
        onOpenMenu={() => {
          setMenuOpen(true);
        }}
      />
      {/* The header has taken the status bar's place, so a screen's own header must not pad for it again. */}
      <SafeAreaInsetsContext value={{ ...insets, top: 0 }}>
        <View style={styles.app}>{children}</View>
      </SafeAreaInsetsContext>
      {menuOpen && (
        <BottomSheetDemo
          onResetDemo={onResetDemo}
          onClose={() => {
            setMenuOpen(false);
          }}
        />
      )}
    </ViewBottomSheetHost>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
