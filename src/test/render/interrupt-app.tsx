import { accountKeys } from "@/domains/account/api/account.keys";
import { requestJson } from "@/shared/http/transport/transport";
import { isScreenCaptureBlocked } from "@/test/doubles/native-doubles";
import { mswServer } from "@/test/mock-bank/mock-bank";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { waitPastReceiptSettle } from "./drive-app";
import { askOpenAppToReadAgain, renderRoute } from "./render-route";

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

export async function endSessionWithAnyRequest() {
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

export async function endTheSessionThroughAnotherRead() {
  mswServer.use(
    http.get(
      "*/accounts/primary",
      () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  askOpenAppToReadAgain(accountKeys.primaryAccount);
  return screen.findByRole("button", { name: "Sign in again" });
}
