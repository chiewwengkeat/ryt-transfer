import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  TRANSFER_SCENARIOS,
  type TransferScenario,
  type TransferScenarioId,
} from "@/mocks/scenarios/transfer-scenarios";
import {
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
} from "@/test/bank-client";

import OverlayDemo from "./OverlayDemo";

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>("node:fs");

const MATRIX_SECTIONS = [
  ...readFileSync(
    `${__dirname}/../../../../screens/transfer/scenarios/transfer.md`,
    "utf8",
  ).matchAll(/^### (.+)\n`(transfer\.([a-z0-9_]+))`$/gm),
].map(([, heading = "", scenarioId = "", name = ""]) => ({
  heading,
  scenarioId,
  name,
}));
const BANK_DECIDED_HEADINGS = MATRIX_SECTIONS.filter(({ scenarioId }) => {
  const scenario: TransferScenario | undefined =
    TRANSFER_SCENARIOS[scenarioId as TransferScenarioId];
  return scenario?.handlers !== undefined || scenario.conditions !== undefined;
}).map(({ heading }) => heading);
const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

beforeAll(() => {
  // Titles resolve before the app's own transfer bundle exists, and never override it once it does.
  i18next.addResourceBundle(
    "en-MY",
    "transfer",
    {
      common: Object.fromEntries(
        MATRIX_SECTIONS.map(({ name, heading }) => [name, { title: heading }]),
      ),
    },
    true,
    false,
  );
});

async function renderDemoOverlay() {
  await render(
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <OverlayDemo
        onResetDemo={() => Promise.resolve()}
        onSheetOpenChange={jest.fn()}
      />
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

it("offers no scenario, no biometrics and then what the bank or the connection decides, by step in matrix order", async () => {
  await renderDemoOverlay();

  await openDemoMenu();

  const expectedEntries = [
    screen.getByRole("button", { name: "Close the demo menu" }),
    screen.getByRole("radio", { name: "Normal, no scenario" }),
    screen.getByRole("radio", { name: "No biometrics" }),
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
  await renderDemoOverlay();
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
