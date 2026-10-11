import { reportError } from "@/shared/observability/observability/observability";
import { enableAppSwitcherProtectionAsync } from "expo-screen-capture";
import { Platform } from "react-native";

// iOS only: Android's module has no such cover, and there the capture block blanks the app-switcher preview.
export async function enableAppSwitcherBlur() {
  if (Platform.OS !== "ios") return;
  await enableAppSwitcherProtectionAsync().catch((error: unknown) => {
    reportError(error, { boundary: "app_switcher_blur" });
  });
}
