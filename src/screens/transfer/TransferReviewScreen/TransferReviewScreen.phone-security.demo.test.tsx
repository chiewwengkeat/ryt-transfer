import { fireEvent, screen } from "@testing-library/react-native";

import "@/test/demo-build";
import { biometricPromptsShown } from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";
const PIN_OFFER =
  "Face or fingerprint approval isn't available, so approve with your PIN.";

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

async function pickDemoScenario(title: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("radio", { name: title }));
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

it("shows the refusal with no earlier notice beside it that offers the PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  await pickDemoScenario("No biometrics");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(await screen.findByText(PIN_OFFER)).toBeOnTheScreen();

  await pickDemoScenario("Rooted, jailbroken or tampered phone");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByText(PIN_OFFER)).toBeNull();
});
