import { fireEvent, screen } from "@testing-library/react-native";
import { http } from "msw";
import { AccessibilityInfo } from "react-native";

import { lookUpTestRecipient } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "announces an outcome that changes in place, and not the one the page opens with",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    let releaseStatusRead: () => void = () => undefined;
    const statusReadHeld = new Promise<void>((release) => {
      releaseStatusRead = release;
    });
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        async () => {
          await statusReadHeld;
        },
        { once: true },
      ),
    );
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "100",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(
      await screen.findByRole("header", { name: "Checking your transfer" }),
    ).toBeOnTheScreen();

    releaseStatusRead();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(
      `Transfer sent. RM 100.00 sent to ${recipient.registeredName} — money moved.`,
    );
    expect(announce).not.toHaveBeenCalledWith(
      expect.stringContaining("Checking your transfer"),
    );
  }),
);
