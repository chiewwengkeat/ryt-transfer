import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import {
  readBankBalanceMinor,
  sendToBank,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { scenarioTest, walkToTransferReview } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

import {
  askOpenReviewsNameCheckAgain,
  countSent,
  idempotencyKeysOfCreatesSent,
  RECIPIENT_MOBILE,
  waitForHomeToOfferTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

async function openReviewOfRm100(
  startPath: "/" | "/transfer" = "/transfer",
  note?: string,
) {
  const view = await renderRoute(startPath);
  if (startPath === "/") {
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  }
  await walkToTransferReview({ note });
  return view;
}

it("treats a key the bank says was used for other details as something unexpected", async () => {
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        { error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Test." } },
        { status: 409 },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(countSent("POST", "/transfers")).toBe(1);
});

it(
  "repeats an unanswered confirmation under its key, says Ryt could not be reached, and repeats it again when tried",
  scenarioTest("transfer.confirmation_unanswered", async () => {
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Ryt could not be reached — no money moved.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    const [unansweredKey] = idempotencyKeysOfCreatesSent();
    expect(unansweredKey).toEqual(expect.any(String));
    expect(idempotencyKeysOfCreatesSent()).toEqual(
      Array(3).fill(unansweredKey),
    );
    // The lost answers left the app offline until the amount step's balance poll gets through.
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
      },
      { timeout: 15_000 },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(
      await screen.findByText(
        "Ryt could not be reached — no money moved.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(idempotencyKeysOfCreatesSent()).toEqual(
      Array(6).fill(unansweredKey),
    );
  }),
);

it("goes on with the transfer the bank made once a repeat gets the answer that was lost, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      async ({ request }) => {
        await sendToBank("POST", "/transfers", {
          body: await request.json(),
          idempotencyKey: request.headers.get("Idempotency-Key"),
        });
        return HttpResponse.error();
      },
      { once: true },
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  expect(new Set(idempotencyKeysOfCreatesSent()).size).toBe(1);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("treats a server error naming no bank code as no answer, repeating the create under its key until one gets through", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    ...Array.from({ length: 3 }, () =>
      http.post(
        "*/transfers",
        () => new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
        { once: true },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  const [unansweredKey] = idempotencyKeysOfCreatesSent();
  expect(idempotencyKeysOfCreatesSent()).toEqual(Array(3).fill(unansweredKey));
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(idempotencyKeysOfCreatesSent()).toEqual(Array(4).fill(unansweredKey));
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("says Ryt could not be reached while the bank is still on the create, and repeats it under its key when tried", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "REQUEST_IN_PROGRESS", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(
    await screen.findByText("Ryt could not be reached — no money moved."),
  ).toBeOnTheScreen();
  const [inProgressKey] = idempotencyKeysOfCreatesSent();

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(idempotencyKeysOfCreatesSent()).toEqual([
    inProgressKey,
    inProgressKey,
  ]);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("repeats a create whose answer could not be read under its key, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      async ({ request }) => {
        await sendToBank("POST", "/transfers", {
          body: await request.json(),
          idempotencyKey: request.headers.get("Idempotency-Key"),
        });
        return new HttpResponse("<html>Created</html>", { status: 201 });
      },
      { once: true },
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  expect(new Set(idempotencyKeysOfCreatesSent()).size).toBe(1);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("sends a fresh create under a new key once review's name check, asked again after Ryt did not answer, gives a new reference", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  let createsLost = 0;
  let forwarding = false;
  // ⛔ Keep the forward: only a bank that made the first create refuses its key with another reference.
  mswServer.use(
    http.post("*/transfers", async ({ request }) => {
      if (forwarding || createsLost === 3) return undefined;
      createsLost += 1;
      forwarding = true;
      await sendToBank("POST", "/transfers", {
        body: await request.json(),
        idempotencyKey: request.headers.get("Idempotency-Key"),
      });
      forwarding = false;
      return HttpResponse.error();
    }),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );
  const [unansweredKey] = idempotencyKeysOfCreatesSent();
  await askOpenReviewsNameCheckAgain();
  // Until the new answer renders, Transfer still sends the earlier one, rightly under the kept key.
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(countSent("POST", "/recipients/lookup")).toBe(2);
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  const creates = sentRequests.filter(
    (request) =>
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/transfers"),
  );
  const [lostCreate] = creates;
  const freshCreate = creates.at(-1);
  const keys = creates.map((request) => request.headers.get("Idempotency-Key"));
  expect(keys.filter((key) => key !== unansweredKey)).toEqual([keys.at(-1)]);
  const lostBody = (await lostCreate?.json()) as { recipientRef: string };
  const freshBody = (await freshCreate?.json()) as { recipientRef: string };
  expect(freshBody.recipientRef).not.toBe(lostBody.recipientRef);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it.each([
  ["made", () => undefined],
  [
    "a refusal",
    () =>
      HttpResponse.json(
        { error: { code: "AMOUNT_INVALID", message: "Test." } },
        { status: 422 },
      ),
  ],
  ["lost, even after its repeats", () => HttpResponse.error()],
])(
  "never lets a transfer left mid-confirmation move or stop the one confirmed since, when its answer is %s",
  async (_, answerLeftTransferWith) => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    let answerLeftTransfer = () => {};
    const leftTransferAnswered = new Promise<void>((resolve) => {
      answerLeftTransfer = resolve;
    });
    let answerNewTransfer = () => {};
    const newTransferAnswered = new Promise<void>((resolve) => {
      answerNewTransfer = resolve;
    });
    // Holds both creates in flight; the newer one then falls through to the bank.
    mswServer.use(
      http.post("*/transfers", async ({ request }) => {
        const { amount } = (await request.clone().json()) as {
          amount: { minor: number };
        };
        if (amount.minor === 10_000) {
          await leftTransferAnswered;
          return answerLeftTransferWith();
        }
        await newTransferAnswered;
        return undefined;
      }),
    );
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    // Review offers no way out while confirming, so this stands in for any route that still could.
    await act(() => {
      router.dismissTo("/");
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await act(async () => {
      answerLeftTransfer();
      // Past a lost answer's two repeats, 2 s then 4 s apart, while the newer create is still held.
      await jest.advanceTimersByTimeAsync(7_000);
    });
    answerNewTransfer();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 5_000);
  },
);
