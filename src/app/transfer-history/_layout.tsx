import { Stack } from "expo-router";

import { screenTransitionOptions } from "@/shared/lib/motion/motion";
import { demoLayer } from "@/root/app-launch/app-launch";

export default function TransferHistoryLayout() {
  return (
    <>
      {/* Hides the root stack's header for this route: this stack draws its own. */}
      <Stack.Screen options={{ headerShown: false }} />
      <Stack
        // Android's header pads for the status bar itself, a place the Demo header has already taken.
        screenOptions={
          demoLayer === null
            ? screenTransitionOptions
            : () => ({
                ...screenTransitionOptions(),
                unstable_nativeProps: {
                  headerConfig: { disableTopInsetApplication: true },
                },
              })
        }
      />
    </>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
