import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient, readBankBalanceMinor } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
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
