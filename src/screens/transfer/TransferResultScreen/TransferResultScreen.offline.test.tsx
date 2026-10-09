import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const OFFLINE_NOTICE =
  "You're offline. Sending is paused until Ryt can be reached.";

it(
  "offers no load-again while the phone has no connection, and offers it again once the phone is back",
  scenarioTest("transfer.outcome_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
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
    await screen.findByRole("button", { name: "Load the result again" });

    await act(() => {
      setPhoneNetwork({ isConnected: false, isInternetReachable: false });
    });

    expect(
      screen.queryByRole("button", { name: "Load the result again" }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Transfer history" }),
    ).toBeOnTheScreen();
    await act(() => {
      setPhoneNetwork({ isConnected: true, isInternetReachable: true });
    });
    expect(
      await screen.findByRole("button", { name: "Load the result again" }),
    ).toBeOnTheScreen();
  }),
);

it(
  "shows and says the offline notice at most once while only the transfer's own reads go unanswered",
  scenarioTest("transfer.status_unreachable", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
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
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );

    const noticeShownEachSecond: boolean[] = [];
    for (let second = 0; second < 60; second += 1) {
      await act(() => jest.advanceTimersByTimeAsync(1_000));
      noticeShownEachSecond.push(screen.queryByText(OFFLINE_NOTICE) !== null);
    }

    const firstSecondWithoutTheNotice = noticeShownEachSecond.indexOf(false);
    expect(firstSecondWithoutTheNotice).not.toBe(-1);
    expect(
      noticeShownEachSecond.slice(firstSecondWithoutTheNotice),
    ).not.toContain(true);
    expect(
      announce.mock.calls.filter(([message]) => message === OFFLINE_NOTICE),
    ).toHaveLength(1);
  }),
);
