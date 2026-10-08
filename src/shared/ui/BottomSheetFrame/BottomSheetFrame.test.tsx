import {
  act,
  fireEvent,
  isHiddenFromAccessibility,
  render,
  screen,
} from "@testing-library/react-native";
import { useState } from "react";
import { BackHandler, DeviceEventEmitter, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";

import BottomSheetFrame from "./BottomSheetFrame";

// Jest runs as iOS, whose BackHandler ignores every listener: Android's lets a test press Back.
jest.mock("react-native/Libraries/Utilities/BackHandler", () =>
  jest.requireActual<object>(
    "react-native/Libraries/Utilities/BackHandler.android",
  ),
);

const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function ScreenWithBankSheet({
  dismissable = true,
  onSheetOpenChange,
}: {
  dismissable?: boolean;
  onSheetOpenChange?: (sheetOpen: boolean) => void;
}) {
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [branchSheetOpen, setBranchSheetOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  return (
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ViewBottomSheetHost onSheetOpenChange={onSheetOpenChange}>
        <ButtonPrimary
          label="Choose a bank"
          onPress={() => {
            setBankSheetOpen(true);
          }}
        />
        {bankSheetOpen && (
          <BottomSheetFrame
            title="Banks"
            closeLabel="Close"
            dismissable={dismissable}
            onClose={() => {
              setBankSheetOpen(false);
            }}
            searchField={{
              label: "Search banks",
              value: bankSearch,
              onChangeText: setBankSearch,
            }}
          >
            <Text>
              {bankSearch === ""
                ? "Every bank"
                : `Banks matching ${bankSearch}`}
            </Text>
            <ButtonPrimary
              label="Choose a branch"
              onPress={() => {
                setBranchSheetOpen(true);
              }}
            />
          </BottomSheetFrame>
        )}
        {branchSheetOpen && (
          <BottomSheetFrame
            title="Branches"
            closeLabel="Close"
            onClose={() => {
              setBranchSheetOpen(false);
            }}
          >
            <Text>Kuala Lumpur</Text>
          </BottomSheetFrame>
        )}
      </ViewBottomSheetHost>
    </SafeAreaProvider>
  );
}

async function openBankSheet() {
  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));
}

async function pressHardwareBack() {
  await act(() => {
    DeviceEventEmitter.emit("hardwareBackPress");
  });
}

it("opens over the screen and hides the screen from a screen reader", async () => {
  await render(<ScreenWithBankSheet />);

  await openBankSheet();

  expect(screen.getByRole("header", { name: "Banks" })).toBeOnTheScreen();
  expect(screen.getByText("Every bank")).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Choose a bank" }),
  ).not.toBeOnTheScreen();
});

it("leaves a screen reader no unlabelled stop in an open sheet, its title the first stop in swipe order", async () => {
  await render(<ScreenWithBankSheet />);

  await openBankSheet();

  // TalkBack's rule, not RNTL's: React Native makes every focusable view clickable on Android, and TalkBack
  // stops on a clickable view whatever `accessible` says.
  const screenReaderStopsUnder = (
    element: typeof screen.container,
  ): (typeof screen.container)[] => {
    if (isHiddenFromAccessibility(element)) return [];
    if (
      element.props.accessible === true ||
      element.props.focusable === true ||
      element.type === "Text" ||
      element.type === "TextInput"
    )
      return [element];
    return element.children.flatMap((child) =>
      typeof child === "string" ? [] : screenReaderStopsUnder(child),
    );
  };
  const [firstStop, secondStop, ...laterStops] = screenReaderStopsUnder(
    screen.container,
  );
  expect(firstStop).toHaveAccessibleName("Banks");
  expect(secondStop).toHaveAccessibleName("Close");
  expect(laterStops).not.toHaveLength(0);
  for (const stop of laterStops) expect(stop).toHaveAccessibleName();
});

it("closes from its close button and gives the screen back", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();

  await fireEvent.press(screen.getByRole("button", { name: "Close" }));

  expect(screen.queryByRole("header", { name: "Banks" })).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Choose a bank" }),
  ).toBeOnTheScreen();
});

it("closes only the top sheet on Android Back", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();
  await fireEvent.press(
    screen.getByRole("button", { name: "Choose a branch" }),
  );

  await pressHardwareBack();

  expect(
    screen.queryByRole("header", { name: "Branches" }),
  ).not.toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Banks" })).toBeOnTheScreen();
});

it("keeps a sheet that may not be dismissed open on Back, with no way to close it, and keeps Back from the screen", async () => {
  const backBehindTheSheet = jest.fn(() => true);
  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    backBehindTheSheet,
  );
  await render(<ScreenWithBankSheet dismissable={false} />);
  await openBankSheet();

  await pressHardwareBack();
  subscription.remove();

  expect(screen.getByRole("header", { name: "Banks" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Close" })).not.toBeOnTheScreen();
  expect(backBehindTheSheet).not.toHaveBeenCalled();
});

it("closes on VoiceOver's escape gesture", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();

  await fireEvent(screen.getByText("Every bank"), "accessibilityEscape");

  expect(screen.queryByRole("header", { name: "Banks" })).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Choose a bank" }),
  ).toBeOnTheScreen();
});

it("keeps a sheet that may not be dismissed open on VoiceOver's escape gesture, and keeps the gesture from what holds the sheet", async () => {
  const escapeOutsideTheSheet = jest.fn();
  await render(
    <View onAccessibilityEscape={escapeOutsideTheSheet}>
      <ScreenWithBankSheet dismissable={false} />
    </View>,
  );
  await openBankSheet();

  await fireEvent(screen.getByText("Every bank"), "accessibilityEscape");

  expect(screen.getByRole("header", { name: "Banks" })).toBeOnTheScreen();
  expect(escapeOutsideTheSheet).not.toHaveBeenCalled();
});

it("tells its mounter when a sheet opens and when the last one closes", async () => {
  const onSheetOpenChange = jest.fn<void, [boolean]>();
  await render(<ScreenWithBankSheet onSheetOpenChange={onSheetOpenChange} />);

  await openBankSheet();
  const reportedWhileOpen = onSheetOpenChange.mock.lastCall;
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));

  expect(reportedWhileOpen).toEqual([true]);
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
});

it("hands what is typed in its search field to its owner", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();

  await fireEvent.changeText(screen.getByLabelText("Search banks"), "Ma");

  expect(screen.getByText("Banks matching Ma")).toBeOnTheScreen();
});
