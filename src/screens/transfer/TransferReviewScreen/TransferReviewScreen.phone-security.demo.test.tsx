import { fireEvent, screen } from "@testing-library/react-native";

import "@/test/demo-build";
import {
  biometricPromptsShown,
  deviceIntegrityChecksAsked,
  failNextBiometricPrompt,
} from "@/test/harness/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { sentRequests } from "@/test/msw-server";
import { pickDemoScenario } from "@/test/pick-demo-scenario";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";
import { walkToTransferReview } from "@/test/walk-to-transfer-review";

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";
const PIN_OFFER =
  "Your face or fingerprint was not recognised. You can try again, or use your PIN.";

async function openReviewOfRm100() {
  await renderRoute("/transfer");
  await walkToTransferReview();
}

it(
  "refuses approval on review in a demo build while the rooted phone is picked, with no face or fingerprint prompt and no transfer sent",
  scenarioTest("transfer.rooted_phone", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100();

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
  await openReviewOfRm100();
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
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(deviceIntegrityChecksAsked()).toBe(0);
});

it("lets approval go ahead in a demo build once another scenario replaces the rooted phone", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
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
  await openReviewOfRm100();
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
