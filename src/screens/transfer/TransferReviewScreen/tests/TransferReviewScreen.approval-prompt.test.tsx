import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http } from "msw";
import { Platform } from "react-native";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  lookUpTestRecipient,
  mswServer,
  readBankBalanceMinor,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  failNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  enterPinAndApprove,
  readBankOnRealTimers,
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

function approveRequests() {
  return sentRequests.filter((request) =>
    new URL(request.url).pathname.endsWith("/approve"),
  );
}

it(
  "says the face or fingerprint was not recognised, sends nothing, and leaves Transfer to try again or the PIN to approve",
  scenarioTest("transfer.biometrics_not_recognised", async () => {
    failNextBiometricPrompt("AUTHENTICATION_FAILED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Your face or fingerprint was not recognised. You can try again, or use your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
    expect(approveRequests()).toEqual([]);
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    await enterPinAndApprove(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("offers no PIN instead while the transfer is being sent", async () => {
  let releaseApproval: () => void = () => undefined;
  const approvalHeld = new Promise<void>((release) => {
    releaseApproval = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      async () => {
        await approvalHeld;
      },
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  releaseApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("offers no PIN instead while face or fingerprint approval is turned off, Transfer asking for the PIN itself", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAndOpenReviewOfRm100();

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  expect(
    await screen.findByText("It's turned off in this app's settings."),
  ).toBeOnTheScreen();
});

it("takes the PIN choice away once face or fingerprint approval is turned off with review open", async () => {
  await pairPhoneAndOpenReviewOfRm100();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  await act(() => {
    approvalSettingsStore.setState({ biometricApprovalOn: false });
  });

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
});

it("says the transfer was not sent when the prompt is closed with Android's cancel", async () => {
  failNextBiometricPrompt("USER_CANCELED");
  await confirmRm100Transfer();

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(approveRequests()).toEqual([]);
});

it("says the transfer was not sent when Android cancels its own prompt", async () => {
  failNextBiometricPrompt("SYSTEM_CANCELED");
  await confirmRm100Transfer();

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(approveRequests()).toEqual([]);
});

it(
  "stops before anything is sent when the prompt fails in a way the app does not name",
  scenarioTest("transfer.approval_unexpected", async () => {
    failNextBiometricPrompt("SIGNATURE_CREATION_FAILED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Something unexpected stopped the approval — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(approveRequests()).toEqual([]);
  }),
);

it(
  "approves with the PIN when it is chosen instead of a face or fingerprint, with no prompt",
  scenarioTest("transfer.pin_chosen", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Use PIN instead" }),
    );
    expect(
      await screen.findByText("Enter your bank PIN to approve this transfer."),
    ).toBeOnTheScreen();
    for (const digit of "246810")
      await fireEvent.press(screen.getByRole("button", { name: digit }));
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    expect(reportedScenarios()).toContain("transfer.pin_chosen");
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

// The OS draws the prompt out of Jest's sight, so these three read what the app hands the library.
it(
  "asks for a face or fingerprint only, never the phone's passcode",
  scenarioTest("transfer.biometrics_recognised", async () => {
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
  }),
);

it(
  "hands the iOS face or fingerprint prompt a title stating the amount and the recipient's registered name",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent");

    expect(biometricPromptsShown()).toEqual([
      expect.objectContaining({
        promptTitle: `Approve RM 100.00 to ${recipient.registeredName}`,
      }),
    ]);
  }),
);

it(
  "hands the Android face or fingerprint prompt the amount and the recipient's registered name under its title",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();
    const platformOs = jest.replaceProperty(Platform, "OS", "android");

    try {
      await fireEvent.press(
        await screen.findByRole("button", { name: "Transfer" }),
      );
      await screen.findByText("Transfer sent");
    } finally {
      platformOs.restore();
    }

    expect(biometricPromptsShown()).toEqual([
      expect.objectContaining({
        promptTitle: "Approve transfer",
        promptSubtitle: `RM 100.00 to ${recipient.registeredName}`,
      }),
    ]);
  }),
);

it(
  "says the transfer was not sent when the face or fingerprint prompt is closed",
  scenarioTest("transfer.approval_cancelled", async () => {
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
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor,
    );
  }),
);

it("says face or fingerprint approval is unavailable while it is turned off, and sends no approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Face or fingerprint approval isn't available, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
  const sentPaths = sentRequests.map(
    ({ method, url }) => `${method} ${new URL(url).pathname}`,
  );
  expect(sentPaths).toContain("POST /transfers");
  expect(sentPaths.filter((path) => path.endsWith("/approve"))).toEqual([]);
});
