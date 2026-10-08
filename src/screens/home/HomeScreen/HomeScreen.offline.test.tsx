import { act, screen } from "@testing-library/react-native";
import { http } from "msw";

import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

it("says the balance couldn't be loaded when the bank never answers it, and never counts the app offline for that", async () => {
  mswServer.use(
    http.get("*/accounts/primary", () => new Promise<never>(() => undefined)),
  );
  await renderRoute("/");

  await act(() => jest.advanceTimersByTimeAsync(30_000));

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
