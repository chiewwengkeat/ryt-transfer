import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo } from "react-native";

import { sentRequests } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";
import {
  buildHistoryTransfer,
  failTransferHistoryPages,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";

const sentTransferHistoryCursors = () =>
  sentRequests
    .map(({ url }) => new URL(url))
    .filter(({ pathname }) => pathname.endsWith("/transfers"))
    .map(({ searchParams }) => searchParams.get("cursor"));

const LIM_ON_4_OCTOBER = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "2026-10-04T13:05:00+08:00",
});
const OUT_OF_DATE = "Couldn't refresh — this list may be out of date";

it("offers Retry when the next page fails, asks no more by itself, and shows the page once a retry lands", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const recoverLaterPages = failTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();
  const failedRequestCount = sentTransferHistoryCursors().length;

  await fireEvent.press(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(screen.getByText("Couldn't load more.")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toHaveLength(failedRequestCount);
  recoverLaterPages();
  const releaseLaterPages = holdTransferHistoryPages("later");
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByLabelText("Loading more transfers"),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeOnTheScreen();
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("offers Try again when the first page fails, and lists the transfers once it lands", async () => {
  const recoverFirstPage = failTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  recoverFirstPage();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("asks three times before saying the first page failed", async () => {
  failTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null, null]);
});

it("asks three times before saying the first page failed when the bank takes too long", async () => {
  holdTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  await act(() => jest.advanceTimersByTimeAsync(15_000));
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null]);
  await act(() => jest.advanceTimersByTimeAsync(20_000));

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null, null]);
});

it("asks three times for the next page before offering Retry", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  failTransferHistoryPages("later");
  await renderRoute("/transfer-history");

  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([
    null,
    "page-2",
    "page-2",
    "page-2",
  ]);
});

it("keeps the rows under a notice when a refresh fails, and refreshes them on Try again", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  const recoverFirstPage = failTransferHistoryPages("first");

  await fireEvent(aisyah, "refresh");

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("Couldn't load your transfers."),
  ).not.toBeOnTheScreen();
  recoverFirstPage();
  serveTransferHistoryPages([[LIM_ON_4_OCTOBER]]);
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps the notice while an older page loads after a refresh fails, until a pull brings the newest page", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/transfer-history");
  await screen.findByRole("button", { name: /^Lim Wei Jie/ });
  const recoverFirstPage = failTransferHistoryPages("first");

  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );

  await waitFor(() => {
    expect(sentTransferHistoryCursors()).toEqual([
      null,
      "page-2",
      null,
      null,
      null,
      "page-2",
    ]);
  });
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.getByText(OUT_OF_DATE)).toBeOnTheScreen();
  recoverFirstPage();
  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );
  await waitFor(() => {
    expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  });
});

it("keeps the notice beside the footer's Retry when an older page fails after a refresh fails, until Try again brings the newest page", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/transfer-history");
  await screen.findByRole("button", { name: /^Lim Wei Jie/ });
  const recoverFirstPage = failTransferHistoryPages("first");
  failTransferHistoryPages("later");

  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );

  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
  expect(screen.getByText(OUT_OF_DATE)).toBeOnTheScreen();
  recoverFirstPage();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => {
    expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  });
});

it("keeps the notice while Try again is on its way after a refresh fails, until a refresh lands", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  const recoverFirstPage = failTransferHistoryPages("first");
  await fireEvent(aisyah, "refresh");
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  const firstPageAsks = sentTransferHistoryCursors().filter(
    (cursor) => cursor === null,
  ).length;

  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => {
    expect(
      sentTransferHistoryCursors().filter((cursor) => cursor === null),
    ).toHaveLength(firstPageAsks + 1);
  });
  expect(screen.getByText(OUT_OF_DATE)).toBeOnTheScreen();
  recoverFirstPage();
  await waitFor(() => {
    expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  });
});

it("announces no failure left from an earlier visit, only one from this visit", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  failTransferHistoryPages("first");
  await fireEvent(aisyah, "refresh");
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  const releaseFirstPage = holdTransferHistoryPages("first");
  announce.mockClear();

  await act(() => {
    router.push("/transfer-history");
  });

  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalled();
  releaseFirstPage();
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(OUT_OF_DATE);
});
