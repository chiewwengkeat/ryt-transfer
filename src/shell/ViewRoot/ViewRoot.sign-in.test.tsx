import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

const sentNameChecks = () =>
  sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup"));

it("asks a name check the ended session interrupted again by itself once they sign back in", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const nameChecksBeforeSignIn = sentNameChecks().length;

  await fireEvent.press(signInAgain);

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn + 1);
});

it("asks an answered name check again once they sign back in, when the ended session cut off checking it again", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  const transferButton = await screen.findByRole("button", {
    name: "Transfer",
  });
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "RECIPIENT_REF_EXPIRED", message: "Test." } },
          { status: 422 },
        ),
      { once: true },
    ),
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await fireEvent.press(transferButton);
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const nameChecksBeforeSignIn = sentNameChecks().length;

  await fireEvent.press(signInAgain);

  // ⛔ Wait for the check first: review still shows its last Transfer for a moment after sign-in, so a find passes either way.
  await waitFor(() => {
    expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn + 1);
  });
  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
  expect(
    screen.queryByText(/Something unexpected stopped the transfer/),
  ).toBeNull();
});

it("keeps the name check review answered when they sign back in, and reads the rest of the app again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const requestsBeforeSignIn = sentRequests.length;

  await fireEvent.press(signInAgain);
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  const pathsAskedAtSignIn = sentRequests
    .slice(requestsBeforeSignIn)
    .map(({ url }) => new URL(url).pathname);
  expect(pathsAskedAtSignIn).toContainEqual(
    expect.stringMatching(/\/accounts\/primary$/),
  );
  expect(pathsAskedAtSignIn).not.toContainEqual(
    expect.stringMatching(/\/recipients\/lookup$/),
  );
});
