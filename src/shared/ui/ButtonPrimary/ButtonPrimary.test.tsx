import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http } from "msw";

import { mswServer } from "@/test/mock-bank/msw-server";
import { renderRoute } from "@/test/render/render-route";

function holdTheRequest(path: string) {
  let answer: () => void = () => undefined;
  const held = new Promise<void>((release) => {
    answer = release;
  });
  mswServer.use(
    http.get(
      path,
      async () => {
        await held;
      },
      { once: true },
    ),
  );
  return answer;
}

it("says why Home's Transfer is disabled, on screen and to a screen reader, and ignores a press", async () => {
  const loadingReason =
    "You can send once your balance and today's limit have loaded.";
  const answerBalance = holdTheRequest("*/accounts/primary");
  const view = await renderRoute("/");
  const transfer = screen.getByRole("button", { name: "Transfer" });

  await fireEvent.press(transfer);

  expect(transfer).toBeDisabled();
  expect(screen.getByHintText(loadingReason)).toBe(transfer);
  expect(screen.getByText(loadingReason)).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
  answerBalance();
  await screen.findByText("RM 12,845.50");
});

it("shows Continue busy under its own name while a linked recent recipient loads, and ignores a press", async () => {
  const answerRecents = holdTheRequest("*/recipients/recent");
  const view = await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer",
      params: { recentId: "rcp_linked_from_home" },
    });
  });
  const continueButton = await screen.findByRole("button", {
    name: "Continue",
  });

  await fireEvent.press(continueButton);

  expect(continueButton).toBeBusy();
  answerRecents();
  await waitFor(() => {
    expect(continueButton).not.toBeBusy();
  });
  expect(view.getPathname()).toBe("/transfer");
  expect(
    screen.queryByText("Enter a Malaysian mobile number, like 012-345 6789."),
  ).toBeNull();
});
