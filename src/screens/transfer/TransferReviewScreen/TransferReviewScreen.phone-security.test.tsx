import { act, fireEvent, screen } from "@testing-library/react-native";

import {
  biometricPromptsShown,
  failDeviceIntegrityChecks,
  holdDeviceIntegrityChecks,
  reportDeviceIntegrity,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { observedRecords } from "@/test/harness/recording-sink";
import { sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";

async function openReviewOfRm100() {
  await renderRoute("/transfer");
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
}

function transferWritesSent() {
  return sentRequests
    .filter(({ method }) => method === "POST")
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/transfers"));
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
