import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

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
