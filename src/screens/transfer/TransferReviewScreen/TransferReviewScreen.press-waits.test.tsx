import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http } from "msw";

import { rememberApprovalPinLocked } from "@/domains/approval/hooks/approval-pin-lock";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  biometricPromptsShown,
  biometricsLibraryDouble,
  holdDeviceIntegrityChecks,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

async function openReviewOfRm100() {
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  return view;
}

function transferWritesSent() {
  return sentRequests
    .filter(({ method }) => method === "POST")
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/transfers"));
}

async function approveFromReviewOpenedAgain() {
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");
}

it("creates and approves nothing when review is left while Transfer reads the sensor under the bank's PIN lock, and approves from review opened again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await rememberApprovalPinLocked();
  const view = await openReviewOfRm100();
  await screen.findByRole("button", { name: "Transfer" });
  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
  });
  const readSensorForReal = biometricsLibraryDouble.isSensorAvailable;
  let releaseSensorRead = () => {};
  const sensorReads = jest
    .spyOn(biometricsLibraryDouble, "isSensorAvailable")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSensorRead = () => {
            resolve(readSensorForReal());
          };
        }),
    );

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  // Back must land in the sensor read, past the phone check's own leave check.
  await waitFor(() => {
    expect(sensorReads).toHaveBeenCalledTimes(1);
  });
  await pressHardwareBack();
  await act(async () => {
    releaseSensorRead();
    await jest.advanceTimersByTimeAsync(10_000);
  });

  expect(view.getPathname()).toBe("/transfer/amount");
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual([]);
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});

it("shows Use PIN instead's PIN-locked sheet and creates nothing when the bank's PIN lock is remembered while the phone check runs", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  // As a late refusal of an earlier transfer's PIN does: that lock holds for every transfer.
  await act(async () => {
    await rememberApprovalPinLocked();
    answerHeldChecks({});
  });

  expect(
    await screen.findByText(
      "Your PIN is locked. Reset it in the app's security settings.",
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("Enter your bank PIN to approve this transfer."),
  ).toBeNull();
  expect(transferWritesSent()).toEqual([]);
});

function holdFirstPinLockRead() {
  const readSecureRecordForReal = secureStoreNativeDouble.getValueWithKeyAsync;
  let releaseHeldRead = () => {};
  let pinLockReadHeld = false;
  const secureReads = jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockImplementation((key) => {
      if (pinLockReadHeld || !key.includes("pin-locked"))
        return readSecureRecordForReal(key);
      pinLockReadHeld = true;
      return new Promise((resolve) => {
        releaseHeldRead = () => {
          resolve(readSecureRecordForReal(key));
        };
      });
    });
  return () => {
    releaseHeldRead();
    secureReads.mockRestore();
  };
}

it("offers Use PIN instead only once review's first read of the bank's PIN lock has answered", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const releasePinLockRead = holdFirstPinLockRead();
  await openReviewOfRm100();
  await screen.findByRole("button", { name: "Transfer" });
  const offeredWhileTheLockIsUnknown =
    screen.queryByRole("button", { name: "Use PIN instead" }) !== null;

  await act(() => {
    releasePinLockRead();
  });

  expect(offeredWhileTheLockIsUnknown).toBe(false);
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
});

it("creates nothing and shows the PIN-locked sheet when Transfer asks for the PIN before review's first read of a remembered PIN lock answers", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await rememberApprovalPinLocked();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  const releasePinLockRead = holdFirstPinLockRead();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2_000);
  });

  expect(
    await screen.findByText(
      "Your PIN is locked. Reset it in the app's security settings.",
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("Enter your bank PIN to approve this transfer."),
  ).toBeNull();
  expect(transferWritesSent()).toEqual([]);
  await act(() => {
    releasePinLockRead();
  });
});

it("frees Transfer and Use PIN instead when the phone check throws, and approves from the same review", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  jest
    .spyOn(biometricsLibraryDouble, "getDeviceIntegrityStatus")
    .mockImplementationOnce(() => {
      throw new Error("The integrity library threw before answering.");
    });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).not.toBeBusy();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});

it("asks for no approval of a transfer whose review is popped while it is being created, and approves from review opened again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let releaseCreate = () => {};
  const createHeld = new Promise<void>((release) => {
    releaseCreate = release;
  });
  mswServer.use(
    http.post("*/transfers", async () => {
      await createHeld;
    }),
  );
  const view = await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(transferWritesSent()).toEqual(["/transfers"]);
  });
  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.back();
  });
  await act(async () => {
    releaseCreate();
    await jest.advanceTimersByTimeAsync(10_000);
  });

  expect(view.getPathname()).toBe("/transfer/amount");
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual(["/transfers"]);
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});
