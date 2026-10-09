import {
  act,
  fireEvent,
  isHiddenFromAccessibility,
  render,
  screen,
} from "@testing-library/react-native";
import { useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  DeviceEventEmitter,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { pressHardwareBack } from "@/test/render/drive-app";

import BottomSheetFrame from "./BottomSheetFrame";

const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function ScreenWithBankSheet({
  dismissable = true,
}: {
  dismissable?: boolean;
}) {
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [branchSheetOpen, setBranchSheetOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  return (
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ViewBottomSheetHost>
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

// TalkBack's rule, not RNTL's: React Native makes every focusable view clickable on Android, and TalkBack
// stops on a clickable view whatever `accessible` says. A scroll view is focusable while it can scroll.
function screenReaderStopsUnder(
  element: typeof screen.container,
): (typeof screen.container)[] {
  if (isHiddenFromAccessibility(element)) return [];
  if (
    element.props.accessible === true ||
    element.props.focusable === true ||
    element.type === "Text" ||
    element.type === "TextInput"
  )
    return [element];
  return [
    ...(element.type === "RCTScrollView" &&
    element.props.scrollEnabled !== false
      ? [element]
      : []),
    ...element.children.flatMap((child) =>
      typeof child === "string" ? [] : screenReaderStopsUnder(child),
    ),
  ];
}

async function openBankSheet() {
  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));
}

afterEach(() => {
  jest.useRealTimers();
});

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

  const [firstStop, secondStop, ...laterStops] = screenReaderStopsUnder(
    screen.container,
  );
  expect(firstStop).toHaveAccessibleName("Banks");
  expect(secondStop).toHaveAccessibleName("Close");
  expect(laterStops).not.toHaveLength(0);
  for (const stop of laterStops) expect(stop).toHaveAccessibleName();
});

it("moves a screen reader to its title a moment after it has opened, once VoiceOver has placed its own focus", async () => {
  jest.useFakeTimers();
  // Jest has no screen reader: the focus request is the nearest thing it can see.
  const focusRequests = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  const titleFocusRequests = () =>
    focusRequests.mock.calls.filter(
      ([target, eventType]) =>
        eventType === "focus" &&
        (target as { props?: { children?: unknown } }).props?.children ===
          "Banks",
    );
  await render(<ScreenWithBankSheet />);

  await openBankSheet();
  const focusRequestsAsItOpens = titleFocusRequests().length;
  await act(() => jest.advanceTimersByTimeAsync(300));
  await act(() => jest.advanceTimersByTimeAsync(500));
  const focusRequestsHalfASecondAfterOpening = titleFocusRequests().length;
  await act(() => jest.advanceTimersByTimeAsync(500));

  expect(focusRequestsAsItOpens).toBe(0);
  expect(focusRequestsHalfASecondAfterOpening).toBe(0);
  expect(titleFocusRequests()).toHaveLength(1);
});

it("gives a screen reader no stop of the body's own, which would read all it holds as one string, while the body fits", async () => {
  await render(<ScreenWithBankSheet />);

  await openBankSheet();

  expect(
    screenReaderStopsUnder(screen.container).map((stop) => stop.type),
  ).not.toContain("RCTScrollView");
});

it("still scrolls a body taller than the sheet", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();
  let body = screen.getByText("Every bank").parent;
  while (body !== null && body.type !== "RCTScrollView") body = body.parent;
  if (body === null) throw new Error("The sheet's body is not a scroll view.");

  await fireEvent(body, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } },
  });
  await fireEvent(body, "contentSizeChange", 390, 900);

  expect(body.props.scrollEnabled).not.toBe(false);
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

it("rides above the keyboard however far below the window's top its host sits", async () => {
  // Jest lays nothing out: these stand in for a host 76 points down an 844-point phone, under a 300-point keyboard.
  jest
    .spyOn(View.prototype, "measureInWindow")
    .mockImplementation((reportPosition) => {
      reportPosition(0, 76, 390, 768);
    });
  await render(<ScreenWithBankSheet />);
  await openBankSheet();
  let keyboardClear = screen.getByRole("header", { name: "Banks" }).parent;
  while (keyboardClear !== null && keyboardClear.props.onLayout === undefined)
    keyboardClear = keyboardClear.parent;
  if (keyboardClear?.parent == null)
    throw new Error("The sheet has no keyboard-avoiding view in a layer.");
  await fireEvent(keyboardClear.parent, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 768 } },
  });
  await fireEvent(keyboardClear, "layout", {
    persist: () => undefined,
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 768 } },
  });

  await act(() => {
    DeviceEventEmitter.emit("keyboardWillShow", {
      duration: 0,
      easing: "keyboard",
      endCoordinates: { screenX: 0, screenY: 544, width: 390, height: 300 },
    });
  });

  expect(keyboardClear).toHaveStyle({ paddingBottom: 300 - 34 });
});

it("hands what is typed in its search field to its owner", async () => {
  await render(<ScreenWithBankSheet />);
  await openBankSheet();

  await fireEvent.changeText(screen.getByLabelText("Search banks"), "Ma");

  expect(screen.getByText("Banks matching Ma")).toBeOnTheScreen();
});
