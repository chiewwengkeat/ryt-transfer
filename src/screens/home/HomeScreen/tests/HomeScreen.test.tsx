import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, BackHandler } from "react-native";

import {
  lookUpTestRecipient,
  sendToBank,
  clearTransferScenario,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  moveAppTo,
  scenarioTest,
} from "@/test/render/drive-app";
import {
  setPhoneNetwork,
  observedRecords,
  reportedScenarios,
} from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

const UNKNOWN_BANK_CODE = {
  error: { code: "NEW_BANK_CODE", message: "Unknown to this app." },
};

async function pressEveryRecentRecipientExpectingItDisabled() {
  for (const recent of await screen.findAllByRole("button", { name: /••••/ })) {
    expect(recent).toBeDisabled();
    await fireEvent.press(recent);
  }
}

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

it("reports the balance shown once while Home stays open, not again each time Home is back on top", async () => {
  const view = await renderRoute("/");
  await screen.findByText("RM 12,845.50");

  for (let visit = 0; visit < 2; visit++) {
    await fireEvent.press(
      screen.getByRole("button", { name: "Transfer history" }),
    );
    await pressHardwareBack();
  }

  expect(view.getPathname()).toBe("/");
  expect(
    reportedScenarios().filter(
      (scenario) => scenario === "transfer.balance_and_limit_shown",
    ),
  ).toHaveLength(1);
});

it("keeps Transfer unavailable, saying why, until the balance and today's limit have loaded", async () => {
  const loadingReason =
    "You can send once your balance and today's limit have loaded.";
  await renderRoute("/");

  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  expect(screen.getByText(loadingReason)).toBeOnTheScreen();
  await screen.findByText("RM 12,845.50");
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  expect(screen.queryByText(loadingReason)).toBeNull();
});

it(
  "says the balance couldn't be loaded, offers to try again, and keeps Transfer and the recent recipients unavailable",
  scenarioTest("transfer.balance_unavailable", async () => {
    const view = await renderRoute("/");

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
    expect(reportedScenarios()).toContain("transfer.balance_unavailable");
    await pressEveryRecentRecipientExpectingItDisabled();
    expect(view.getPathname()).toBe("/");
  }),
);

it(
  "reports the balance failing again when Try again brings the failure back",
  scenarioTest("transfer.balance_unavailable", async () => {
    await renderRoute("/");

    await fireEvent.press(
      await screen.findByRole("button", { name: "Try again" }),
    );

    await waitFor(() => {
      expect(
        reportedScenarios().filter(
          (scenario) => scenario === "transfer.balance_unavailable",
        ),
      ).toHaveLength(2);
    });
    expect(
      screen.getByText("Your balance couldn't be loaded."),
    ).toBeOnTheScreen();
  }),
);

it(
  "shows a new customer's balance, and their lower daily limit as it shows any limit",
  scenarioTest("transfer.new_customer_daily_limit", async () => {
    await renderRoute("/");

    expect(
      await screen.findByText("You can send RM 1,000.00 more today"),
    ).toBeOnTheScreen();
    expect(screen.getByText("RM 12,845.50")).toBeOnTheScreen();
  }),
);

it(
  "says something unexpected went wrong when the bank answers the balance in a way the app does not know, and lets Back leave",
  scenarioTest("transfer.start_unexpected", async () => {
    const leaveApp = jest.spyOn(BackHandler, "exitApp");
    await renderRoute("/");

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(reportedScenarios()).toContain("transfer.start_unexpected");
    await pressHardwareBack();
    expect(leaveApp).toHaveBeenCalledTimes(1);
    leaveApp.mockRestore();
  }),
);

it("reports only the session's end when Home's own reads answer that it has ended", async () => {
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));

  await renderRoute("/");

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  // ⛔ Keep this wait: without it the reports are read before the balance has failed, and this passes either way.
  await screen.findAllByText("Something unexpected went wrong.", {
    includeHiddenElements: true,
  });
  expect(reportedScenarios()).toEqual(["transfer.session_ended"]);
});

it("neither reports nor says a failure of the balance and recent recipients that loaded and then answered that the session had ended, once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  await renderRoute("/");
  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));

  moveAppTo("background");
  moveAppTo("active");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  mswServer.resetHandlers();
  await fireEvent.press(signInAgain);

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(reportedScenarios()).not.toContain("transfer.start_unexpected");
  expect(announce).not.toHaveBeenCalledWith("Something unexpected went wrong.");
});

it.each([
  ["balance", "/accounts/primary", "primary_account"],
  ["limit", "/transfer-limits", "transfer_limits"],
])(
  "says something unexpected went wrong, and reports it, when the bank sends a %s the app cannot read",
  async (_, path, boundary) => {
    const { body } = await sendToBank<object>("GET", path);
    const bodyInDollars = JSON.parse(
      JSON.stringify(body).replaceAll('"MYR"', '"USD"'),
    ) as object;
    mswServer.use(http.get(`*${path}`, () => HttpResponse.json(bodyInDollars)));
    await renderRoute("/");

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(observedRecords).toContainEqual({
      type: "event",
      name: "unreadable_amount",
      properties: { boundary },
    });
  },
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
  moveAppTo("background");
  moveAppTo("active");

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
    expect(reportedScenarios()).toContain("transfer.offline");
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

it("lists the recipient of a transfer just sent first among the recent recipients, back on Home", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  const sentRecipientRow = new RegExp(`^${recipient.registeredName}`);
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await screen.findAllByRole("button", { name: /••••/ });
  expect(screen.queryByRole("button", { name: sentRecipientRow })).toBeNull();

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
  await fireEvent.press(await screen.findByRole("button", { name: "Done" }));

  await waitFor(() => {
    expect(
      screen.getAllByRole("button", { name: /••••/ })[0],
    ).toHaveAccessibleName(sentRecipientRow);
  });
});

it("opens the transfer history from Home", async () => {
  const view = await renderRoute("/");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer history" }),
  );

  expect(view.getPathname()).toBe("/transfer-history");
});
