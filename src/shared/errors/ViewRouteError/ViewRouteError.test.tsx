import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";

import { observedRecords } from "@/test/harness/recording-sink";
import { renderRoute } from "@/test/render-route";

import ViewRouteError from "./ViewRouteError";

let screenCrashes = true;
function ScreenThatCrashes() {
  if (screenCrashes) throw new Error("render failed");
  return <Text>Details</Text>;
}

beforeEach(() => {
  screenCrashes = true;
});

it("puts a crashed screen behind Try again, which renders it afresh", async () => {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: {
      index: { default: ScreenThatCrashes, ErrorBoundary: ViewRouteError },
    },
  });

  expect(
    screen.getByRole("header", { name: "Something went wrong" }),
  ).toBeOnTheScreen();
  expect(screen.getByText("This screen stopped working.")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(observedRecords).toContainEqual({
    type: "error",
    name: "Error",
    properties: { boundary: "route" },
  });

  screenCrashes = false;
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(screen.getByText("Details")).toBeOnTheScreen();
});

it("offers Back to the screen before the one that crashed", async () => {
  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: {
      index: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push("./details");
          }}
        >
          <Text>Open details</Text>
        </Pressable>
      ),
      details: { default: ScreenThatCrashes, ErrorBoundary: ViewRouteError },
    },
  });
  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));

  await fireEvent.press(screen.getByRole("button", { name: "Back" }));

  expect(view.getPathname()).toBe("/");
  expect(
    screen.getByRole("button", { name: "Open details" }),
  ).toBeOnTheScreen();
});
