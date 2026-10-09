import { Stack } from "expo-router";

import { stackScreenOptions } from "@/root/app-launch/app-launch";

export default function TransferHistoryLayout() {
  return (
    <>
      {/* Hides the root stack's header for this route: this stack draws its own. */}
      <Stack.Screen options={{ headerShown: false }} />
      <Stack screenOptions={stackScreenOptions} />
    </>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
