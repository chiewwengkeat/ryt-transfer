import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient, readBankBalanceMinor } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const MOBILE = "012-345 6789";

async function openReviewOfRm100() {
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  return view;
}

it(
  "shows the name and bank the bank holds for the number",
  scenarioTest("transfer.recipient_found", async () => {
    const { recipient } = await lookUpTestRecipient(MOBILE);
    await openReviewOfRm100();

    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  }),
);

it(
  "asks for a second look at the name on a first transfer to the recipient",
  scenarioTest("transfer.first_transfer_to_recipient", async () => {
    await openReviewOfRm100();

    expect(
      await screen.findByText(
        "This is your first transfer to this recipient. Check the name is who you expect.",
      ),
    ).toBeOnTheScreen();
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
    // The bank answers after a delay, which the route's fake timers would hold forever.
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

it("asks for a face or fingerprint only, never the phone's passcode", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  expect(phoneKeyOptions()).toContainEqual(
    expect.objectContaining({
      keyType: "ec256",
      biometricStrength: "strong",
      allowDeviceCredentials: false,
    }),
  );
  expect(biometricPromptsShown()).toEqual([
    expect.objectContaining({
      biometricStrength: "strong",
      disableDeviceFallback: true,
    }),
  ]);
});

it("states the amount and the recipient's registered name in the face or fingerprint prompt", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const { recipient } = await lookUpTestRecipient(MOBILE);
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  expect(biometricPromptsShown()).toEqual([
    expect.objectContaining({
      promptTitle: "Approve transfer",
      promptSubtitle: `RM 100.00 to ${recipient.registeredName}`,
    }),
  ]);
});

it("says the transfer was not sent when the face or fingerprint prompt is closed", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  cancelNextBiometricPrompt();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
});

it.each([
  ["a refusal that proves no money moved", 403, "APPROVAL_INVALID", false],
  ["a code the app does not know", 400, "NEW_BANK_CODE", true],
])(
  "answers %s according to whether money may have moved",
  async (_, status, code, mayHaveMoved) => {
    await pairPhoneAsTheDemoLaunchDoes();
    mswServer.use(
      http.post("*/transfers/:transferId/approve", () =>
        HttpResponse.json({ error: { code, message: "Test." } }, { status }),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        mayHaveMoved
          ? "The bank's answer did not arrive. Check History before sending this again — not confirmed yet."
          : "The transfer was not sent — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" }) === null).toBe(
      mayHaveMoved,
    );
  },
);

it(
  "keeps review open when Back is pressed mid-approval, so the lost answer is told and one intended transfer debits once",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    let releaseApproval: () => void = () => undefined;
    const approvalHeld = new Promise<void>((release) => {
      releaseApproval = () => {
        release();
      };
    });
    // Holds the approval in flight, then falls through to the scenario, which commits it and loses the answer.
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        async () => {
          await approvalHeld;
        },
        { once: true },
      ),
    );
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Sending your transfer. The bank's answer comes next.",
    );
    await pressHardwareBack();
    releaseApproval();

    expect(
      await screen.findByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    await pressHardwareBack();
    expect(view.getPathname()).toBe("/transfer/review");
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

it(
  "starts the next transfer blank after going Home from an approval whose answer was lost",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Back to Home" }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toHaveDisplayValue("");
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it(
  "never reopens review after a lost answer, even from the amount step behind it",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByRole("button", { name: "Back to Home" });

    // Review offers no way back after a lost answer, so this stands in for any route that still could.
    await act(() => {
      router.back();
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Review" }),
    );

    expect(view.getPathname()).toBe("/transfer/amount");
    expect(screen.queryByText("This screen stopped working.")).toBeNull();
  }),
);

it("never offers to send again when the approval's answer is lost", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Back to Home" }),
  ).toBeOnTheScreen();
});
