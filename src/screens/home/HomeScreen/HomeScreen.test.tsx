import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AppState } from "react-native";

import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { type BankErrorBody, sendToBank } from "@/test/bank-client";
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

it("offers Transfer only once the balance and today's limit have loaded", async () => {
  await renderRoute("/");

  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  await screen.findByText("RM 12,845.50");
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
});

it(
  "says the balance couldn't be loaded, offers to try again, and keeps Transfer unavailable",
  scenarioTest("transfer.balance_unavailable", async () => {
    await renderRoute("/");

    expect(
      await screen.findByText("Your balance couldn't be loaded."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.getByText(
        "You can send once your balance and today's limit have loaded.",
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "shows the balance during maintenance, and says until when transfers are unavailable",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body } = await sendToBank<BankErrorBody>("GET", "/transfer-limits");
    await renderRoute("/");

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(
      screen.getByText(
        `Transfers are unavailable right now, until ${formatMalaysianDateTime(body.error.until ?? "")}.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(screen.queryByText(/more today/)).toBeNull();
  }),
);

it.each([
  ["a time the app cannot read", { until: "soon" }],
  ["no time", {}],
])(
  "says transfers are unavailable without a time when maintenance comes with %s",
  async (_, untilField) => {
    mswServer.use(
      http.get("*/transfer-limits", () =>
        HttpResponse.json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Test.",
              ...untilField,
            },
          },
          { status: 503 },
        ),
      ),
    );
    await renderRoute("/");

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(
      screen.getByText("Transfers are unavailable right now. Try again later."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  },
);

it(
  "shows a new customer's lower daily limit as it shows any limit",
  scenarioTest("transfer.new_customer_daily_limit", async () => {
    await renderRoute("/");

    expect(
      await screen.findByText("You can send RM 1,000.00 more today"),
    ).toBeOnTheScreen();
  }),
);

it(
  "says something unexpected went wrong when the bank answers the balance in a way the app does not know",
  scenarioTest("transfer.start_unexpected", async () => {
    await renderRoute("/");

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
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
    if (eventName === "change") {
      listener("background");
      listener("active");
    }

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

it(
  "says sending is paused, and why Transfer waits, while no request reaches the bank",
  scenarioTest("transfer.offline", async () => {
    await renderRoute("/");

    expect(
      await screen.findByText(
        "You're offline. Sending is paused until Ryt can be reached.",
      ),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeDisabled();
    expect(
      screen.getByText("You're offline, so sending is paused."),
    ).toBeOnTheScreen();
  }),
);

it("asks for the balance again every 10 seconds while offline, and resumes sending once a read gets through", async () => {
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/");
  await screen.findByRole("button", { name: "Try again" });
  mswServer.resetHandlers();

  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "You're offline. Sending is paused until Ryt can be reached.",
    ),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
});
