import "@/test/demo-build";

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http } from "msw";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

// A resolver that answers nothing hands the request on to the bank, once released.
function holdTheNextApproval() {
  let sent = false;
  let release = () => undefined as void;
  const held = new Promise<void>((releaseHeld) => {
    release = releaseHeld;
  });
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
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
  const approval = holdTheNextApproval();
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
