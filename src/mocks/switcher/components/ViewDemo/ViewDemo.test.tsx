import { fireEvent, render, screen } from "@testing-library/react-native";
import { changeLanguage } from "i18next";
import { Text } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  TRANSFER_SCENARIOS,
  type TransferScenario,
} from "@/mocks/scenarios/transfer-scenarios/transfer-scenarios";
import { AppLanguage } from "@/shared/i18n/i18n";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import {
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";

import ViewDemo from "./ViewDemo";

it("offers no scenario, the phone-side picks, then what the bank or the connection decides by step, all in matrix order", async () => {
  await renderDemoAroundAnApp();

  await openDemoMenu();

  const expectedEntries = [
    screen.getByRole("button", { name: "Close the demo menu" }),
    screen.getByRole("radio", { name: "Normal, no scenario" }),
    screen.getByRole("radio", { name: "Screenshots blocked" }),
    screen.getByRole("radio", { name: "Face or fingerprint unavailable" }),
    screen.getByRole("radio", { name: "Rooted, jailbroken or tampered phone" }),
    ...BANK_DECIDED_HEADINGS.map((heading) =>
      screen.getByRole("radio", { name: heading }),
    ),
    screen.getByRole("button", { name: "Reset demo" }),
  ];
  expect(BANK_DECIDED_HEADINGS).toHaveLength(33);
  expect(menuEntryPositions(expectedEntries)).toEqual(
    expectedEntries.map((_, position) => position),
  );
  expect(
    screen.getByRole("radio", { name: "Normal, no scenario" }),
  ).toBeChecked();
});

it("puts Unlock PIN first, tagged demo only, but only while the demo PIN is locked", async () => {
  await renderDemoAroundAnApp();
  await openDemoMenu();
  const offeredWhileUnlocked = screen.queryByRole("button", {
    name: "Unlock PIN",
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Close the demo menu" }),
  );

  await lockDemoPinWithThreeWrongTries();
  await openDemoMenu();

  expect(offeredWhileUnlocked).not.toBeOnTheScreen();
  expect(
    menuEntryPositions([
      screen.getByRole("button", { name: "Close the demo menu" }),
      screen.getByRole("button", { name: "Unlock PIN" }),
    ]).slice(0, 2),
  ).toEqual([0, 1]);
  expect(screen.getByText("Demo only")).toBeOnTheScreen();
});

it("takes its own place above the app, never drawing over it, so the app pads for no status bar beneath it", async () => {
  await renderDemoAroundAnApp();
  await openDemoMenu();

  await fireEvent.press(
    screen.getByRole("radio", { name: "Transfers under maintenance" }),
  );

  // Jest lays nothing out: the inset handed down and the absence of floating are what it can see.
  expect(screen.getByText("The screen's top inset is 0")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Demo menu" })).not.toHaveStyle({
    position: "absolute",
  });
  expect(
    screen.getByText("Demo · Transfers under maintenance").parent,
  ).not.toHaveStyle({ position: "absolute" });
});

it("opens the Demo menu by touch over an open app sheet, leaving the sheet open beneath it but out of a screen reader's reach", async () => {
  await renderDemoAroundAnApp({ appSheetOpen: true });

  await fireEvent.press(
    screen.getByRole("button", {
      name: "Demo menu",
      includeHiddenElements: true,
    }),
  );

  expect(
    screen.getByRole("button", { name: "Close the demo menu" }),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Keypad")).toBeNull();
  expect(
    screen.getByText("Keypad", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("tells a screen reader that the demo's menu button, menu and scenario line are in Bahasa Malaysia once it is picked", async () => {
  await changeLanguage(AppLanguage.Malay);
  await renderDemoAroundAnApp();

  const menuButton = screen.getByRole("button", { name: "Menu demo" });
  expect(menuButton).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(menuButton);
  const screenshotsBlocked = screen.getByRole("radio", {
    name: "Tangkapan skrin disekat",
  });
  expect(screenshotsBlocked).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(screenshotsBlocked);

  expect(screen.getByText("Demo · Tangkapan skrin disekat")).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
  expect(screen.getByRole("button", { name: "Kembali normal" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>("node:fs");

const MATRIX_SECTIONS = [
  ...readFileSync(
    `${__dirname}/../../../../screens/transfer/scenarios/transfer.md`,
    "utf8",
  ).matchAll(/^### (.+)\n`(transfer\.[a-z0-9_]+)`$/gm),
].map(([, heading = "", scenarioId = ""]) => ({ heading, scenarioId }));
const BANK_DECIDED_HEADINGS = MATRIX_SECTIONS.filter(({ scenarioId }) => {
  const scenario: TransferScenario | undefined =
    TRANSFER_SCENARIOS[scenarioId as TransferScenarioId];
  return scenario?.handlers !== undefined || scenario.conditions !== undefined;
}).map(({ heading }) => heading);
const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function ScreenShowingItsTopInset() {
  const { top } = useSafeAreaInsets();
  return <Text>{`The screen's top inset is ${top}`}</Text>;
}

async function renderDemoAroundAnApp({ appSheetOpen = false } = {}) {
  await render(
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ViewDemo
        appSheetOpen={appSheetOpen}
        onResetDemo={() => Promise.resolve()}
      >
        <ViewBottomSheetHost>
          <ScreenShowingItsTopInset />
          {appSheetOpen && (
            <BottomSheetFrame
              title="Approve with your PIN"
              closeLabel="Close the PIN sheet"
              onClose={() => undefined}
            >
              <Text>Keypad</Text>
            </BottomSheetFrame>
          )}
        </ViewBottomSheetHost>
      </ViewDemo>
    </SafeAreaProvider>,
  );
}

async function openDemoMenu() {
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
}

async function lockDemoPinWithThreeWrongTries() {
  const { possessionKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const approval = signTestApproval(started, {
    kind: "possession",
    keyId: possessionKeyId,
  });
  for (const wrongPin of ["111111", "222222", "333333"])
    await sendToBank("POST", started.approvalPath, {
      body: { ...approval, pin: wrongPin },
    });
}

function menuEntryPositions(expectedEntries: unknown[]) {
  const shownEntries = screen.getAllByRole(/^(button|radio)$/);
  return shownEntries.map((entry) => expectedEntries.indexOf(entry));
}
