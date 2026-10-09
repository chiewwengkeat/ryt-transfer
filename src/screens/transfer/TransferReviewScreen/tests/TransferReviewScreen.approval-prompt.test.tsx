import { act, fireEvent, screen } from "@testing-library/react-native";
import { http } from "msw";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { failNextBiometricPrompt } from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  enterPinAndApprove,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

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
