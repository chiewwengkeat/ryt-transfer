import { setPhoneNetwork } from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  clearTransferScenario,
  mswServer,
  sentRequests,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";
import { scenarioTest } from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";
import { focusManager } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";
import {
  buttonsOnTheResultPage,
  sendRm100FromHome,
  transferIdIn,
} from "./TransferResultScreen.helper";

it(
  "says the bank is still unreachable once its reads at 2, 4, 8 and 16 seconds get no answer, quoting the transfer's id",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    expect(
      await screen.findByRole(
        "header",
        { name: "Checking your transfer" },
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(14_000));
    expect(
      screen.queryByRole("header", { name: "Still checking your transfer" }),
    ).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(3_000));

    expect(
      await screen.findByRole("header", {
        name: "Still checking your transfer",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank can't be reached right now. This transfer will keep being checked, and the result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done", "Back to Home"]);
  }),
);

it(
  "keeps reading after saying the bank is unreachable, and shows the outcome here once the bank answers",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    await act(() => jest.advanceTimersByTimeAsync(17_000));
    await screen.findByRole("header", { name: "Still checking your transfer" });
    clearTransferScenario();

    await act(() => jest.advanceTimersByTimeAsync(16_000));

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
  }),
);

it(
  "checks a transfer the bank could not be reached about again at the next launch, after leaving it",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    await act(() => jest.advanceTimersByTimeAsync(17_000));
    await screen.findByRole("header", { name: "Still checking your transfer" });
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
  "waits for the read at 16 seconds before saying the bank is unreachable, though the app came back to the foreground first",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    await act(() => jest.advanceTimersByTimeAsync(3_000));
    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(() => jest.advanceTimersByTimeAsync(11_000));
    expect(
      screen.queryByRole("header", { name: "Still checking your transfer" }),
    ).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(3_000));

    expect(
      await screen.findByRole("header", {
        name: "Still checking your transfer",
      }),
    ).toBeOnTheScreen();
  }),
);

it(
  "reads the transfer again once a request reaches the bank, before its read at 2 seconds, yet waits for the read at 16 seconds before saying the bank is unreachable",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    const transferId = transferIdIn(view.getPathname());

    expect(
      sentRequests.filter(
        ({ method, url }) =>
          method === "GET" && url.endsWith(`/transfers/${transferId}`),
      ).length,
    ).toBe(2);
    await act(() => jest.advanceTimersByTimeAsync(14_000));
    expect(
      screen.queryByRole("header", { name: "Still checking your transfer" }),
    ).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(3_000));

    expect(
      await screen.findByRole("header", {
        name: "Still checking your transfer",
      }),
    ).toBeOnTheScreen();
  }),
);

it("still says the bank is unreachable once it stops answering, after answering the page's first read", async () => {
  const { created } = await startTestTransfer(10_000);
  let statusReads = 0;
  mswServer.use(
    http.get("*/transfers/:transferId", () => {
      statusReads += 1;
      return statusReads === 1 ? undefined : HttpResponse.error();
    }),
  );
  await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer/result/[transferId]",
      params: { transferId: created.transfer.transferId },
    });
  });
  await screen.findByRole("header", { name: "Checking your transfer" });
  await act(() => jest.advanceTimersByTimeAsync(14_000));
  expect(
    screen.queryByRole("header", { name: "Still checking your transfer" }),
  ).toBeNull();

  await act(() => jest.advanceTimersByTimeAsync(3_000));

  expect(
    await screen.findByRole("header", { name: "Still checking your transfer" }),
  ).toBeOnTheScreen();
});

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
  "says once, from review, that sending is paused, and never shows it on the result page while the transfer's reads go unanswered",
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

    expect(noticeShownEachSecond).not.toContain(true);
    expect(
      announce.mock.calls.filter(([message]) => message === OFFLINE_NOTICE),
    ).toHaveLength(1);
  }),
);

const OFFLINE_NOTICE =
  "You're offline. Sending is paused until Ryt can be reached.";
