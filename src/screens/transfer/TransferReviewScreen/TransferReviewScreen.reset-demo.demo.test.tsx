import "@/test/setup/demo-build";

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { accountKeys } from "@/domains/account/api/account.keys";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  secureStoreNativeDouble,
  reportedScenarios,
} from "@/test/doubles/native-doubles";
import { mswServer } from "@/test/mock-bank/mock-bank";
import { askOpenAppToReadAgain, renderRoute } from "@/test/render/render-route";
import { scenarioTest } from "@/test/render/drive-app";

// A resolver that answers nothing hands the request on to the bank, once released.
function holdTheNextPostTo(path: string) {
  let sent = false;
  let release = () => undefined as void;
  const held = new Promise<void>((releaseHeld) => {
    release = releaseHeld;
  });
  mswServer.use(
    http.post(
      path,
      async () => {
        sent = true;
        await held;
      },
      { once: true },
    ),
  );
  return {
    release,
    waitUntilSent: () =>
      waitFor(() => {
        expect(sent).toBe(true);
      }),
  };
}

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
  const approval = holdTheNextPostTo("*/transfers/:transferId/approve");
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
    const create = holdTheNextPostTo("*/transfers");
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
