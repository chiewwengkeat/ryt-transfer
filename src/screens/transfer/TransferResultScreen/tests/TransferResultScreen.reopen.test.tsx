import { act, fireEvent, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { moveAppTo, scenarioTest } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

it(
  "keeps checking a processing transfer until it shows sent, after Android reopens the app from Back",
  scenarioTest("transfer.processing", async () => {
    const platformOs = jest.replaceProperty(Platform, "OS", "android");
    try {
      await pairPhoneAsTheDemoLaunchDoes();
      const view = await renderRoute("/");
      await screen.findByText("RM 12,845.50");
      await act(() => {
        moveAppTo("background");
      });
      await view.unmount();
      await renderRoute("/");
      await act(() => {
        moveAppTo("active");
      });
      await fireEvent.press(
        await screen.findByRole("button", {
          name: "Transfer",
          disabled: false,
        }),
      );
      await fireEvent.changeText(
        await screen.findByLabelText("DuitNow mobile number"),
        "012-345 6789",
      );
      await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
      await screen.findByText("RM 12,845.50");
      await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
      await fireEvent.press(screen.getByRole("button", { name: "Review" }));
      await fireEvent.press(
        await screen.findByRole("button", { name: "Transfer" }),
      );
      await screen.findByRole("header", { name: "Transfer processing" });

      await act(() => jest.advanceTimersByTimeAsync(32_000));

      expect(
        await screen.findByRole("header", { name: "Transfer sent" }),
      ).toBeOnTheScreen();
    } finally {
      platformOs.restore();
    }
  }),
);
