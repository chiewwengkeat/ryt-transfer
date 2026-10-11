import "@/test/setup/demo-build";

import { accountKeys } from "@/domains/account/api/account.keys";
import {
  biometricPromptsShown,
  deviceIntegrityChecksAsked,
  failNextBiometricPrompt,
} from "@/test/doubles/biometrics-double";
import {
  reportedScenarios,
  secureStoreNativeDouble,
} from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import {
  enterPinAndApprove,
  pickDemoScenario,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { askOpenAppToReadAgain, renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { holdTheNextPost } from "./TransferReviewScreen.helper";

it("opens no result page for a transfer Reset demo ended while its answer was being kept", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  const approval = holdTheNextPost("*/transfers/:transferId/approve");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await approval.waitUntilSent();
  const listing = holdTheNextReadOfTheSecureRecordIndex();
  approval.release();
  await listing.waitUntilReached();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));
  await act(() => jest.advanceTimersByTimeAsync(5_000));
  expect(
    await screen.findByLabelText("DuitNow mobile number"),
  ).toBeOnTheScreen();

  listing.release();

  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(view.getPathname()).toBe("/transfer");
});

it(
  "reports no hold the bank answered under the session-ended view once Reset demo has started over, even after signing in again",
  scenarioTest("transfer.account_locked", async () => {
    await renderRoute("/transfer");
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    const create = holdTheNextPost("*/transfers");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await create.waitUntilSent();
    mswServer.use(
      http.get(
        "*/accounts/primary",
        () => new HttpResponse(null, { status: 401 }),
        { once: true },
      ),
    );
    askOpenAppToReadAgain(accountKeys.primaryAccount);
    const signInButton = await screen.findByRole("button", {
      name: "Sign in again",
    });
    const reportsBeforeTheHold = reportedScenarios().length;
    create.release();
    await screen.findByText(
      "Your account is locked. Contact Ryt to unlock it.",
      { includeHiddenElements: true },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
    await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));
    await act(() => jest.advanceTimersByTimeAsync(5_000));

    await fireEvent.press(signInButton);
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(reportedScenarios().slice(reportsBeforeTheHold)).not.toContain(
      "transfer.account_locked",
    );
  }),
);

it(
  "refuses approval on review in a demo build while the rooted phone is picked, with no face or fingerprint prompt and no transfer sent",
  scenarioTest("transfer.rooted_phone", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    const requestsSent = sentRequests.map(
      ({ method, url }) => `${method} ${new URL(url).pathname}`,
    );
    expect(requestsSent).toContain("GET /accounts/primary");
    expect(
      requestsSent.filter((request) => request.startsWith("POST /transfers")),
    ).toEqual([]);
  }),
);

it("refuses Use PIN instead before any PIN sheet in a demo build while the rooted phone is picked, asking the phone's own check nothing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
  await pickDemoScenario("Rooted, jailbroken or tampered phone");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(
    screen.queryByText("Enter your bank PIN to approve this transfer."),
  ).toBeNull();
  expect(
    sentRequests.filter(
      ({ method, url }) =>
        method === "POST" && new URL(url).pathname.startsWith("/transfers"),
    ),
  ).toEqual([]);
  expect(deviceIntegrityChecksAsked()).toBe(0);
});

it("lets approval go ahead in a demo build with no scenario picked, without asking the phone's own check", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(deviceIntegrityChecksAsked()).toBe(0);
});

it("lets approval go ahead in a demo build once another scenario replaces the rooted phone", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
  await pickDemoScenario("Rooted, jailbroken or tampered phone");
  await pickDemoScenario("Normal, no scenario");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("shows the refusal with no earlier notice or button beside it that offers the PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  failNextBiometricPrompt("AUTHENTICATION_FAILED");
  await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(await screen.findByText(PIN_OFFER)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  await pickDemoScenario("Rooted, jailbroken or tampered phone");
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByText(PIN_OFFER)).toBeNull();
  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
});

it("shows the demo PIN in a demo build, and the PIN it shows approves the transfer", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );

  expect(await screen.findByText("Demo PIN: 246810")).toBeOnTheScreen();
  await enterPinAndApprove("246810");
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";
const PIN_OFFER =
  "Your face or fingerprint was not recognised. You can try again, or use your PIN.";

// A slow keychain. A read, not a write: Reset demo's own deletes queue behind any write, so a held one holds it too.
function holdTheNextReadOfTheSecureRecordIndex() {
  const getValueWithKey = secureStoreNativeDouble.getValueWithKeyAsync;
  let reached = false;
  let release = () => undefined as void;
  const held = new Promise<void>((releaseHeld) => {
    release = releaseHeld;
  });
  const reads = jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockImplementation(async (key) => {
      if (key.endsWith(".index")) {
        reads.mockRestore();
        reached = true;
        await held;
      }
      return getValueWithKey(key);
    });
  return {
    release,
    waitUntilReached: () =>
      waitFor(() => {
        expect(reached).toBe(true);
      }),
  };
}
