import { fireEvent, screen } from "@testing-library/react-native";
import { Stack, router } from "expo-router";
import { Pressable, Text } from "react-native";

import { renderRoute } from "./render-route";

it("reports the pathname the user navigated to", async () => {
  const view = await renderRoute("/", {
    _layout: () => <Stack />,
    index: () => (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          // Relative: once Metro generates route types, only the app's real routes type-check.
          router.push("./details");
        }}
      >
        <Text>Open details</Text>
      </Pressable>
    ),
    details: () => <Text accessibilityRole="header">Details</Text>,
  });

  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));

  expect(screen.getByRole("header", { name: "Details" })).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/details");
});
