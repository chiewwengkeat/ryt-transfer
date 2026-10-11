import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { router } from "expo-router";
import { getFixedT } from "i18next";
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ReduceMotion } from "react-native-reanimated";

import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { observedRecords } from "@/test/doubles/native-doubles";
import {
  buildHistoryTransfer,
  failTransferHistoryPages,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";
import {
  findAccessibleGroupAround,
  turnOnPhoneReduceMotion,
  watchReduceMotionOfAnimations,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

afterEach(() => {
  Dimensions.set({ window: WINDOW_AT_LAUNCH, screen: SCREEN_AT_LAUNCH });
});

it("goes back to Home from History's header", async () => {
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer history" }),
  );

  await fireEvent.press(
    await screen.findByRole("button", { name: "Back to Home" }),
  );

  await waitFor(() => {
    expect(view.getPathname()).toBe("/");
  });
  expect(router.canGoBack()).toBe(false);
});

it("goes to Home from History opened by a link, with nothing beneath it", async () => {
  const view = await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Back to Home" }),
  );

  await waitFor(() => {
    expect(view.getPathname()).toBe("/");
  });
  expect(router.canGoBack()).toBe(false);
});

it.each([
  ["a sent transfer", {}, "Successful -RM 50.00"],
  [
    "a received transfer",
    { direction: TransferDirection.In, funds: TransferFunds.Credited },
    "Received +RM 50.00",
  ],
  [
    "a transfer still processing",
    { status: TransferStatus.Processing },
    "Processing -RM 50.00",
  ],
  [
    "a transfer held for a security check",
    { status: TransferStatus.Processing, underReview: true },
    "Held for a security check -RM 50.00",
  ],
  [
    "an unsuccessful transfer whose money never left",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.NotDebited },
    "Unsuccessful RM 50.00",
  ],
  [
    "an unsuccessful transfer whose refund is on its way",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.RefundPending },
    "Unsuccessful -RM 50.00",
  ],
  [
    "an unsuccessful transfer whose money came back",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.Refunded },
    "Unsuccessful RM 50.00",
  ],
])(
  "shows %s with its status and the money it moved",
  async (_, transfer, statusAndAmount) => {
    serveTransferHistoryPages([[buildHistoryTransfer(transfer)]]);
    await renderRoute("/transfer-history");

    expect(
      await screen.findByRole("button", {
        name: `Aisyah Rahman 3:42 pm · ${statusAndAmount}`,
      }),
    ).toBeOnTheScreen();
  },
);

it("shows when a transfer was sent, though it settled at another minute", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer({ updatedAt: "2026-10-06T09:05:00+08:00" })],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Aisyah Rahman 3:42 pm · Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
});

it("still lists a transfer whose amount it cannot read", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer({ amount: { minor: 50.5, currency: "MYR" } })],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Aisyah Rahman 3:42 pm · Successful",
    }),
  ).toBeOnTheScreen();
});

it("keeps transfers whose time it cannot read in their place without a time, reporting them once for the page", async () => {
  serveTransferHistoryPages([
    [
      TAN_ON_6_OCTOBER,
      LIM_AT_AN_UNREADABLE_TIME,
      buildHistoryTransfer({
        registeredName: "Ng Siew Lan",
        createdAt: "",
      }),
      buildHistoryTransfer(),
    ],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Lim Wei Jie Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Ng Siew Lan Successful -RM 50.00" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Tan Mei Ling 9:00 am/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman 3:42 pm/ }),
  ).toBeOnTheScreen();
  expect(
    observedRecords.filter(
      ({ name }) => name === "transfer_history_unreadable_times",
    ),
  ).toEqual([
    {
      type: "event",
      name: "transfer_history_unreadable_times",
      properties: { count: 2 },
    },
  ]);
});

it("folds a transfer whose time it cannot read away with its neighbour's day, which a pull leaves folded", async () => {
  serveTransferHistoryPages([
    [TAN_ON_6_OCTOBER, LIM_AT_AN_UNREADABLE_TIME, buildHistoryTransfer()],
  ]);
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
    }),
  );

  expect(
    screen.getByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Tan Mei Ling/ }),
  ).not.toBeOnTheScreen();
  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));
  expect(
    screen.getByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
});

it("loads on past a later page holding a transfer whose time it cannot read", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [LIM_AT_AN_UNREADABLE_TIME],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Lim Wei Jie Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
  expect(screen.getByText("That's everything")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn't load more.")).not.toBeOnTheScreen();
});

it("hands a 401 to the session-ended view", async () => {
  failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
});

it("says no failure of a first read only the session's end failed, and lists the transfers once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  const recoverFirstPages = failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't load your transfers.", {
    includeHiddenElements: true,
  });
  recoverFirstPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith("Couldn't load your transfers.");
});

it("says a first read's failure that follows signing in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  failTransferHistoryPages("first");

  await fireEvent.press(signInAgain);

  await waitFor(() => {
    expect(announce).toHaveBeenCalledWith("Couldn't load your transfers.");
  });
});

it("says no failure of a next page only the session's end failed, and loads it once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const recoverLaterPages = failTransferHistoryPages("later", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't load more.", {
    includeHiddenElements: true,
  });
  recoverLaterPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith("Couldn't load more.");
});

it("says a next page's failure that follows signing in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  failTransferHistoryPages("later", 401);
  await renderRoute("/transfer-history");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  failTransferHistoryPages("later");

  await fireEvent.press(signInAgain);

  await waitFor(() => {
    expect(announce).toHaveBeenCalledWith("Couldn't load more.");
  });
});

it("says no failure of a pull only the session's end failed, and shows the newest page once they sign in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  serveTransferHistoryPages([[buildHistoryTransfer(), LIM_ON_4_OCTOBER]]);
  const recoverFirstPages = failTransferHistoryPages("first", 401);
  await fireEvent(aisyah, "refresh");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  // ⛔ Keep this wait: pressed sooner, the view lifts before the failure shows, and this passes either way.
  await screen.findByText("Couldn't refresh — this list may be out of date", {
    includeHiddenElements: true,
  });
  recoverFirstPages();

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalledWith(
    "Couldn't refresh — this list may be out of date",
  );
});

it("tells a screen reader that History's days, transfers and loading footer are in Bahasa Malaysia when the app opens with it picked", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-04T13:05:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer-history");

  expect(
    findAccessibleGroupAround(await screen.findByText("Aisyah Rahman")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  expect(screen.getByRole("button", { expanded: true })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(
    await screen.findByLabelText(
      getFixedT(
        AppLanguage.Malay,
        "transfer",
      )("view_transfer_history_footer.loading"),
    ),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
  releaseLaterPages();
  expect(
    findAccessibleGroupAround(await screen.findByText("Lim Wei Jie")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
});

it("turns a day's chevron at once when the phone reduces motion", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()]]);
  await renderRoute("/transfer-history");
  const dayHeader = await screen.findByRole("button", { expanded: true });
  await turnOnPhoneReduceMotion();
  const reduceMotionOfAnimations = watchReduceMotionOfAnimations();

  await fireEvent.press(dayHeader);

  expect(screen.getByRole("button", { expanded: false })).toBeOnTheScreen();
  expect([...new Set(reduceMotionOfAnimations())]).toEqual([
    ReduceMotion.Always,
  ]);
});

// Jest lays nothing out: these pin the styles a device's wrap relies on, and only a device shows the wrap.
it("keeps a transfer's name and a day's title in a column that widens with the text size, wrapping the amount below them instead of squeezing them", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()]]);
  setPhoneTextSize(1);
  await renderRoute("/transfer-history");
  const nameColumn = (await screen.findByText("Aisyah Rahman")).parent;
  const dayHeader = screen.getByRole("button", { expanded: true });
  const dayTitleColumn = within(dayHeader).getByText(/\(1\)$/).parent;
  const nameWidthAtDefaultSize = flexBasisOf(nameColumn);
  const dayTitleWidthAtDefaultSize = flexBasisOf(dayTitleColumn);
  expect(nameWidthAtDefaultSize).toBeGreaterThan(0);
  expect(dayTitleWidthAtDefaultSize).toBeGreaterThan(0);

  await act(() => {
    setPhoneTextSize(2.143);
  });

  expect(flexBasisOf(nameColumn)).toBeCloseTo(
    Number(nameWidthAtDefaultSize) * 2.143,
  );
  expect(flexBasisOf(dayTitleColumn)).toBeCloseTo(
    Number(dayTitleWidthAtDefaultSize) * 2.143,
  );
  expect(nameColumn?.parent).toHaveStyle({ flexWrap: "wrap" });
  expect(dayTitleColumn?.parent).toHaveStyle({ flexWrap: "wrap" });
  // Yoga ignores a column's basis while the column is its row's only flexible child.
  const transferRow = screen.getByRole("button", { name: /Aisyah Rahman/ });
  expect(within(transferRow).getByText("-RM 50.00").parent).toHaveStyle({
    flexShrink: 1,
  });
  expect(within(dayHeader).getByText("-RM 50.00").parent).toHaveStyle({
    flexShrink: 1,
  });
});

const WINDOW_AT_LAUNCH = Dimensions.get("window");
const SCREEN_AT_LAUNCH = Dimensions.get("screen");

const LIM_ON_4_OCTOBER = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "2026-10-04T13:05:00+08:00",
});
const TAN_ON_6_OCTOBER = buildHistoryTransfer({
  registeredName: "Tan Mei Ling",
  createdAt: "2026-10-06T09:00:00+08:00",
});
const LIM_AT_AN_UNREADABLE_TIME = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "not a date",
});

function setPhoneTextSize(fontScale: number) {
  Dimensions.set({
    window: { ...WINDOW_AT_LAUNCH, fontScale },
    screen: { ...SCREEN_AT_LAUNCH, fontScale },
  });
}

function flexBasisOf(element: ReturnType<typeof screen.getByText> | null) {
  return StyleSheet.flatten(element?.props.style as StyleProp<ViewStyle>)
    .flexBasis;
}
