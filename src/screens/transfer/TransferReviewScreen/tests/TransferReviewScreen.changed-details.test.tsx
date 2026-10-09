import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import {
  lookUpTestRecipient,
  readBankBalanceMinor,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

afterEach(() => {
  jest.restoreAllMocks();
});

const RECIPIENT_MOBILE = "012-345 6789";

// Home holds Transfer back until its first reads land, so a press made sooner does nothing.
async function waitForHomeToOfferTransfer() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });
}

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

function idempotencyKeysOfCreatesSent() {
  return sentRequests
    .filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname.endsWith("/transfers"),
    )
    .map((request) => request.headers.get("Idempotency-Key"));
}

function loseEveryTryOfTheFirstCreate() {
  // Its Transfer and both repeats.
  mswServer.use(
    ...Array.from({ length: 3 }, () =>
      http.post("*/transfers", () => HttpResponse.error(), { once: true }),
    ),
  );
}

it(
  "confirms changed details as a new transfer after Ryt did not answer",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    loseEveryTryOfTheFirstCreate();
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

    await pressHardwareBack();
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
      },
      { timeout: 15_000 },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(idempotencyKeysOfCreatesSent().at(-1)).not.toBe(unansweredKey);
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 5_000);
  }),
);

it(
  "says the details changed after Ryt did not answer when only the note changed",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    loseEveryTryOfTheFirstCreate();
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    );

    await pressHardwareBack();
    await fireEvent.changeText(
      screen.getByLabelText("Note (optional)"),
      "Lunch",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("Lunch")).toBeOnTheScreen();
    expect(reportedScenarios()).toContain(
      "transfer.details_changed_after_no_answer",
    );
  }),
);

it(
  "says the details changed after Ryt did not answer on review, not before it, when only the recipient changed",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    const otherMobile = "019-876 5432";
    const { recipient } = await lookUpTestRecipient(otherMobile);
    loseEveryTryOfTheFirstCreate();
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    );

    await pressHardwareBack();
    await pressHardwareBack();
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      otherMobile,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");

    expect(
      screen.queryByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeNull();
    await pressHardwareBack();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  }),
);

it("reopens review without saying the details changed when the same recipient is chosen again after Ryt did not answer", async () => {
  loseEveryTryOfTheFirstCreate();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );

  await pressHardwareBack();
  await pressHardwareBack();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText("RM 100.00")).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
    ),
  ).toBeNull();
});

it("reopens review without saying the details changed when nothing changed after Ryt did not answer", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  loseEveryTryOfTheFirstCreate();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );

  await pressHardwareBack();
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
    ),
  ).toBeNull();
});
