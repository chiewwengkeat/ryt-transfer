import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient } from "@/test/bank-client";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

const MOBILE = "012-345 6789";

it("checks the name again by itself once a request reaches the bank, after review opened while none could", async () => {
  const { recipient } = await lookUpTestRecipient(MOBILE);
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Try again" });
  mswServer.resetHandlers();

  // The amount step's balance poll, still mounted under review, is the request that gets through.
  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
});
