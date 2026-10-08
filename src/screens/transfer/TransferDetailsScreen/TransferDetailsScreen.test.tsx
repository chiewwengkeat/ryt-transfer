import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo } from "react-native";

import {
  TransferDirection,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { pressHardwareBack } from "@/test/hardware-back";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import {
  buildHistoryTransfer,
  failTransferDetails,
  holdTransferDetails,
  serveTransferDetails,
  serveTransferHistoryPages,
} from "@/test/transfer-history-pages";

const sentPathnames = () =>
  sentRequests.map(({ url }) => new URL(url).pathname);
const sentTransferDetailsReads = () =>
  sentPathnames().filter((pathname) => /\/transfers\/[^/]+$/.test(pathname));
const sentTransferHistoryReads = () =>
  sentPathnames().filter((pathname) => pathname.endsWith("/transfers"));

const AISYAH = buildHistoryTransfer();
// Every optional field set and two different minutes: each case overrides only what makes it that case.
const AISYAH_IN_FULL = buildHistoryTransfer({
  note: "Lunch",
  reference: "RYT-20261005-0001",
  failureReason: TransferFailureReason.RecipientBankRejected,
  underReview: true,
  updatedAt: "2026-10-06T09:05:00+08:00",
});
const SENT_AT = "5 Oct 2026, 3:42 pm";
const SETTLED_AT = "6 Oct 2026, 9:05 am";
const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
const OUT_OF_DATE = "Couldn't refresh — these details may be out of date";

async function openTransferDetails(transfer: Transfer) {
  serveTransferHistoryPages([[transfer]]);
  serveTransferDetails(transfer);
  await renderRoute(`/transfer-history/${transfer.transferId}`);
}

it("shows a transfer from its History row at once, then as the bank tells it", async () => {
  const listed = buildHistoryTransfer({ status: TransferStatus.Processing });
  serveTransferHistoryPages([[listed]]);
  serveTransferDetails({ ...listed, version: 2, note: "Lunch" });
  const releaseDetails = holdTransferDetails();
  const view = await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(view.getPathname()).toBe(`/transfer-history/${listed.transferId}`);
  expect(screen.getByText("Aisyah Rahman")).toBeOnTheScreen();
  expect(screen.queryByText("Lunch")).not.toBeOnTheScreen();
  releaseDetails();
  expect(await screen.findByText("Lunch")).toBeOnTheScreen();
});

it("waits for the bank on a History row whose amount it cannot read", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer({ amount: { minor: 50.5, currency: "MYR" } })],
  ]);
  serveTransferDetails(AISYAH);
  const releaseDetails = holdTransferDetails();
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  releaseDetails();
  expect(await screen.findByText("RM 50.00")).toBeOnTheScreen();
});

it("opens a transfer from a link with a loader until the bank answers, and History beneath it", async () => {
  serveTransferHistoryPages([[]]);
  serveTransferDetails(AISYAH);
  const releaseDetails = holdTransferDetails();
  const view = await renderRoute(`/transfer-history/${AISYAH.transferId}`);

  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  releaseDetails();
  expect(await screen.findByText("Aisyah Rahman")).toBeOnTheScreen();
  await pressHardwareBack();

  expect(view.getPathname()).toBe("/transfer-history");
  expect(await screen.findByText("No transfers yet")).toBeOnTheScreen();
});

it("returns to History without asking for its transfers again", async () => {
  serveTransferDetails(AISYAH);
  const view = await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  await screen.findByText("RM 50.00");

  await pressHardwareBack();

  expect(view.getPathname()).toBe("/transfer-history");
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryReads()).toHaveLength(1);
});

it("says it couldn't find a transfer the bank does not know, asking once, and goes back to History", async () => {
  const view = await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(
    await screen.findByText("Couldn't find this transfer."),
  ).toBeOnTheScreen();
  expect(sentTransferDetailsReads()).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));

  expect(view.getPathname()).toBe("/transfer-history");
});

it("asks three times before offering Try again, and shows the transfer once it lands", async () => {
  serveTransferHistoryPages([[]]);
  serveTransferDetails(AISYAH);
  const recoverDetails = failTransferDetails();
  await renderRoute(`/transfer-history/${AISYAH.transferId}`);

  expect(
    await screen.findByText("Couldn't load this transfer."),
  ).toBeOnTheScreen();
  expect(sentTransferDetailsReads()).toHaveLength(3);
  recoverDetails();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Aisyah Rahman")).toBeOnTheScreen();
});

it("asks three times before offering Try again when the bank takes too long", async () => {
  serveTransferHistoryPages([[]]);
  holdTransferDetails();
  await renderRoute(`/transfer-history/${AISYAH.transferId}`);

  await act(() => jest.advanceTimersByTimeAsync(15_000));
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(sentTransferDetailsReads()).toHaveLength(2);
  await act(() => jest.advanceTimersByTimeAsync(20_000));

  expect(
    await screen.findByText("Couldn't load this transfer."),
  ).toBeOnTheScreen();
  expect(sentTransferDetailsReads()).toHaveLength(3);
});

it("keeps a transfer from its History row under the notice when the bank fails, and shows the bank's on Try again", async () => {
  serveTransferDetails({ ...AISYAH, note: "Lunch" });
  const recoverDetails = failTransferDetails();
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Aisyah Rahman")).toBeOnTheScreen();
  expect(
    screen.queryByText("Couldn't load this transfer."),
  ).not.toBeOnTheScreen();
  recoverDetails();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Lunch")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps a transfer from its History row under the notice when opened offline, and shows the bank's once back online", async () => {
  serveTransferDetails({ ...AISYAH, note: "Lunch" });
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await fireEvent.press(aisyah);

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Aisyah Rahman")).toBeOnTheScreen();
  expect(screen.queryByText("Lunch")).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Lunch")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps the transfer it has under the notice when asking again fails, and refreshes it on Try again", async () => {
  serveTransferDetails({ ...AISYAH, note: "Lunch" });
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  await screen.findByText("Lunch");
  await pressHardwareBack();
  serveTransferDetails({ ...AISYAH, version: 2, note: "Dinner" });
  const recoverDetails = failTransferDetails();

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Lunch")).toBeOnTheScreen();
  recoverDetails();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Dinner")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps the transfer it has under the notice when reopened offline, and refreshes it once back online", async () => {
  serveTransferDetails({ ...AISYAH, note: "Lunch" });
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  await screen.findByText("Lunch");
  await pressHardwareBack();
  serveTransferDetails({ ...AISYAH, version: 2, note: "Dinner" });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Lunch")).toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Dinner")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("announces no failure left from an earlier visit, only one from this visit", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  serveTransferDetails({ ...AISYAH, note: "Lunch" });
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  await screen.findByText("Lunch");
  await pressHardwareBack();
  failTransferDetails();
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  await pressHardwareBack();
  const releaseDetails = holdTransferDetails();
  announce.mockClear();

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(screen.getByText("Lunch")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalled();
  releaseDetails();
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(OUT_OF_DATE);
});

it("says it couldn't load a transfer opened offline with nothing loaded, and shows it once back online", async () => {
  serveTransferHistoryPages([[]]);
  serveTransferDetails(AISYAH);
  await renderRoute("/");
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await act(() => {
    router.push(`/transfer-history/${AISYAH.transferId}`);
  });

  expect(
    await screen.findByText("Couldn't load this transfer."),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading")).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Aisyah Rahman")).toBeOnTheScreen();
});

it.each([
  ["a sent transfer", {}, "Successful — money moved", "Completed"],
  [
    "an unsuccessful transfer whose money never left",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.NotDebited },
    "Unsuccessful — no money moved",
    "Unsuccessful",
  ],
  [
    "an unsuccessful transfer whose money came back",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.Refunded },
    "Unsuccessful — money returned",
    "Refunded",
  ],
])(
  "shows %s with its money, when it was sent and when it settled",
  async (_, transfer, status, settledLabel) => {
    await openTransferDetails({ ...AISYAH_IN_FULL, ...transfer });

    expect(await screen.findByText(status)).toBeOnTheScreen();
    expect(screen.getByText("Sent to")).toBeOnTheScreen();
    expect(screen.getByText("Sent")).toBeOnTheScreen();
    expect(screen.getByText(SENT_AT)).toBeOnTheScreen();
    expect(screen.getByText(settledLabel)).toBeOnTheScreen();
    expect(screen.getByText(SETTLED_AT)).toBeOnTheScreen();
  },
);

it("shows a refund still on its way as Unsuccessful alone, beside when it failed", async () => {
  await openTransferDetails({
    ...AISYAH_IN_FULL,
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.RefundPending,
  });

  expect(await screen.findByText(SETTLED_AT)).toBeOnTheScreen();
  expect(screen.getAllByText("Unsuccessful")).toHaveLength(2);
  expect(
    screen.queryByText(/money moved|money returned|not confirmed yet/),
  ).not.toBeOnTheScreen();
  expect(screen.queryByText("Refunded")).not.toBeOnTheScreen();
  expect(screen.getByText(SENT_AT)).toBeOnTheScreen();
});

it.each([
  [
    "a transfer still processing",
    { status: TransferStatus.Processing, underReview: false },
    "Processing — not confirmed yet",
  ],
  [
    "a transfer held for a security check",
    { status: TransferStatus.Processing },
    "Held for a security check — not confirmed yet",
  ],
])(
  "shows %s with when it was sent, and no time it settled",
  async (_, transfer, status) => {
    await openTransferDetails({ ...AISYAH_IN_FULL, ...transfer });

    expect(await screen.findByText(status)).toBeOnTheScreen();
    expect(screen.getByText(SENT_AT)).toBeOnTheScreen();
    expect(screen.queryByText(SETTLED_AT)).not.toBeOnTheScreen();
  },
);

it.each([
  [
    "awaiting approval",
    {
      status: TransferStatus.AwaitingApproval,
      funds: TransferFunds.NotDebited,
    },
    "Awaiting approval",
  ],
  [
    "expired",
    { status: TransferStatus.Expired, funds: TransferFunds.NotDebited },
    "Expired — no money moved",
  ],
])(
  "shows a linked transfer that is %s, which History never lists",
  async (_, transfer, status) => {
    await openTransferDetails({ ...AISYAH_IN_FULL, ...transfer });

    expect(await screen.findByText(status)).toBeOnTheScreen();
    expect(screen.getByText(SENT_AT)).toBeOnTheScreen();
    expect(screen.queryByText(SETTLED_AT)).not.toBeOnTheScreen();
  },
);

it("shows a received transfer with who sent it, and no word on the money", async () => {
  await openTransferDetails({
    ...AISYAH_IN_FULL,
    direction: TransferDirection.In,
    funds: TransferFunds.Credited,
  });

  expect(await screen.findByText("Received from")).toBeOnTheScreen();
  expect(screen.getAllByText("Received")).toHaveLength(2);
  expect(
    screen.queryByText(/money moved|money returned|not confirmed yet/),
  ).not.toBeOnTheScreen();
  expect(screen.getByText(SENT_AT)).toBeOnTheScreen();
  expect(screen.getByText("Completed")).toBeOnTheScreen();
  expect(screen.getByText(SETTLED_AT)).toBeOnTheScreen();
});

it("shows one time for a transfer that settled in the minute it was sent", async () => {
  await openTransferDetails({
    ...AISYAH_IN_FULL,
    updatedAt: "2026-10-05T15:42:40+08:00",
  });

  expect(await screen.findByText(SENT_AT)).toBeOnTheScreen();
  expect(screen.queryByText("Completed")).not.toBeOnTheScreen();
});

it.each([
  ["it was sent", { createdAt: "not a date" }, "Sent", SETTLED_AT],
  ["it settled", { updatedAt: "not a date" }, "Completed", SENT_AT],
])(
  "shows the rest of a transfer when it cannot read when %s",
  async (_, transfer, unreadLabel, readTime) => {
    await openTransferDetails({ ...AISYAH_IN_FULL, ...transfer });

    expect(
      await screen.findByText("Successful — money moved"),
    ).toBeOnTheScreen();
    expect(screen.queryByText(unreadLabel)).not.toBeOnTheScreen();
    expect(screen.getByText(readTime)).toBeOnTheScreen();
  },
);
