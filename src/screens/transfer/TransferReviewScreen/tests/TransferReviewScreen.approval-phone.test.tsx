import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { rememberApprovalPinLocked } from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import {
  biometricPromptsShown,
  changeEnrolledBiometrics,
  failNextBiometricPrompt,
  reportBiometricSensorUnavailable,
} from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { readBankBalanceMinor, sentRequests } from "@/test/mock-bank/mock-bank";
import {
  enterPinAndApprove,
  moveAppTo,
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import {
  reportedScenarios,
  secureStoreNativeDouble,
} from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

afterEach(() => {
  jest.restoreAllMocks();
});

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

function countSent(method: string, pathEnd: string) {
  return sentRequests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname.endsWith(pathEnd),
  ).length;
}

const DEMO_PIN = "246810";

async function pairPhoneAndOpenReviewOfRm100() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
  await screen.findByRole("button", { name: "Transfer" });
  return view;
}

async function confirmRm100Transfer() {
  const view = await pairPhoneAndOpenReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  return view;
}

it("asks the phone again on coming back to the app, taking the PIN choice away once nothing is enrolled", async () => {
  await pairPhoneAndOpenReviewOfRm100();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  reportBiometricSensorUnavailable("BIOMETRY_NOT_ENROLLED");
  await act(() => {
    moveAppTo("active");
  });

  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
  });
});

it(
  "turns a prompt the phone locked after too many attempts into the PIN sheet, which approves",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("BIOMETRIC_LOCKOUT");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "There were too many attempts, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.biometrics_locked_out");
    await enterPinAndApprove(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it(
  "reports the PIN locked, not why the PIN was wanted, when the phone locks face and fingerprint while the bank holds the PIN locked",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("BIOMETRIC_LOCKOUT");
    await pairPhoneAndOpenReviewOfRm100();
    await act(rememberApprovalPinLocked);

    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(
      await screen.findByRole("header", { name: "PIN locked" }),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.pin_locked");
    expect(reportedScenarios()).not.toContain("transfer.biometrics_locked_out");
  }),
);

it(
  "turns a key that cannot sign after Android's own lockout recovery into the PIN sheet, which approves",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("KEY_USER_NOT_AUTHENTICATED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "There were too many attempts, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    await enterPinAndApprove(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("still offers Use PIN instead while the phone reports face and fingerprint locked", async () => {
  reportBiometricSensorUnavailable("BIOMETRY_LOCKOUT");
  await pairPhoneAndOpenReviewOfRm100();

  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );

  expect(
    await screen.findByText("Enter your bank PIN to approve this transfer."),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

it("opens the PIN sheet with no prompt while the phone reports face and fingerprint locked", async () => {
  reportBiometricSensorUnavailable("BIOMETRY_LOCKOUT");
  await confirmRm100Transfer();

  expect(
    await screen.findByText(
      "There were too many attempts, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

it.each([
  [
    "nothing is enrolled",
    "BIOMETRY_NOT_ENROLLED",
    "No face or fingerprint is set up on this phone.",
  ],
  [
    "the phone has no usable sensor",
    "BIOMETRY_NOT_AVAILABLE",
    "This phone has no face or fingerprint sensor the app can use.",
  ],
])(
  "offers no PIN instead and asks for the PIN itself, saying why, when %s",
  async (_, sensorCode, reason) => {
    reportBiometricSensorUnavailable(sensorCode);
    await pairPhoneAndOpenReviewOfRm100();

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Use PIN instead" }),
      ).toBeNull();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText(reason)).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Face or fingerprint approval isn't available, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
  },
);

it(
  "approves with the PIN when a new face or fingerprint has killed the phone's key",
  scenarioTest("transfer.biometrics_changed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    changeEnrolledBiometrics();
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
      ),
    ).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    expect(reportedScenarios()).toContain("transfer.biometrics_changed");
    await enterPinAndApprove(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("offers to try again or leave when the phone cannot read its approval key", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  await openReviewOfRm100();
  jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockRejectedValueOnce(new Error("Test."));

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the approval — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor,
  );
});

it("closes the PIN sheet and offers to try again or leave when the phone cannot read its approval key after the PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  for (const digit of "246810")
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  const readSecureValue = secureStoreNativeDouble.getValueWithKeyAsync;
  jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockImplementation((key: string) =>
      key.includes("possession-key-id")
        ? Promise.reject(new Error("Test."))
        : readSecureValue(key),
    );

  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));

  expect(
    await screen.findByText(
      "Something unexpected stopped the approval — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(countSent("POST", "/approve")).toBe(0);
});
