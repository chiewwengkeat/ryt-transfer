import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { isScreenCaptureBlocked } from "@/test/harness/native-doubles";
import { waitPastReceiptSettle } from "@/test/harness/receipt-settle";
import { renderRoute } from "@/test/render-route";

export function ButtonCrashScreen() {
  const [crashed, setCrashed] = useState(false);
  // Only on a press: a crash in the first render replaces the app before its guard has run.
  if (crashed) throw new Error("render failed");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setCrashed(true);
      }}
    >
      <Text>Crash the screen</Text>
    </Pressable>
  );
}

// Only the screen is replaced: the route keeps its own ErrorBoundary, so the crash shows what that route really shows.
export async function crashTheScreenOfASettledReceipt(
  pathname: string,
  routeFile: string,
) {
  await renderRoute(pathname, {
    appDir: "src/app",
    overrides: {
      [routeFile]: {
        ...jest.requireActual<object>(`@/app/${routeFile}`),
        default: ButtonCrashScreen,
      },
    },
  });
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Crash the screen" }),
  );
  await screen.findByText("This screen stopped working.");
  await waitPastReceiptSettle();
}
