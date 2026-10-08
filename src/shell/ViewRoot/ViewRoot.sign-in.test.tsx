import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

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
  const nameChecksBeforeSignIn = sentRequests.filter(({ url }) =>
    url.endsWith("/recipients/lookup"),
  ).length;

  await fireEvent.press(signInAgain);

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(
    sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup")),
  ).toHaveLength(nameChecksBeforeSignIn + 1);
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
