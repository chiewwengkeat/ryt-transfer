import type { DemoLayer } from "@/mocks/demo-layer/demo-layer";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { useState, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import BottomSheetDemo from "./components/BottomSheetDemo/BottomSheetDemo";
import HeaderDemo from "./components/HeaderDemo/HeaderDemo";

type Props = ComponentProps<DemoLayer["ViewDemo"]>;
export default function ViewDemo({
  appSheetOpen,
  children,
  onResetDemo,
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const insets = useSafeAreaInsets();

  return (
    <ViewBottomSheetHost>
      <HeaderDemo
        appSheetOpen={appSheetOpen}
        onOpenMenu={() => {
          setIsMenuOpen(true);
        }}
      />
      {/* The header has taken the status bar's place, so a screen's own header must not pad for it again. */}
      <SafeAreaInsetsContext value={{ ...insets, top: 0 }}>
        <View style={styles.app}>{children}</View>
      </SafeAreaInsetsContext>
      {isMenuOpen && (
        <BottomSheetDemo
          onResetDemo={onResetDemo}
          onClose={() => {
            setIsMenuOpen(false);
          }}
        />
      )}
    </ViewBottomSheetHost>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
