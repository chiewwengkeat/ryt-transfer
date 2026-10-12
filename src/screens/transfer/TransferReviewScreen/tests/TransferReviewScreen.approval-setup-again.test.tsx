import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  biometricPromptsShown,
  changeEnrolledBiometrics,
  enrolFirstBiometric,
  refuseBiometricKeys,
  reportBiometricSensorUnavailable,
} from "@/test/doubles/biometrics-double";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import {
  pairPhoneAsTheDemoLaunchDoes,
  pairPhoneBeforeTheBankForgetsItsKeys,
} from "@/test/mock-bank/demo-pairing";
import {
  mswServer,
  readBankBalanceMinor,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { enterPinAndApprove, scenarioTest } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import {
  approveRequests,
  walkToTransferReviewAndPressTransfer,
  walkToTransferReviewUntilTransferShows,
} from "./TransferReviewScreen.helper";

it(
  "sets face or fingerprint approval up again with the PIN that approved the transfer, so the next one needs no PIN",
  scenarioTest("transfer.biometrics_changed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    changeEnrolledBiometrics();
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
    await enterPinAndApprove(DEMO_PIN);
    await screen.findByText("Transfer sent");

    await sendAnotherRm100TransferFromResult();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toHaveLength(1);
    const keyRegistration = sentRequests
      .filter((request) => new URL(request.url).pathname === "/approval-keys")
      .at(-1);
    const keyRegistrationBody = (await keyRegistration?.json()) as unknown;
    expect(keyRegistrationBody).toHaveProperty("pin", DEMO_PIN);
    expect(keyRegistrationBody).toHaveProperty("biometricPublicKey");
    expect(keyRegistrationBody).not.toHaveProperty("possessionPublicKey");
  }),
);

it(
  "sets face or fingerprint approval up with the PIN once one is enrolled on a phone paired without it",
  scenarioTest("transfer.biometrics_changed", async () => {
    reportBiometricSensorUnavailable("BiometricErrorNoneEnrolled");
    refuseBiometricKeys();
    await pairPhoneAsTheDemoLaunchDoes();
    enrolFirstBiometric();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByText(
        "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
      ),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.biometrics_changed");
    await enterPinAndApprove(DEMO_PIN);
    await screen.findByText("Transfer sent");
    await sendAnotherRm100TransferFromResult();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toHaveLength(1);
  }),
);

it("offers the PIN again on the next transfer when face or fingerprint approval could not be set up again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  mswServer.use(
    http.post(
      "*/approval-keys",
      () =>
        HttpResponse.json(
          { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
          { status: 503 },
        ),
      { once: true },
    ),
  );
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  await enterPinAndApprove(DEMO_PIN);
  await screen.findByText("Transfer sent");

  await sendAnotherRm100TransferFromResult();

  expect(
    await screen.findByText(
      "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
    ),
  ).toBeOnTheScreen();
});

it("asks for the PIN again, not for a face or fingerprint the bank cannot verify, when the app stopped while setting face or fingerprint approval up again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  mswServer.use(
    http.post("*/approval-keys", () => new Promise<undefined>(() => {}), {
      once: true,
    }),
  );
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  await enterPinAndApprove(DEMO_PIN);
  await screen.findByText("Transfer sent");

  await sendAnotherRm100TransferFromResult();

  expect(
    await screen.findByText(
      "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
    ),
  ).toBeOnTheScreen();
  await enterPinAndApprove(DEMO_PIN);
  await screen.findByText("Transfer sent");
  await sendAnotherRm100TransferFromResult();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("still approves with face or fingerprint set up again on its own once setting every key up again was left unfinished", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  await enterPinAndApprove(DEMO_PIN);
  await screen.findByText("Transfer sent");
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
  );
  await sendAnotherRm100TransferFromResult();
  await screen.findByText(
    "Enter your PIN to set it up and approve this transfer.",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  await screen.findByText("The transfer was not sent — no money moved.");

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("sets approval up again with the PIN when the bank no longer knows the phone's key, then approves", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByText("Approval needs setting up again on this phone."),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Enter your PIN to set it up and approve this transfer.",
      ),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.approval_key_unknown");
    await enterPinAndApprove("111111");
    expect(
      await screen.findByText("That PIN is incorrect. You have 2 tries left."),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.pin_incorrect");
    await enterPinAndApprove(DEMO_PIN);

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  })();
});

it("sets approval up again with the PIN key alone when the bank no longer knows the key of a phone paired with nothing enrolled, then approves", async () => {
  reportBiometricSensorUnavailable("BiometricErrorNoneEnrolled");
  refuseBiometricKeys();
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByText(
        "No face or fingerprint is set up on this phone.",
      ),
    ).toBeOnTheScreen();
    await enterPinAndApprove(DEMO_PIN);

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.approval_key_unknown");
    const keyRegistration = sentRequests
      .filter((request) => new URL(request.url).pathname === "/approval-keys")
      .at(-1);
    const keyRegistrationBody = (await keyRegistration?.json()) as unknown;
    expect(keyRegistrationBody).toHaveProperty("pin", DEMO_PIN);
    expect(keyRegistrationBody).toHaveProperty("possessionPublicKey");
    expect(keyRegistrationBody).not.toHaveProperty("biometricPublicKey");
  })();
});

it("sets approval up again with the PIN already entered, the sheet still only sending, when the bank no longer knows the phone's key on the PIN path", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    let releaseKeyRegistration: () => void = () => undefined;
    const keyRegistrationHeld = new Promise<void>((release) => {
      releaseKeyRegistration = () => {
        release();
      };
    });
    mswServer.use(
      http.post(
        "*/approval-keys",
        async () => {
          await keyRegistrationHeld;
        },
        { once: true },
      ),
    );
    approvalSettingsStore.setState({ biometricApprovalOn: false });
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
    const requestsBeforeApproving = sentRequests.length;

    await enterPinAndApprove(DEMO_PIN);
    await waitFor(() => {
      expect(
        sentRequests
          .slice(requestsBeforeApproving)
          .some((request) =>
            new URL(request.url).pathname.endsWith("/approval-keys"),
          ),
      ).toBe(true);
    });
    expect(
      screen.queryByText("Approval needs setting up again on this phone."),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Approve", busy: true }),
    ).toBeOnTheScreen();
    releaseKeyRegistration();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    const approvalKeyIds = await Promise.all(
      approveRequests().map(
        async (request) => ((await request.json()) as { keyId: string }).keyId,
      ),
    );
    expect(approvalKeyIds).toHaveLength(2);
    expect(new Set(approvalKeyIds).size).toBe(2);
  })();
});

it.each([
  ["face or fingerprint", "Transfer", () => Promise.resolve()],
  ["the PIN", "Use PIN instead", () => enterPinAndApprove(DEMO_PIN)],
])(
  "sets approval up again only once with %s when the bank still does not know the new keys, then says so on review",
  async (_, approveButtonName, finishApproving) => {
    let keyRegistrations = 0;
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
    mswServer.use(
      http.post("*/transfers/:transferId/approve", () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      ),
      // Refusing a second registration ends a loop of them, which would otherwise run Jest out of memory.
      http.post("*/approval-keys", () => {
        keyRegistrations += 1;
        return keyRegistrations === 1
          ? HttpResponse.json({
              possessionKeyId: "possession-key-again",
              biometricKeyId: "biometric-key-again",
            })
          : HttpResponse.json(
              { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
              { status: 503 },
            );
      }),
    );

    await fireEvent.press(
      screen.getByRole("button", { name: approveButtonName }),
    );
    await finishApproving();

    expect(
      await screen.findByText("Approval needs setting up again on this phone."),
    ).toBeOnTheScreen();
    expect(approveRequests()).toHaveLength(2);
    expect(keyRegistrations).toBe(1);
  },
);

it.each([
  ["face or fingerprint", "Transfer", () => Promise.resolve()],
  ["the PIN", "Use PIN instead", () => enterPinAndApprove(DEMO_PIN)],
])(
  "still approves with %s once setting approval up again was left unfinished, the bank still holding the phone's keys",
  async (_, approveButtonName, finishApproving) => {
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () =>
          HttpResponse.json(
            { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
    await screen.findByText(
      "Enter your PIN to set it up and approve this transfer.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await screen.findByText("The transfer was not sent — no money moved.");

    await fireEvent.press(
      screen.getByRole("button", { name: approveButtonName }),
    );
    await finishApproving();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  },
);

const DEMO_PIN = "246810";

async function sendAnotherRm100TransferFromResult() {
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
}
