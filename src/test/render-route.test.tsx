import { fireEvent, screen } from "@testing-library/react-native";
import { Stack, router } from "expo-router";
import { Pressable, Text } from "react-native";

import { renderRoute } from "./render-route";

const navigationRoutes = {
  _layout: () => <Stack />,
  index: () => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        router.push("/details");
      }}
    >
      <Text>Open details</Text>
    </Pressable>
  ),
  details: () => <Text accessibilityRole="header">Details</Text>,
};

it("renders the app's own home route", async () => {
  const view = await renderRoute("/");

  expect(
    screen.getByRole("header", { name: "Ryt Transfer" }),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
});

it("reports the pathname the user navigated to", async () => {
  const view = await renderRoute("/", navigationRoutes);

  await fireEvent.press(screen.getByRole("button", { name: "Open details" }));

  expect(screen.getByRole("header", { name: "Details" })).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/details");
});
