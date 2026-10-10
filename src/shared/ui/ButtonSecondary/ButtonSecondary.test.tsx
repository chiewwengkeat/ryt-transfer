import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import {
  buildHistoryTransfer,
  failTransferDetails,
  holdTransferDetails,
  serveTransferDetails,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";
import { mswServer, readsOfTheBalance } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";

it("keeps a pressed Try again busy and unpressable until its read answers, then shows what it brought", async () => {
  mswServer.use(http.get("*/accounts/primary", () => HttpResponse.error()));
  await renderRoute("/");
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  mswServer.resetHandlers();
  const answerBalance = holdTheBalanceRead();

  await fireEvent.press(tryAgain);

  expect(tryAgain).toBeBusy();
  expect(tryAgain).toBeDisabled();
  answerBalance();
  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
});

it("stays still while the balance card asks again by itself, offline, with nobody pressing", async () => {
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/");
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  holdTheBalanceRead();
  const balanceReadsBefore = readsOfTheBalance();

  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(readsOfTheBalance()).toBeGreaterThan(balanceReadsBefore);
  expect(tryAgain).not.toBeBusy();
  expect(tryAgain).toBeEnabled();
});

it("keeps a transfer's out-of-date notice, and its busy Try again, up until the read it asked for answers", async () => {
  const aisyah = buildHistoryTransfer();
  serveTransferHistoryPages([[aisyah]]);
  serveTransferDetails({ ...aisyah, version: 2, note: "Lunch" });
  const recoverDetails = failTransferDetails();
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  const outOfDate = await screen.findByText(
    "Couldn't refresh — these details may be out of date",
  );
  recoverDetails();
  const answerDetails = holdTransferDetails();

  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(outOfDate).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Try again" })).toBeBusy();
  answerDetails();
  expect(await screen.findByText("Lunch")).toBeOnTheScreen();
  expect(outOfDate).not.toBeOnTheScreen();
});

function holdTheBalanceRead() {
  let answer = () => undefined as void;
  const held = new Promise<void>((release) => {
    answer = release;
  });
  mswServer.use(
    http.get(
      "*/accounts/primary",
      async () => {
        await held;
      },
      { once: true },
    ),
  );
  return answer;
}
