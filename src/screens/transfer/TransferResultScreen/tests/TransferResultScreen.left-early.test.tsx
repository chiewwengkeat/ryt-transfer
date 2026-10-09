import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, Platform } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  finishOpeningScreen,
  moveAppTo,
  pressHardwareBack,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { setPhoneNetwork } from "@/test/doubles/native-doubles";
import {
  relaunchApp,
  relaunchAppAndWaitForItsLaunchChecks,
  renderRoute,
} from "@/test/render/render-route";

it(
  "reopens the transfer the app was closed during, quoting its id, with Home's warning beneath asking the bank nothing, then says no money moved once its window passes and leaves nothing for the next launch",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    // Never answered: the app is killed while the approval is on its way.
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () => new Promise<never>(() => undefined),
        { once: true },
      ),
    );
    const view = await sendRm100FromHome();
    await waitFor(() => {
      expect(sentRequests.some(({ url }) => url.endsWith("/approve"))).toBe(
        true,
      );
    });

    const relaunched = await relaunchApp(view);

    const heading = await screen.findByRole("header", {
      name: "Checking your last transfer",
    });
    expect(heading).toBeOnTheScreen();
    await finishOpeningScreen(heading);
    expect(
      screen.getByText(
        "The app closed before your last transfer's answer arrived. It's being checked, and its outcome will show here — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(relaunched.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
    expect(
      screen.getByText(/^Your last transfer is still being checked/, {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    const transferId = transferIdIn(relaunched.getPathname());
    const readsOfTheTransfer = () =>
      sentRequests.filter(
        ({ method, url }) =>
          method === "GET" && url.endsWith(`/transfers/${transferId}`),
      ).length;
    await act(() => jest.advanceTimersByTimeAsync(9_000));
    const readsAfterThePagesReadAt8Seconds = readsOfTheTransfer();

    await act(() => jest.advanceTimersByTimeAsync(6_500));

    expect(readsOfTheTransfer()).toBe(readsAfterThePagesReadAt8Seconds);
    await act(() => jest.advanceTimersByTimeAsync(46_500));
    expect(
      await screen.findByRole("header", { name: "Transfer not sent" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The approval timed out — no money moved."),
    ).toBeOnTheScreen();
    const relaunchedAgain =
      await relaunchAppAndWaitForItsLaunchChecks(relaunched);
    expect(screen.queryByText(/^Your (last )?transfer/)).toBeNull();
    expect(relaunchedAgain.getPathname()).toBe("/");
  }),
);

it(
  "shows at launch how the transfer the app was closed during ended, then stops tracking it",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    const customerId = await readCustomerId();
    const keys = await pairTestPhone();
    const started = await startTestTransfer(10_000);
    // The approval reached the bank before the app was killed; only its answer was lost.
    await sendToBank("POST", started.approvalPath, {
      body: signTestApproval(started, {
        kind: "biometric",
        keyId: keys.biometricKeyId,
      }),
    });
    await writePendingTransfer(customerId, {
      transferId: started.created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Approving,
    });

    const view = await renderRoute("/");

    const heading = await screen.findByRole("header", {
      name: "Transfer sent",
    });
    expect(heading).toBeOnTheScreen();
    await finishOpeningScreen(heading);
    const relaunched = await relaunchAppAndWaitForItsLaunchChecks(view);
    expect(screen.queryByText(/^Your (last )?transfer/)).toBeNull();
    expect(relaunched.getPathname()).toBe("/");
  }),
);

it(
  "waits for the account before reopening the transfer left mid-approval, after a launch with no connection",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    const customerId = await readCustomerId();
    const { created } = await startTestTransfer(10_000);
    await writePendingTransfer(customerId, {
      transferId: created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Approving,
    });
    let phoneConnected = false;
    mswServer.use(
      http.all("*", () => (phoneConnected ? undefined : HttpResponse.error())),
    );
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
    const view = await renderRoute("/");
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    const pathnameWhileOffline = view.getPathname();

    phoneConnected = true;
    await act(() => {
      setPhoneNetwork({ isConnected: true, isInternetReachable: true });
    });

    expect(
      await screen.findByRole("header", {
        name: "Checking your last transfer",
      }),
    ).toBeOnTheScreen();
    expect(pathnameWhileOffline).toBe("/");
  }),
);

it("tells Home the transfer was sent when Back leaves the result page as it opens, at the next launch too", async () => {
  const view = await approveRm100Transfer();
  await screen.findByRole("header", { name: "Transfer sent" });

  await pressHardwareBack();

  expect(await screen.findByText(SENT_NOTICE)).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
  const relaunched = await relaunchApp(view);
  expect(await screen.findByText(SENT_NOTICE)).toBeOnTheScreen();
  expect(relaunched.getPathname()).toBe("/");
});

it("says nothing more on Home once the result page has finished opening and Back leaves it", async () => {
  const view = await approveRm100Transfer();
  await finishOpeningScreen(
    await screen.findByRole("header", { name: "Transfer sent" }),
  );

  await pressHardwareBack();

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
});

it("says nothing more on Home, shown or spoken, when Done leaves the result page before it has finished opening", async () => {
  const view = await approveRm100Transfer();
  await screen.findByRole("header", { name: "Transfer sent" });
  const announcements = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockClear();

  await fireEvent.press(screen.getByRole("button", { name: "Done" }));

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
  expect(announcements.mock.calls.flat()).not.toContainEqual(
    expect.stringMatching(SENT_NOTICE),
  );
});

it(
  "keeps checking a processing transfer until it shows sent, after Android reopens the app from Back",
  scenarioTest("transfer.processing", async () => {
    const platformOs = jest.replaceProperty(Platform, "OS", "android");
    try {
      await pairPhoneAsTheDemoLaunchDoes();
      const view = await renderRoute("/");
      await screen.findByText("RM 12,845.50");
      await act(() => {
        moveAppTo("background");
      });
      await view.unmount();
      await renderRoute("/");
      await act(() => {
        moveAppTo("active");
      });
      await fireEvent.press(
        await screen.findByRole("button", {
          name: "Transfer",
          disabled: false,
        }),
      );
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
      await screen.findByRole("header", { name: "Transfer processing" });

      await act(() => jest.advanceTimersByTimeAsync(32_000));

      expect(
        await screen.findByRole("header", { name: "Transfer sent" }),
      ).toBeOnTheScreen();
    } finally {
      platformOs.restore();
    }
  }),
);

async function sendRm100FromHome() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

function transferIdIn(pathname: string | undefined) {
  return pathname?.replace("/transfer/result/", "") ?? "";
}

// The page's only offers: anything more could be a way to send the money twice.
function buttonsOnTheResultPage() {
  return screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as unknown);
}

async function readCustomerId() {
  const { body } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  return body.customerId;
}

const SENT_NOTICE =
  /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/;

async function approveRm100Transfer() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

async function waitOnHomeForItsBalance() {
  await screen.findByText("RM 12,745.50");
  await act(() => jest.advanceTimersByTimeAsync(1_000));
}
