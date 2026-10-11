import { toMalaysianDateKey } from "@/shared/lib/dates/dates";
import {
  buildHistoryTransfer,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
  serveTransferHistoryResponses,
} from "@/test/fixtures/transfer-responses";
import { moveAppTo } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen } from "@testing-library/react-native";

it("collapses a day to its header and expands it again, saying which it is", async () => {
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: true,
    }),
  );

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
  );

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("keeps a collapsed day collapsed through a refresh that brings it nothing new, and opens a new day", async () => {
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
    }),
  );
  serveTransferHistoryPages([
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-06T10:20:00+08:00",
      }),
      buildHistoryTransfer(),
    ],
  ]);

  await fireEvent(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
    "refresh",
  );

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();
});

it("opens a collapsed day again when the next page brings rows it did not have", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-05T09:15:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  );
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();

  releaseLaterPages();

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
});

it("heads a day with the latest summary the bank sent for it", async () => {
  serveTransferHistoryResponses([
    {
      items: [buildHistoryTransfer()],
      days: [
        {
          date: "2026-10-05",
          count: 2,
          net: { minor: -10000, currency: "MYR" },
        },
      ],
    },
    {
      items: [
        buildHistoryTransfer({
          registeredName: "Lim Wei Jie",
          createdAt: "2026-10-05T09:15:00+08:00",
        }),
      ],
      days: [
        {
          date: "2026-10-05",
          count: 3,
          net: { minor: -15000, currency: "MYR" },
        },
      ],
    },
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  ).toBeOnTheScreen();

  releaseLaterPages();

  expect(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 3 transfers, -RM 150.00",
    }),
  ).toBeOnTheScreen();
});

it("keeps a day open that a later page reopened when a pull trims that page away", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-05T09:15:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  );
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  const releaseLaterPagesAgain = holdTransferHistoryPages("later");

  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  releaseLaterPagesAgain();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("moves a day from Today to Yesterday at Malaysian midnight", async () => {
  const today = toMalaysianDateKey(new Date().toISOString());
  serveTransferHistoryPages([
    [buildHistoryTransfer({ createdAt: `${today}T00:00:00+08:00` })],
  ]);
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "Today, 1 transfer, -RM 50.00",
    }),
  ).toBeOnTheScreen();
  const tomorrow = toMalaysianDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );

  await act(() => {
    jest.advanceTimersByTime(
      Date.parse(`${tomorrow}T00:00:00+08:00`) - Date.now(),
    );
  });

  expect(
    screen.getByRole("button", { name: "Yesterday, 1 transfer, -RM 50.00" }),
  ).toBeOnTheScreen();
});

it("moves a day from Today to Yesterday when the app returns after Malaysian midnight", async () => {
  const today = toMalaysianDateKey(new Date().toISOString());
  serveTransferHistoryPages([
    [buildHistoryTransfer({ createdAt: `${today}T00:00:00+08:00` })],
  ]);
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "Today, 1 transfer, -RM 50.00",
    }),
  ).toBeOnTheScreen();
  const tomorrow = toMalaysianDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );
  // The clock moves with no timer firing, as it does for an app the phone suspended.
  jest.setSystemTime(Date.parse(`${tomorrow}T00:00:01+08:00`));

  await act(() => {
    moveAppTo("background");
    moveAppTo("active");
  });

  expect(
    screen.getByRole("button", { name: "Yesterday, 1 transfer, -RM 50.00" }),
  ).toBeOnTheScreen();
});
