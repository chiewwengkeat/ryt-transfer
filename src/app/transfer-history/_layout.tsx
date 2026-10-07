import { Stack } from "expo-router";

export default function TransferHistoryLayout() {
  return (
    <>
      {/* Hides the root stack's header for this route: this stack draws its own. */}
      <Stack.Screen options={{ headerShown: false }} />
      <Stack />
    </>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
