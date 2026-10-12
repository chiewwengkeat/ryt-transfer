import type { DemoLayer } from "@/mocks/demo-layer/demo-layer";
import { demoLayer } from "@/root/app-launch/app-launch";
import type { ComponentProps } from "react";

type Props = ComponentProps<DemoLayer["ViewDemo"]>;
export default function ViewDemoFrame({
  appSheetOpen,
  onResetDemo,
  children,
}: Props) {
  if (demoLayer === null) return children;
  return (
    <demoLayer.ViewDemo appSheetOpen={appSheetOpen} onResetDemo={onResetDemo}>
      {children}
    </demoLayer.ViewDemo>
  );
}
