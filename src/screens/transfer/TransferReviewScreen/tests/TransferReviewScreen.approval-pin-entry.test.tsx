import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { rememberApprovalPinLocked } from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import {
  biometricPromptsShown,
  changeEnrolledBiometrics,
} from "@/test/doubles/biometrics-double";
import {
  isObscuredTouchGuardOn,
  setPhoneNetwork,
  touchThroughOverlay,
} from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { pressHardwareBack, scenarioTest } from "@/test/render/drive-app";
import { endTheSessionThroughAnotherRead } from "@/test/render/interrupt-app";
import { renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import {
  holdTheNextPost,
  walkToTransferReviewUntilTransferShows,
} from "./TransferReviewScreen.helper";

it(
  "asks for the PIN, saying why face or fingerprint approval isn't available, with no prompt",
  scenarioTest("transfer.biometrics_unavailable", async () => {
    await openPinSheetWithBiometricsOff();

    expect(
      screen.getByText(
        "Face or fingerprint approval isn't available, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("It's turned off in this app's settings."),
    ).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    expect(approvalsSent()).toEqual([]);
  }),
);

it("shows no demo PIN outside a demo build", async () => {
  await openPinSheetWithBiometricsOff();

  expect(screen.queryByText(/Demo PIN|246810/)).toBeNull();
});

it("keeps Approve off until all six digits are in, counting them without showing them", async () => {
  await openPinSheetWithBiometricsOff();

  await typeDigits("24681");
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByText("Enter all 6 digits of your PIN.")).toBeOnTheScreen();
  expect(screen.getByLabelText("PIN, 5 of 6 digits entered")).toBeOnTheScreen();
  await typeDigits("0");
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  expect(screen.queryByText("246810")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
});

it("gives a screen reader the Delete key by its label, never its glyph", async () => {
  await openPinSheetWithBiometricsOff();

  expect(screen.getByRole("button", { name: "Delete" })).toBeOnTheScreen();
  expect(screen.queryByText("⌫")).toBeNull();
  expect(
    screen.getByText("⌫", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("drops touches while another app draws over the PIN pad, says why, and stops guarding once closed", async () => {
  await openPinSheetWithBiometricsOff();
  expect(isObscuredTouchGuardOn()).toBe(true);

  await act(() => {
    touchThroughOverlay();
  });

  expect(
    screen.getByText(
      "Another app is drawing over the screen. Close it to enter your PIN.",
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(isObscuredTouchGuardOn()).toBe(false);
});

it("stops guarding when the session's end closes the sheet mid-entry, and opens the next approval's sheet with no digits and no dropped-touch notice", async () => {
  await openPinSheetWithBiometricsOff();
  await typeDigits("246");
  await act(() => {
    touchThroughOverlay();
  });
  expect(
    screen.getByText(
      "Another app is drawing over the screen. Close it to enter your PIN.",
    ),
  ).toBeOnTheScreen();

  const signInButton = await endTheSessionThroughAnotherRead();
  expect(isObscuredTouchGuardOn()).toBe(false);
  await fireEvent.press(signInButton);
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Approve with your PIN");

  expect(isObscuredTouchGuardOn()).toBe(true);
  expect(screen.getByLabelText("PIN, 0 of 6 digits entered")).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "Another app is drawing over the screen. Close it to enter your PIN.",
    ),
  ).toBeNull();
});

it.each([
  [
    "it was locked before Transfer was pressed",
    async () => {
      await pairPhoneAsTheDemoLaunchDoes();
      approvalSettingsStore.setState({ biometricApprovalOn: false });
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
      await act(rememberApprovalPinLocked);
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
  [
    "the face or fingerprints changed while it was locked",
    async () => {
      await pairPhoneAsTheDemoLaunchDoes();
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
      await act(rememberApprovalPinLocked);
      changeEnrolledBiometrics();
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
])(
  "drops touches on a sheet that opens on a locked PIN when %s, says why, and stops guarding once closed",
  async (_, openSheetOnLockedPin) => {
    await openSheetOnLockedPin();
    await screen.findByRole("header", { name: "PIN locked" });
    expect(isObscuredTouchGuardOn()).toBe(true);

    await act(() => {
      touchThroughOverlay();
    });

    expect(
      screen.getByText(
        "Another app is drawing over the screen. Close it to enter your PIN.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(isObscuredTouchGuardOn()).toBe(false);
  },
);

it("keeps the sheet, its guard and a touch dropped while sending through a wrong PIN, which clears the digits, and through the lock that replaces it", async () => {
  await openPinSheetWithBiometricsOff();
  const wrongPinApproval = holdTheNextPost("*/transfers/:transferId/approve");
  await typeDigits("111111");
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
  await wrongPinApproval.waitUntilSent();
  await act(() => {
    touchThroughOverlay();
  });
  wrongPinApproval.release();

  expect(
    await screen.findByText("That PIN is incorrect. You have 2 tries left."),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("PIN, 0 of 6 digits entered")).toBeOnTheScreen();
  expect(
    screen.getByText(
      "Another app is drawing over the screen. Close it to enter your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(isObscuredTouchGuardOn()).toBe(true);

  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "PIN_LOCKED", message: "Test." } },
          { status: 423 },
        ),
      { once: true },
    ),
  );
  const lockingApproval = holdTheNextPost("*/transfers/:transferId/approve");
  await typeDigits("111111");
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
  await lockingApproval.waitUntilSent();
  await act(() => {
    touchThroughOverlay();
  });
  lockingApproval.release();

  expect(
    await screen.findByRole("header", { name: "PIN locked" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      "Another app is drawing over the screen. Close it to enter your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(isObscuredTouchGuardOn()).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(isObscuredTouchGuardOn()).toBe(false);
});

it("pauses Approve while the phone is offline, and keeps the keypad open", async () => {
  await openPinSheetWithBiometricsOff();
  await typeDigits("246810");

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(
    screen.getByText(
      "You're offline. Sending is paused until Ryt can be reached.",
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByLabelText("PIN, 5 of 6 digits entered")).toBeOnTheScreen();
});

it("cannot be closed once the PIN is on its way to the bank", async () => {
  let answerApproval = () => {};
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        new Promise<undefined>((resolve) => {
          answerApproval = () => {
            resolve(undefined);
          };
        }),
      { once: true },
    ),
  );
  await openPinSheetWithBiometricsOff();
  await typeDigits("246810");

  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
  await pressHardwareBack();

  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  expect(screen.getByText("Approve with your PIN")).toBeOnTheScreen();
  answerApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it(
  "says the transfer was not sent when the PIN sheet is closed without approving",
  scenarioTest("transfer.approval_cancelled", async () => {
    await openPinSheetWithBiometricsOff();

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(
      await screen.findByText("The transfer was not sent — no money moved."),
    ).toBeOnTheScreen();
    expect(approvalsSent()).toEqual([]);
  }),
);

async function openPinSheetWithBiometricsOff() {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
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
  await screen.findByText("Approve with your PIN");
}

async function typeDigits(digits: string) {
  for (const digit of digits)
    await fireEvent.press(screen.getByRole("button", { name: digit }));
}

function approvalsSent() {
  return sentRequests.filter((request) =>
    new URL(request.url).pathname.endsWith("/approve"),
  );
}
