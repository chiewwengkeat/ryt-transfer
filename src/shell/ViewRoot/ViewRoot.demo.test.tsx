import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import type { DemoLayer } from "@/domains/approval/hooks/demo-layer.type";
import { requestJson } from "@/shared/http/transport";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import { lookUpTestRecipient } from "@/test/bank-client";
import { biometricPromptsShown } from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

// The demo build's root: Jest runs as production, whose launch loads no demo layer.
jest.mock("@/shell/app-launch", () => ({
  __esModule: true,
  demoLayer: jest.requireActual<{ default: DemoLayer }>("@/mocks/demo-layer")
    .default,
}));

function ScreenWithASheet() {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setSheetOpen(true);
        }}
      >
        <Text>Choose a bank</Text>
      </Pressable>
      {sheetOpen && (
        <BottomSheetFrame
          title="Banks"
          closeLabel="Close the banks"
          onClose={() => {
            setSheetOpen(false);
          }}
        >
          <Text>Maybank</Text>
        </BottomSheetFrame>
      )}
    </>
  );
}

async function renderDemoRoot() {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ScreenWithASheet },
  });
}

async function pickDemoScenario(title: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("radio", { name: title }));
}

const sentNameChecks = () =>
  sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup"));

async function readTheAccountAsAScreenWould() {
  // The bank answers after a delay, which the route's fake timers would hold forever.
  jest.useRealTimers();
  await act(async () => {
    await requestJson("/accounts/primary").catch(() => undefined);
  });
}

it("shows a scenario picked from the Demo menu in a banner, whose ✕ returns to normal", async () => {
  await renderDemoRoot();

  await pickDemoScenario("Transfers under maintenance");
  expect(
    screen.getByText("Demo · Transfers under maintenance"),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Back to normal" }));

  expect(
    screen.queryByText("Demo · Transfers under maintenance"),
  ).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  expect(
    screen.getByRole("radio", { name: "Normal, no scenario" }),
  ).toBeChecked();
});

it("keeps the Demo banner above an ended session, so a reviewer can return to normal and sign in again", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Session ended");

  await readTheAccountAsAScreenWould();
  const appWhileEnded = screen.queryByRole("button", { name: "Choose a bank" });
  await fireEvent.press(screen.getByRole("button", { name: "Back to normal" }));
  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  await readTheAccountAsAScreenWould();

  expect(appWhileEnded).not.toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Sign in again" }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Choose a bank" }),
  ).toBeOnTheScreen();
});

it("shows the Demo banner over a session that ended with a screen's sheet open, so a reviewer can still return to normal", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Session ended");
  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));

  await readTheAccountAsAScreenWould();

  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Back to normal" }),
  ).toBeOnTheScreen();
});

it("asks a refused name check again once a Demo scenario is picked, so review shows that scenario's answer", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "TOO_MANY_LOOKUPS", message: "Test." } },
          { status: 429 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByText(
    "Too many name checks in a short time. Try again in a minute.",
  );
  const nameChecksBeforePick = sentNameChecks().length;

  await pickDemoScenario("Balance or limit short at confirmation");

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforePick + 1);
});

it("hides the app and the session-ended view from screen readers while the Demo menu is open", async () => {
  await renderDemoRoot();
  const appBeforeMenu = screen.queryByRole("button", { name: "Choose a bank" });

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  const appWhileMenuOpen = screen.queryByRole("button", {
    name: "Choose a bank",
  });
  await fireEvent.press(screen.getByRole("radio", { name: "Session ended" }));
  await readTheAccountAsAScreenWould();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  const signInWhileMenuOpen = screen.queryByRole("button", {
    name: "Sign in again",
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Close the demo menu" }),
  );

  expect(appBeforeMenu).toBeOnTheScreen();
  expect(appWhileMenuOpen).not.toBeOnTheScreen();
  expect(signInWhileMenuOpen).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Sign in again" }),
  ).toBeOnTheScreen();
});

it("draws a screen's sheet over the app and hides the screen behind it from screen readers", async () => {
  await renderDemoRoot();

  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));

  expect(screen.getByText("Maybank")).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Choose a bank" }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Close the banks" }),
  ).toBeOnTheScreen();
});

it("hides the Demo header from screen readers while a screen's sheet is open, so the sheet is what they meet first", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Transfers under maintenance");

  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));
  const scenarioWhileSheetOpen = screen.queryByText(
    "Demo · Transfers under maintenance",
  );
  const backToNormalWhileSheetOpen = screen.queryByRole("button", {
    name: "Back to normal",
  });
  const menuWhileSheetOpen = screen.queryByRole("button", {
    name: "Demo menu",
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Close the banks" }),
  );

  expect(scenarioWhileSheetOpen).not.toBeOnTheScreen();
  expect(backToNormalWhileSheetOpen).not.toBeOnTheScreen();
  expect(menuWhileSheetOpen).not.toBeOnTheScreen();
  expect(
    screen.getByText("Demo · Transfers under maintenance"),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Demo menu" })).toBeOnTheScreen();
});

it("stops a transfer's approval before any face or fingerprint prompt while No biometrics is picked", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await pickDemoScenario("No biometrics");

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

  expect(
    await screen.findByText(
      "Face or fingerprint approval isn't available, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});
