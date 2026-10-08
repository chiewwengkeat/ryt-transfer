import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import {
  biometricPromptsShown,
  failDeviceIntegrityChecks,
  holdDeviceIntegrityChecks,
  reportDeviceIntegrity,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { observedRecords } from "@/test/harness/recording-sink";
import { sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";

async function openReviewOfRm100() {
  const view = await renderRoute("/transfer");
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

it("refuses approval in place of the prompt on a phone that reports root, leaves no way to approve, and sends nothing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  reportDeviceIntegrity({
    isRooted: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual([]);
});

it("waits, showing Transfer busy, for a phone check still running when it is pressed, then refuses", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  const transferWhileChecking = screen.getByRole("button", {
    name: "Transfer",
  });
  const promptsWhileChecking = biometricPromptsShown();
  await act(() => {
    answerHeldChecks({
      hasRuntimeHooks: true,
      isCompromised: true,
      riskLevel: "HIGH",
    });
  });

  expect(transferWhileChecking).toBeBusy();
  expect(promptsWhileChecking).toEqual([]);
  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual([]);
});

it("lets approval go ahead when the phone check gives no clear answer, and records that it did", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  failDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(observedRecords).toContainEqual({
    type: "event",
    name: "device_integrity_unknown",
    properties: {},
  });
});

it("lets approval go ahead when the phone check has not answered within 5 seconds, and records that once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4_999);
  });
  const transferJustBeforeFiveSeconds = screen.getByRole("button", {
    name: "Transfer",
  });
  const promptsJustBeforeFiveSeconds = biometricPromptsShown();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });

  expect(transferJustBeforeFiveSeconds).toBeBusy();
  expect(promptsJustBeforeFiveSeconds).toEqual([]);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(
    observedRecords.filter(({ name }) => name === "device_integrity_unknown"),
  ).toEqual([
    { type: "event", name: "device_integrity_unknown", properties: {} },
  ]);
});

it.each([
  ["Android's Back", pressHardwareBack],
  // Jest cannot press the native header; Android's header Back pops review as this does.
  [
    "Android's header Back",
    async () => {
      await act(() => {
        router.back();
      });
    },
  ],
])(
  "creates and approves nothing when review is left with %s while the phone check runs, and approves from review opened again",
  async (_, leaveReview) => {
    await pairPhoneAsTheDemoLaunchDoes();
    const answerHeldChecks = holdDeviceIntegrityChecks();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    const transferWhileChecking = screen.getByRole("button", {
      name: "Transfer",
    });

    await leaveReview();
    await act(async () => {
      answerHeldChecks({});
      await jest.advanceTimersByTimeAsync(10_000);
    });

    expect(transferWhileChecking).toBeBusy();
    expect(view.getPathname()).toBe("/transfer/amount");
    expect(biometricPromptsShown()).toEqual([]);
    expect(transferWritesSent()).toEqual([]);
    await approveFromReviewOpenedAgain();
    expect(biometricPromptsShown()).toHaveLength(1);
    expect(transferWritesSent()).toEqual([
      "/transfers",
      expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
    ]);
  },
);

it("creates and approves nothing when an iPhone's Back or swipe starts closing review while the phone check runs", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  // iOS tells review it will disappear as its own Back or swipe begins, and pops it here only once that ends.
  await fireEvent(screen.getByText("RM 100.00"), "willDisappear");
  await act(async () => {
    answerHeldChecks({});
    await jest.advanceTimersByTimeAsync(10_000);
  });
  const promptsBeforeThePopLands = biometricPromptsShown();
  const writesBeforeThePopLands = transferWritesSent();
  await act(() => {
    router.back();
  });

  expect(promptsBeforeThePopLands).toEqual([]);
  expect(writesBeforeThePopLands).toEqual([]);
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});
