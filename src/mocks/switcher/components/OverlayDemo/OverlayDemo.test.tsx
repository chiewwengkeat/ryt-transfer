import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  TRANSFER_SCENARIOS,
  type TransferScenario,
  type TransferScenarioId,
} from "@/mocks/scenarios/transfer-scenarios";
import { spacing } from "@/shared/theme/theme";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
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

function OverlayDemoOverAnAppSheet({
  appSheetOpen,
}: {
  appSheetOpen: boolean;
}) {
  return (
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ViewBottomSheetHost>
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
      <OverlayDemo
        onResetDemo={() => Promise.resolve()}
        onSheetOpenChange={jest.fn()}
      />
    </SafeAreaProvider>
  );
}

async function layOutTheAppSheet(panel: { top: number; height: number }) {
  // From the ✕: inside the sheet's body, the scroll view's own layout handler takes the event first.
  await fireEvent(
    screen.getByRole("button", { name: "Close the PIN sheet" }),
    "layout",
    {
      nativeEvent: {
        layout: { x: 0, y: panel.top, width: 390, height: panel.height },
      },
    },
  );
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

it("lifts the pill above an open sheet by the sheet's measured height, and lowers it once the sheet closes", async () => {
  const view = await render(<OverlayDemoOverAnAppSheet appSheetOpen />);

  await layOutTheAppSheet({ top: 500, height: 344 });

  expect(screen.getByRole("button", { name: "Demo menu" })).toHaveStyle({
    bottom: 344 + spacing.sm,
  });
  await view.rerender(<OverlayDemoOverAnAppSheet appSheetOpen={false} />);
  expect(screen.getByRole("button", { name: "Demo menu" })).toHaveStyle({
    bottom: PHONE_METRICS.insets.bottom + spacing.sm,
  });
});

it("keeps the pill above a sheet the keyboard has raised, clear of the whole sheet", async () => {
  await render(<OverlayDemoOverAnAppSheet appSheetOpen />);

  await layOutTheAppSheet({ top: 200, height: 344 });

  expect(screen.getByRole("button", { name: "Demo menu" })).toHaveStyle({
    bottom: PHONE_METRICS.frame.height - 200 + spacing.sm,
  });
});

it("keeps the pill reachable over an open sheet, opening the Demo menu with the sheet still open", async () => {
  await render(<OverlayDemoOverAnAppSheet appSheetOpen />);
  await layOutTheAppSheet({ top: 500, height: 344 });

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));

  expect(
    screen.getByRole("button", { name: "Close the demo menu" }),
  ).toBeOnTheScreen();
  expect(screen.getByText("Keypad")).toBeOnTheScreen();
});
