import { act, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { reportedScenarios } from "@/test/harness/recording-sink";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

it("says the balance couldn't be loaded when the bank never answers it, and never counts the app offline for that", async () => {
  mswServer.use(
    http.get("*/accounts/primary", () => new Promise<never>(() => undefined)),
  );
  await renderRoute("/");

  await act(() => jest.advanceTimersByTimeAsync(45_000));

  expect(
    await screen.findByText("Your balance couldn't be loaded."),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      "You can send once your balance and today's limit have loaded.",
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "You're offline. Sending is paused until Ryt can be reached.",
    ),
  ).toBeNull();
});

it("says and reports the balance failing once while offline, keeping it shown as each re-read fails the same way", async () => {
  const balanceFailure = "Your balance couldn't be loaded.";
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/");
  await screen.findByText(balanceFailure);

  await act(() => jest.advanceTimersByTimeAsync(40_000));

  expect(screen.getByText(balanceFailure)).toBeOnTheScreen();
  expect(
    announce.mock.calls.filter(([words]) => words === balanceFailure),
  ).toHaveLength(1);
  expect(
    reportedScenarios().filter(
      (scenario) => scenario === "transfer.balance_unavailable",
    ),
  ).toHaveLength(1);
});
