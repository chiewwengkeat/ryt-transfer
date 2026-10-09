import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { delay, http, HttpResponse } from "msw";

import { requestJson } from "@/shared/http/transport/transport";
import { lookUpTestRecipient } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

const sentNameChecks = () =>
  sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup"));

const TOO_MANY_NAME_CHECKS =
  "Too many name checks in a short time. Try again in a minute.";

async function reviewRm100ToTheTestRecipient() {
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
}

async function endSessionWithAnyRequest() {
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

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

it("asks a name check the network cut off again by itself once they sign back in", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  let networkDown = true;
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      networkDown ? HttpResponse.error() : undefined,
    ),
  );
  await reviewRm100ToTheTestRecipient();
  await screen.findByText(/Something unexpected stopped the transfer/);
  await endSessionWithAnyRequest();
  const nameChecksBeforeSignIn = sentNameChecks().length;
  networkDown = false;

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn + 1);
});

it("asks a name check that ran out of time again by itself once they sign back in", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  let bankSlow = true;
  mswServer.use(
    http.post("*/recipients/lookup", async () => {
      if (bankSlow) await delay("infinite");
    }),
  );
  await reviewRm100ToTheTestRecipient();
  // Three tries of 10 seconds each, the retries 1 and 2 seconds apart.
  await act(() => jest.advanceTimersByTimeAsync(33_000));
  await screen.findByText(/Something unexpected stopped the transfer/);
  await endSessionWithAnyRequest();
  const nameChecksBeforeSignIn = sentNameChecks().length;
  bankSlow = false;

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn + 1);
});

it("asks a name check a server error failed again by itself once they sign back in", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  let serverFailing = true;
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      serverFailing ? new HttpResponse(null, { status: 500 }) : undefined,
    ),
  );
  await reviewRm100ToTheTestRecipient();
  await screen.findByText(/Something unexpected stopped the transfer/);
  await endSessionWithAnyRequest();
  const nameChecksBeforeSignIn = sentNameChecks().length;
  serverFailing = false;

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn + 1);
});

it("keeps a name check the bank said it could not run when they sign back in, rather than asking it again", async () => {
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      HttpResponse.json(
        { error: { code: "NAME_ENQUIRY_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    ),
  );
  await reviewRm100ToTheTestRecipient();
  await screen.findByText("Recipient names can't be confirmed right now.");
  await endSessionWithAnyRequest();
  const nameChecksBeforeSignIn = sentNameChecks().length;

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn);
  expect(
    screen.getByText("Recipient names can't be confirmed right now."),
  ).toBeOnTheScreen();
});

it("keeps a name check the bank refused when they sign back in, rather than asking it again", async () => {
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "TOO_MANY_LOOKUPS", message: "Test." } },
          { status: 429 },
        ),
      { once: true },
    ),
  );
  await reviewRm100ToTheTestRecipient();
  await screen.findByText(TOO_MANY_NAME_CHECKS);
  await endSessionWithAnyRequest();
  const nameChecksBeforeSignIn = sentNameChecks().length;

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(sentNameChecks()).toHaveLength(nameChecksBeforeSignIn);
  expect(screen.getByText(TOO_MANY_NAME_CHECKS)).toBeOnTheScreen();
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
