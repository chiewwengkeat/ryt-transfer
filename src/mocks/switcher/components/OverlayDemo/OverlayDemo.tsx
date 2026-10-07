import { useState } from "react";

import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";

import BannerDemo from "./components/BannerDemo/BannerDemo";
import BottomSheetDemo from "./components/BottomSheetDemo/BottomSheetDemo";
import PillDemo from "./components/PillDemo/PillDemo";

interface Props {
  onResetDemo: () => Promise<void>;
  onSheetOpenChange: (sheetOpen: boolean) => void;
}
export default function OverlayDemo({ onResetDemo, onSheetOpenChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <ViewBottomSheetHost onSheetOpenChange={onSheetOpenChange}>
      <BannerDemo />
      <PillDemo
        onPress={() => {
          setMenuOpen(true);
        }}
      />
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
