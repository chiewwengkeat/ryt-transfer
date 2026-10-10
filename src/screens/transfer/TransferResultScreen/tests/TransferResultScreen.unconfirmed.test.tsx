import { act, fireEvent, screen } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { delay, http } from "msw";
import { AccessibilityInfo } from "react-native";

import {
  clearTransferScenario,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { scenarioTest } from "@/test/render/drive-app";
import {
  relaunchApp,
  relaunchAppAndWaitForItsLaunchChecks,
  renderRoute,
} from "@/test/render/render-route";

import {
  sendRm100FromHome,
  transferIdIn,
  buttonsOnTheResultPage,
} from "./TransferResultScreen.helper";

it(
  "says a transfer the bank cannot find can't be found, with its id to quote, and opens History to check it",
  scenarioTest("transfer.last_transfer_not_found", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole(
        "header",
        { name: "Transfer not found" },
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Your last transfer can't be found. Check your transfer history before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual([
      "Transfer history",
      "Done",
      "Back to Home",
    ]);

    await fireEvent.press(
      screen.getByRole("button", { name: "Transfer history" }),
    );

    expect(view.getPathname()).toBe("/transfer-history");
  }),
);

it(
  "stops reading a transfer the bank cannot find, and leaves nothing for the next launch",
  scenarioTest("transfer.last_transfer_not_found", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Transfer not found" },
      { timeout: 10_000 },
    );
    const transferId = transferIdIn(view.getPathname());
    const readsOfTheTransfer = () =>
      sentRequests.filter(
        ({ method, url }) =>
          method === "GET" && url.endsWith(`/transfers/${transferId}`),
      ).length;
    const readsOnceNotFound = readsOfTheTransfer();

    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(readsOfTheTransfer()).toBe(readsOnceNotFound);
    const relaunched = await relaunchAppAndWaitForItsLaunchChecks(view);
    expect(screen.queryByText(/^Your (last )?transfer/)).toBeNull();
    expect(relaunched.getPathname()).toBe("/");
  }),
);

it(
  "leaves an unanswered approval's outcome unconfirmed when checking it meets an answer the app does not know, and opens History from it",
  scenarioTest("transfer.recovery_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();

    expect(
      await screen.findByRole(
        "header",
        { name: "Outcome not confirmed" },
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer's outcome can't be confirmed right now. Check your transfer history before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual([
      "Transfer history",
      "Done",
      "Back to Home",
    ]);

    await fireEvent.press(
      screen.getByRole("button", { name: "Transfer history" }),
    );

    expect(view.getPathname()).toBe("/transfer-history");
  }),
);

it(
  "keeps checking on Home a transfer whose outcome was not confirmed, and announces it there once the bank answers",
  scenarioTest("transfer.recovery_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Outcome not confirmed" },
      { timeout: 10_000 },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByText(/^Your last transfer is still being checked/),
    ).toBeOnTheScreen();
    clearTransferScenario();

    await act(() => jest.advanceTimersByTimeAsync(16_000));

    expect(
      await screen.findByText(
        /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/,
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "reopens at the next launch a transfer whose outcome was not confirmed, and shows how it ended",
  scenarioTest("transfer.recovery_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Outcome not confirmed" },
      { timeout: 10_000 },
    );
    const transferId = transferIdIn(view.getPathname());
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    clearTransferScenario();

    const relaunched = await relaunchApp(view);

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(relaunched.getPathname()).toBe(`/transfer/result/${transferId}`);
  }),
);

it(
  "keeps an unconfirmed outcome and its way to History, and says nothing new, while returning to the app reads it again",
  scenarioTest("transfer.recovery_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Outcome not confirmed" },
      { timeout: 10_000 },
    );
    const announcements = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockClear();
    // On a phone a failing read takes a while to fail, and the page renders while it is in flight.
    mswServer.use(
      http.get("*/transfers/:transferId", async () => {
        await delay(3_000);
      }),
    );

    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(
      screen.getByRole("header", { name: "Outcome not confirmed" }),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual([
      "Transfer history",
      "Done",
      "Back to Home",
    ]);
    expect(announcements).not.toHaveBeenCalled();
  }),
);
