import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http } from "msw";

import { rememberApprovalPinLocked } from "@/domains/approval/hooks/approval-pin-lock";
import {
  biometricPromptsShown,
  biometricsLibraryDouble,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
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
