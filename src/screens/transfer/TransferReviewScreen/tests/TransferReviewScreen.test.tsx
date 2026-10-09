import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  lookUpTestRecipient,
  readBankBalanceMinor,
  sendToBank,
  startTestTransfer,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import {
  biometricPromptsShown,
  holdNextBiometricPrompt,
} from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { observedRecords } from "@/test/doubles/native-doubles";
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

it(
  "shows the name and bank the bank holds for the number, and the number masked",
  scenarioTest("transfer.recipient_found", async () => {
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();

    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.idValueMasked)).toBeOnTheScreen();
    expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  }),
);

it(
  "signs what review shows and sends it, and the bank verifies it and moves the money",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    await screen.findByText("Transfer sent");
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it("signs the name, masked number, bank and amount review shows, and no note", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });

  const [prompt] = biometricPromptsShown();
  expect(JSON.parse(prompt?.data ?? "")).toMatchObject({
    registeredName: recipient.registeredName,
    idValueMasked: recipient.idValueMasked,
    bankCode: recipient.bankCode,
    amountMinor: 10_000,
    currency: "MYR",
    note: null,
  });
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
  expect(screen.getByText(recipient.idValueMasked)).toBeOnTheScreen();
  expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
  expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  releasePrompt();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("signs the note review shows and sends it with the transfer, which the bank then approves", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100("/transfer", "Lunch");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });

  const [prompt] = biometricPromptsShown();
  expect(JSON.parse(prompt?.data ?? "")).toMatchObject({ note: "Lunch" });
  const create = sentRequests.find(
    (request) =>
      request.method === "POST" &&
      /\/transfers$/.test(new URL(request.url).pathname),
  );
  expect(await create?.json()).toMatchObject({ note: "Lunch" });
  releasePrompt();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("reports each step of a sent transfer and each scenario it shows, with its amount, never with the recipient", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  expect(
    observedRecords
      .filter((record) => record.name === "transfer_step")
      .map((record) => record.properties),
  ).toEqual([
    { scenario: "transfer.balance_and_limit_shown" },
    { step: "reviewing", amountMinor: 10_000, currency: "MYR" },
    { scenario: "transfer.recipient_found" },
    { scenario: "transfer.first_transfer_to_recipient" },
    { step: "creating", amountMinor: 10_000, currency: "MYR" },
    {
      step: "approving",
      amountMinor: 10_000,
      currency: "MYR",
      path: "biometric",
    },
    { scenario: "transfer.biometrics_recognised" },
    {
      step: "submitting",
      amountMinor: 10_000,
      currency: "MYR",
      path: "biometric",
    },
    { step: "done" },
    { step: "editing" },
  ]);
});

it("sends a transfer to a passport recipient through review and its approval, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  await renderRoute("/transfer");
  await fireEvent.press(await screen.findByRole("radio", { name: "Passport" }));
  await fireEvent.changeText(
    screen.getByLabelText("Passport number"),
    "a1234567",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  expect(await screen.findByText("•••• 4567")).toBeOnTheScreen();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor - 10_000,
  );
});

it(
  "warns on a review reached from a recent recipient that the last transfer is still being checked",
  scenarioTest("transfer.earlier_transfer_unconfirmed", async () => {
    const {
      body: { customerId },
    } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
    const { created } = await startTestTransfer(10_000);
    await writePendingTransfer(customerId, {
      transferId: created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Processing,
    });
    mswServer.use(
      http.get("*/transfers/:transferId", () =>
        HttpResponse.json({
          transfer: {
            ...created.transfer,
            reference: "20261007C0FFEE00",
            status: TransferStatus.Processing,
            funds: TransferFunds.Debited,
          },
        }),
      ),
    );
    const {
      body: {
        items: [firstRecent],
      },
    } = await sendToBank<ListRecentRecipientsResponse>(
      "GET",
      "/recipients/recent",
    );
    await renderRoute("/");
    await waitForHomeToOfferTransfer();
    const [firstRecentButton] = await screen.findAllByRole("button", {
      name: /••••/,
    });
    await fireEvent.press(firstRecentButton!);
    await screen.findByText(firstRecent!.registeredName);
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
    expect(
      await screen.findByText(firstRecent!.idValueMasked),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeEnabled();
  }),
);

it(
  "goes Home from the receipt on Back, and the next transfer starts blank",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent");

    await pressHardwareBack();
    expect(view.getPathname()).toBe("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toHaveDisplayValue("");
  }),
);

function refuseCreatesKeepingTheirBodies() {
  const createBodies: unknown[] = [];
  // Refused, so no approval follows: these tests are about what the create carries.
  mswServer.use(
    http.post("*/transfers", async ({ request }) => {
      createBodies.push(await request.json());
      return HttpResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Test." } },
        { status: 400 },
      );
    }),
  );
  return createBodies;
}

it("shows the note on review, and sends it to the bank trimmed", async () => {
  const createBodies = refuseCreatesKeepingTheirBodies();
  await openReviewOfRm100("/transfer", "  Lunch with Ali  ");

  expect(await screen.findByText("Lunch with Ali")).toBeOnTheScreen();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await screen.findByText(
    "Something unexpected stopped the transfer — no money moved.",
  );
  expect(createBodies).toEqual([
    expect.objectContaining({ note: "Lunch with Ali" }),
  ]);
});

it("sends no note when the note is left blank", async () => {
  const createBodies = refuseCreatesKeepingTheirBodies();
  await openReviewOfRm100("/transfer", "   ");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await screen.findByText(
    "Something unexpected stopped the transfer — no money moved.",
  );
  expect(screen.queryByText("Note")).toBeNull();
  expect(createBodies).toHaveLength(1);
  expect(createBodies[0]).not.toHaveProperty("note");
});
