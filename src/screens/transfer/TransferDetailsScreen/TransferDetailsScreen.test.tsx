import { act, fireEvent, screen } from "@testing-library/react-native";

import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { pressHardwareBack } from "@/test/hardware-back";
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
