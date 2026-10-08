import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AppState } from "react-native";

import { clearTransferScenario } from "@/test/clear-transfer-scenario";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const UNKNOWN_BANK_CODE = {
  error: { code: "NEW_BANK_CODE", message: "Unknown to this app." },
};

it(
  "shows the balance and how much more can be sent today",
  scenarioTest("transfer.balance_and_limit_shown", async () => {
    await renderRoute("/");

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
  }),
);

it(
  "offers to try again when the balance cannot load, and shows it once it does",
  scenarioTest("transfer.start_unexpected", async () => {
    await renderRoute("/");
    const tryAgainButton = await screen.findByRole("button", {
      name: "Try again",
    });
    expect(
      screen.getByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();

    clearTransferScenario();
    await fireEvent.press(tryAgainButton);

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  }),
);

it("pauses sending once a request finds no network, and resumes once a request reaches the bank", async () => {
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/");
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  const pausedReason = screen.getByText(
    "You're offline, so sending is paused.",
  );
  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();

  mswServer.resetHandlers();
  await fireEvent.press(tryAgain);
  await screen.findByText("RM 12,845.50");

  expect(pausedReason).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
});

it("says something unexpected went wrong where the recent recipients would be, and lists them on Try again", async () => {
  mswServer.use(
    http.get(
      "*/recipients/recent",
      () => HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
      { once: true },
    ),
  );
  await renderRoute("/");
  const recentsUnexpected = await screen.findByText(
    "Something unexpected went wrong.",
  );

  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findAllByRole("button", { name: /••••/ }),
  ).not.toHaveLength(0);
  expect(recentsUnexpected).not.toBeOnTheScreen();
});

it("keeps the recent recipients already listed under that message when reloading them fails", async () => {
  await renderRoute("/");
  const [listedRecent] = await screen.findAllByRole("button", {
    name: /••••/,
  });
  mswServer.use(
    http.get("*/recipients/recent", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );

  // Back in the foreground, every query reads afresh.
  for (const [eventName, listener] of jest.mocked(AppState).addEventListener
    .mock.calls)
    if (eventName === "change") listener("active");

  expect(
    await screen.findByText("Something unexpected went wrong."),
  ).toBeOnTheScreen();
  expect(listedRecent).toBeOnTheScreen();
});

it("keeps that message off Home while the phone has no connection", async () => {
  mswServer.use(
    http.get("*/recipients/recent", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/");
  const recentsUnexpected = await screen.findByText(
    "Something unexpected went wrong.",
  );

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  expect(recentsUnexpected).not.toBeOnTheScreen();
  expect(
    screen.getByText("You're offline, so sending is paused."),
  ).toBeOnTheScreen();
});
