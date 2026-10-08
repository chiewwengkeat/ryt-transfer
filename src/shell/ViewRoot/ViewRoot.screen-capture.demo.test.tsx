import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import "@/test/demo-build";
import { isScreenCaptureBlocked } from "@/test/harness/native-doubles";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "blocks capture on Home in a demo build while Screenshots blocked is picked, and allows it on a receipt",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await renderRoute("/");
    await screen.findByText("RM 12,845.50");
    const blockedOnHome = isScreenCaptureBlocked();

    await act(() => {
      router.push("/transfer/result/transfer-on-screen");
    });

    expect(blockedOnHome).toBe(true);
    await waitFor(() => {
      expect(isScreenCaptureBlocked()).toBe(false);
    });
  }),
);

it("allows capture on Home in a demo build until Screenshots blocked is picked from the Demo menu, then blocks it at once", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  const blockedBeforePick = isScreenCaptureBlocked();

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(
    screen.getByRole("radio", { name: "Screenshots blocked" }),
  );

  expect(blockedBeforePick).toBe(false);
  expect(isScreenCaptureBlocked()).toBe(true);
});
